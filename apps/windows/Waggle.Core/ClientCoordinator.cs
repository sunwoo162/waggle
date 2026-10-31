namespace Waggle.Core;

public enum ClientStatus { SignedOut, Ready, Managing, Connecting, Paused, VerificationRequired, WifiUnavailable, PermissionRequired, CleanupRequired }
public sealed class ClientCoordinator(MemberSession session, SchoolConfigSync configs, CollectionSync collection, IWifiAdapter wifi, TimeProvider? timeProvider = null) : IAsyncDisposable
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private readonly WifiPolicy policy = new();
    private CancellationTokenSource? management;
    private long stopEpoch;
    private DateTimeOffset nextRefresh, nextScan, nextWifiRetry;
    private DateTimeOffset? lastTick;
    private string? lastBssid;
    public bool ManagementRequested { get; private set; }
    public bool Running { get; private set; }
    private bool cleanupPending;
    // False after any failed server re-check; Wi-Fi work resumes only after a full successful refresh.
    private bool verified;
    public bool NeedsCleanup => cleanupPending || session.NeedsCleanup;
    public bool HasStoredSession => NeedsCleanup || session.HasStoredSession;
    public Identity? Identity => session.Current;
    public string? Origin => session.Origin;
    public CachedSchoolConfig? School => configs.Current;
    public ClientState? Collection => collection.Current;
    public ClientStatus Status { get; private set; }
    public Failure? LastFailure { get; private set; }
    public WifiFailure? LastWifiFailure { get; private set; }
    public WifiInterface[] Interfaces { get; private set; } = [];
    public Guid? AdapterId { get; private set; }
    public WifiObservation? Observation { get; private set; }
    public DateTimeOffset? LastObservationAt { get; private set; }
    public string? NewlyCollectedApId { get; private set; }
    public WifiReason? DecisionReason { get; private set; }
    private void RequireClean() { if (NeedsCleanup || session.NeedsCleanup) throw new MemberException(Failure.Storage); }
    private void CancelManagement() { try { Volatile.Read(ref management)?.Cancel(); } catch (ObjectDisposedException) { } }
    private void MemberFailed(MemberException error)
    {
        LastFailure = error.Failure; Running = false; verified = false;
        nextRefresh = clock.GetUtcNow().AddSeconds(error.Failure == Failure.RateLimited ? 300 : 60);
        if (error.Failure is not (Failure.Offline or Failure.Unavailable or Failure.RateLimited) || !session.HasStoredSession) { ManagementRequested = false; CancelManagement(); }
        Status = NeedsCleanup || session.NeedsCleanup ? ClientStatus.CleanupRequired : session.HasStoredSession ? ClientStatus.VerificationRequired : ClientStatus.SignedOut;
    }
    private void WifiFailed(WifiException error)
    {
        LastWifiFailure = error.Failure; Running = false; nextWifiRetry = clock.GetUtcNow().AddSeconds(60);
        if (error.Failure is not (WifiFailure.Unavailable or WifiFailure.RadioOff or WifiFailure.Busy)) { ManagementRequested = false; CancelManagement(); }
        Status = error.Failure is WifiFailure.Permission or WifiFailure.LocationPermission ? ClientStatus.PermissionRequired : ClientStatus.WifiUnavailable;
    }
    private async Task RefreshCoreAsync(CancellationToken ct)
    {
        RequireClean();
        var school = await configs.SyncAsync(ct);
        await collection.RefreshAsync(school, ct);
        nextRefresh = clock.GetUtcNow().AddSeconds(60); LastFailure = null; verified = true;
        if (!ManagementRequested) Status = ClientStatus.Ready;
    }
    public async Task LoginAsync(string origin, string code, string deviceName, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try { RequireClean(); await session.LoginAsync(origin, code, deviceName, ct); await RefreshCoreAsync(ct); }
        catch (MemberException error) { MemberFailed(error); throw; }
        finally { gate.Release(); }
    }
    public async Task RestoreAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try { RequireClean(); if (await session.RestoreAsync(ct) is not null) await RefreshCoreAsync(ct); else Status = ClientStatus.SignedOut; }
        catch (MemberException error) { MemberFailed(error); throw; }
        finally { gate.Release(); }
    }
    public async Task RefreshAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try { await RefreshCoreAsync(ct); }
        catch (MemberException error) { MemberFailed(error); throw; }
        finally { gate.Release(); }
    }
    public async Task LoadInterfacesAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try { RequireClean(); Interfaces = await session.WithCurrentAsync((_, _, cancellation) => wifi.InterfacesAsync(cancellation), ct); }
        catch (WifiException error) { WifiFailed(error); throw; }
        finally { gate.Release(); }
    }
    public async Task StartAsync(Guid adapterId, bool consent, CancellationToken ct)
    {
        var epoch = Interlocked.Read(ref stopEpoch);
        await gate.WaitAsync(ct);
        try
        {
            RequireClean();
            if (!consent || adapterId == Guid.Empty) throw new MemberException(Failure.InvalidInput);
            if (epoch != Interlocked.Read(ref stopEpoch)) throw new OperationCanceledException();
            var previous = management; management = CancellationTokenSource.CreateLinkedTokenSource(ct); previous?.Dispose();
            if (epoch != Interlocked.Read(ref stopEpoch)) management.Cancel();
            var token = management.Token; token.ThrowIfCancellationRequested();
            AdapterId = adapterId; ManagementRequested = true; Running = false;
            await RefreshCoreAsync(token);
            if (configs.Current is not { Config.Networks.Length: > 0, Config.AccessPoints.Length: > 0 }) throw new MemberException(Failure.InvalidInput);
            Interfaces = await wifi.InterfacesAsync(token);
            if (!Interfaces.Any(i => i.Id == adapterId)) throw new WifiException(WifiFailure.Unavailable);
            policy.Reset(); lastTick = null; nextScan = nextWifiRetry = DateTimeOffset.MinValue; lastBssid = null;
            await collection.LogAsync(LocalEventKind.Started, null, clock.GetUtcNow(), token);
            await TickCoreAsync(token);
        }
        catch (MemberException error) { MemberFailed(error); throw; }
        catch (WifiException error) { WifiFailed(error); throw; }
        catch (OperationCanceledException) { ManagementRequested = Running = false; Status = ClientStatus.Paused; throw; }
        finally { gate.Release(); }
    }
    public async Task TickAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            if (!ManagementRequested || management is null) return;
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, management.Token);
            await TickCoreAsync(linked.Token);
        }
        catch (MemberException error) { MemberFailed(error); throw; }
        catch (WifiException error) { WifiFailed(error); throw; }
        catch (OperationCanceledException) { if (management?.IsCancellationRequested == true) { ManagementRequested = Running = false; Status = ClientStatus.Paused; } throw; }
        finally { gate.Release(); }
    }
    private async Task TickCoreAsync(CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var now = clock.GetUtcNow();
        if (session.Current is { } identity && identity.Device.ExpiresAt <= now.ToUnixTimeMilliseconds())
        {
            await session.CheckAsync(ct); throw new MemberException(Failure.Unauthorized);
        }
        if (lastTick is { } tick && now - tick < TimeSpan.FromSeconds(10)) return;
        lastTick = now; NewlyCollectedApId = null;
        if (!verified || session.Current is null || configs.Current is null || now >= nextRefresh)
        {
            if ((!verified || !Running) && now < nextRefresh) return;
            await RefreshCoreAsync(ct);
        }
        if (now < nextWifiRetry) return;
        var school = configs.Current ?? throw new MemberException(Failure.Unauthorized);
        var adapterId = AdapterId ?? throw new MemberException(Failure.InvalidInput);
        var observation = await wifi.ObserveAsync(adapterId, ct);
        ct.ThrowIfCancellationRequested(); now = clock.GetUtcNow();
        Observation = observation; LastObservationAt = lastTick = now; Running = true; LastWifiFailure = null;
        var actual = WifiMatch.ConnectedAp(school.Config, observation.Connection);
        if (actual is not null && observation.Connection!.Bssid != lastBssid) await collection.LogAsync(LocalEventKind.Connected, observation.Connection.Ssid, now, ct);
        lastBssid = observation.Connection?.Bssid;
        if (await collection.RecordAsync(school, observation.Connection, now, ct)) NewlyCollectedApId = actual?.Id;
        if (now >= nextScan)
        {
            nextScan = now.AddSeconds(60);
            try { await wifi.ScanAsync(adapterId, ct); } catch (WifiException error) when (error.Failure == WifiFailure.Busy) { }
        }
        ct.ThrowIfCancellationRequested();
        var decision = policy.Decide(school.Config, observation, now); DecisionReason = decision.Reason;
        if (policy.TimedOutApId is { } timedOut)
        {
            var ap = school.Config.AccessPoints.FirstOrDefault(a => a.Id == timedOut);
            var ssid = school.Config.Networks.FirstOrDefault(n => n.Id == ap?.NetworkId)?.Ssid;
            await collection.LogAsync(LocalEventKind.TimedOut, ssid, now, ct);
        }
        Status = decision.Action == WifiAction.Wait ? ClientStatus.Connecting : ClientStatus.Managing;
        if (decision.Target is not { } target || decision.Action != WifiAction.Connect) return;
        try
        {
            ct.ThrowIfCancellationRequested();
            await wifi.ConnectAsync(adapterId, ServiceOrigin.Parse(school.Origin), target.Network, target.Bssid, ct);
            policy.Requested(target, clock.GetUtcNow()); Status = ClientStatus.Connecting;
            await collection.LogAsync(LocalEventKind.Requested, target.Network.Ssid, clock.GetUtcNow(), ct);
        }
        catch (WifiException error) when (error.Failure is WifiFailure.ProfileRejected or WifiFailure.Unavailable or WifiFailure.Busy)
        {
            policy.Failed(target.ApId, clock.GetUtcNow()); LastWifiFailure = error.Failure;
            await collection.LogAsync(LocalEventKind.Failed, target.Network.Ssid, clock.GetUtcNow(), ct);
        }
    }
    public async Task PauseAsync(CancellationToken ct)
    {
        Interlocked.Increment(ref stopEpoch); CancelManagement();
        await gate.WaitAsync(ct);
        try
        {
            CancelManagement(); ManagementRequested = Running = false; NewlyCollectedApId = null; policy.Reset();
            Status = HasStoredSession ? ClientStatus.Paused : ClientStatus.SignedOut;
            if (session.Current is not null) await collection.LogAsync(LocalEventKind.Paused, null, clock.GetUtcNow(), ct);
        }
        finally { gate.Release(); }
    }
    public async Task<bool> LogoutAsync(CancellationToken ct)
    {
        Interlocked.Increment(ref stopEpoch); CancelManagement();
        // Once requested, logout must finish local cleanup even while the window is closing.
        await gate.WaitAsync();
        try
        {
            CancelManagement(); ManagementRequested = Running = verified = false; Observation = null; LastObservationAt = null; NewlyCollectedApId = null; policy.Reset();
            var remote = false;
            try { remote = await session.LogoutAsync(CancellationToken.None); } catch (Exception) { /* Local cleanup below is always attempted. */ }
            var failed = session.NeedsCleanup || session.HasStoredSession;
            try { await configs.ClearAsync(CancellationToken.None); } catch { failed = true; }
            try { await collection.ClearAsync(CancellationToken.None); } catch { failed = true; }
            cleanupPending = failed; Status = failed ? ClientStatus.CleanupRequired : ClientStatus.SignedOut;
            if (failed) throw new MemberException(Failure.Storage);
            return remote;
        }
        finally { gate.Release(); }
    }
    public async Task ClearHistoryAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try { RequireClean(); await collection.ClearHistoryAsync(ct); }
        finally { gate.Release(); }
    }
    public async ValueTask DisposeAsync()
    {
        Interlocked.Increment(ref stopEpoch); CancelManagement();
        await gate.WaitAsync();
        try { ManagementRequested = Running = false; wifi.Dispose(); management?.Dispose(); }
        finally { gate.Release(); }
    }
}
