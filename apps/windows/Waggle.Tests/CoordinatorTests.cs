using Waggle.Core;
namespace Waggle.Tests;

[TestClass]
public sealed class CoordinatorTests
{
    internal sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = WifiPolicyTests.Now;
        public override DateTimeOffset GetUtcNow() => Now;
        public void Advance(int seconds) => Now = Now.AddSeconds(seconds);
    }
    internal sealed class Adapter : IWifiAdapter
    {
        public WifiObservation Observation = WifiPolicyTests.Observation(65); public int Observations, Scans, Requests;
        public TaskCompletionSource? Observing, ReleaseObserve; public WifiFailure? ScanError;
        public Task<WifiInterface[]> InterfacesAsync(CancellationToken ct) => Task.FromResult(new[] { new WifiInterface(NativeWifiTests.AdapterId, "합성 어댑터") });
        public async Task<WifiObservation> ObserveAsync(Guid id, CancellationToken ct) { Observations++; if (ReleaseObserve is not null) { Observing!.TrySetResult(); await ReleaseObserve.Task.WaitAsync(ct); } return Observation; }
        public Task ScanAsync(Guid id, CancellationToken ct) { Scans++; if (ScanError is { } error) throw new WifiException(error); return Task.CompletedTask; }
        public Task ConnectAsync(Guid id, Uri origin, NetworkConfig network, string bssid, CancellationToken ct) { ct.ThrowIfCancellationRequested(); Requests++; return Task.CompletedTask; }
        public List<Uri?> Kept = []; public bool FailRemove;
        public Task RemoveProfilesExceptAsync(Uri? keep, CancellationToken ct) { if (FailRemove) throw new WifiException(WifiFailure.Unavailable); Kept.Add(keep); return Task.CompletedTask; }
        public void Dispose() { }
    }
    internal sealed class ConfigStore : ISchoolConfigStore
    {
        public CachedSchoolConfig? Value; public bool FailClear; public int Clears;
        public Task<CachedSchoolConfig?> LoadAsync(CancellationToken ct) => Task.FromResult(Value);
        public Task SaveAsync(CachedSchoolConfig value, CancellationToken ct) { Value = value; return Task.CompletedTask; }
        public Task ClearAsync(CancellationToken ct) { Clears++; if (FailClear) throw new IOException("synthetic_clear"); Value = null; return Task.CompletedTask; }
    }
    private static async Task<(ClientCoordinator Client, SessionTests.Api Api, Adapter Wifi, Clock Time, ConfigStore Config, CollectionSyncTests.Store State)> Setup()
    {
        var clock = new Clock(); var api = new SessionTests.Api { Config = WifiPolicyTests.Config, Catalog = CollectionSyncTests.Catalog() };
        var session = new MemberSession(new SessionTests.Store(), _ => api, clock);
        var config = new ConfigStore(); var state = new CollectionSyncTests.Store(); var wifi = new Adapter();
        var client = new ClientCoordinator(session, new(session, config), new(session, state), wifi, clock);
        await client.LoginAsync("https://waggle.example", "synthetic-code", "검증", default);
        return (client, api, wifi, clock, config, state);
    }
    [TestMethod]
    public async Task ConsentAndActiveSettingsAreRequiredBeforeAnyWifiMutation()
    {
        var f = await Setup();
        Assert.AreEqual(Failure.InvalidInput, (await Assert.ThrowsAsync<MemberException>(() => f.Client.StartAsync(NativeWifiTests.AdapterId, false, default))).Failure);
        Assert.AreEqual(0, f.Wifi.Observations); Assert.AreEqual(0, f.Wifi.Requests);
        f.Api.Config = new(1, 2, [], []); f.Api.Catalog = new(1, 2, []);
        await Assert.ThrowsAsync<MemberException>(() => f.Client.StartAsync(NativeWifiTests.AdapterId, true, default));
        Assert.AreEqual(0, f.Wifi.Requests); Assert.IsFalse(f.Client.ManagementRequested);
    }
    [TestMethod]
    public async Task SsidOnlyRoomsStartManagementAndRequestAnotherRoom()
    {
        var f = await Setup(); f.Api.Config = WifiPolicyTests.Rooms with { Version = 2 }; f.Api.Catalog = new(1, 2, []);
        f.Wifi.Observation = new(null, [new("GSM-3-2", "02:bb:00:00:00:07", true, 80, WifiPolicyTests.Now)]);
        await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default);
        Assert.IsTrue(f.Client.ManagementRequested); Assert.AreEqual(1, f.Wifi.Requests);
    }
    [TestMethod]
    public async Task AcceptedRequestNeverCollectsUntilOsReportsTheActualAp()
    {
        var f = await Setup(); f.Wifi.Observation = WifiPolicyTests.Observation() with { Connection = null };
        f.Api.Catalog = new(1, 2, [.. CollectionSyncTests.Catalog().Characters, new(WifiPolicyTests.Config.AccessPoints[1].Id, "둘째 친구", "", null)]);
        await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default);
        Assert.AreEqual(1, f.Wifi.Requests); Assert.HasCount(0, f.State.Value!.Pending);
        f.Time.Advance(10); f.Wifi.Observation = WifiPolicyTests.Observation(70) with { Connection = new(" QA 학교망 ", "02:00:00:00:00:02", "wpa2-personal", 70) };
        await f.Client.TickAsync(default);
        Assert.HasCount(1, f.State.Value.Pending); Assert.AreEqual(WifiPolicyTests.Config.AccessPoints[1].Id, f.Client.NewlyCollectedApId);
    }
    [TestMethod]
    public async Task StableConnectionAndCoalescedTicksAvoidRepeatedScanningOrRequests()
    {
        var f = await Setup(); await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default);
        await Task.WhenAll(f.Client.TickAsync(default), f.Client.TickAsync(default));
        Assert.AreEqual(1, f.Wifi.Observations);
        for (var i = 0; i < 6; i++) { f.Time.Advance(10); await f.Client.TickAsync(default); }
        Assert.AreEqual(0, f.Wifi.Requests); Assert.AreEqual(2, f.Wifi.Scans);
        await f.Client.PauseAsync(default); f.Time.Advance(10); await f.Client.TickAsync(default);
        Assert.IsFalse(f.Client.ManagementRequested); Assert.IsFalse(f.Client.Running); Assert.AreEqual(7, f.Wifi.Observations);
    }
    [TestMethod]
    public async Task ServerFailureSuspendsNewWifiAndRecoversAfterVerifiedRetry()
    {
        var f = await Setup(); await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default);
        f.Api.Offline = true; f.Time.Advance(60);
        await Assert.ThrowsAsync<MemberException>(() => f.Client.TickAsync(default));
        Assert.IsTrue(f.Client.ManagementRequested); Assert.IsFalse(f.Client.Running); Assert.AreEqual(1, f.Wifi.Observations);
        f.Api.Offline = false; f.Time.Advance(60); await f.Client.TickAsync(default);
        Assert.IsTrue(f.Client.Running); Assert.AreEqual(2, f.Wifi.Observations);
    }
    [TestMethod]
    public async Task FailedRevalidationKeepsWifiStoppedUntilAFullRefreshSucceeds()
    {
        var f = await Setup(); await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default);
        f.Wifi.Observation = WifiPolicyTests.Observation() with { Connection = null };
        f.Api.CatalogOffline = true; f.Time.Advance(60);
        await Assert.ThrowsAsync<MemberException>(() => f.Client.TickAsync(default));
        f.Api.CatalogOffline = false;
        for (var i = 0; i < 5; i++) { f.Time.Advance(10); await f.Client.TickAsync(default); }
        Assert.AreEqual(1, f.Wifi.Observations); Assert.AreEqual(0, f.Wifi.Requests); Assert.AreEqual(ClientStatus.VerificationRequired, f.Client.Status);
        f.Time.Advance(10); await f.Client.TickAsync(default);
        Assert.IsTrue(f.Client.Running); Assert.AreEqual(2, f.Wifi.Observations);
    }
    [TestMethod]
    public async Task RateLimitedRevalidationWaitsFullBackoffBeforeAnyWifiWork()
    {
        var f = await Setup(); await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default);
        f.Api.Limited = true; f.Time.Advance(60);
        await Assert.ThrowsAsync<MemberException>(() => f.Client.TickAsync(default));
        f.Api.Limited = false;
        for (var i = 0; i < 29; i++) { f.Time.Advance(10); await f.Client.TickAsync(default); }
        Assert.AreEqual(1, f.Wifi.Observations); Assert.AreEqual(0, f.Wifi.Requests);
        f.Time.Advance(10); await f.Client.TickAsync(default);
        Assert.IsTrue(f.Client.Running); Assert.AreEqual(2, f.Wifi.Observations);
    }
    [TestMethod]
    public async Task OnlyAnUnregisteredConnectedWifiCanBeRequestedOnUserAction()
    {
        var f = await Setup(); await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default);
        Assert.IsFalse(f.Client.CanRequestCurrentWifi);
        await Assert.ThrowsAsync<MemberException>(() => f.Client.RequestCurrentWifiAsync("3층 2반", "synthetic-room-pass", default));
        f.Wifi.Observation = WifiPolicyTests.Observation() with { Connection = new("GSM-NEW-ROOM", "02:cc:00:00:00:01", "wpa2-personal", 70) };
        f.Time.Advance(10); await f.Client.TickAsync(default);
        Assert.IsTrue(f.Client.CanRequestCurrentWifi); Assert.HasCount(0, f.Api.WifiRequests);
        await f.Client.RequestCurrentWifiAsync("3층 2반", "synthetic-room-pass", default);
        Assert.AreEqual(new WifiRequestInput("3층 2반", "GSM-NEW-ROOM", "wpa2-personal", "synthetic-room-pass"), f.Api.WifiRequests.Single());
        Assert.DoesNotContain("synthetic-room-pass", f.Api.WifiRequests.Single().ToString());
        f.Wifi.Observation = WifiPolicyTests.Observation() with { Connection = new("회사망", "02:cc:00:00:00:02", "unsupported", 70) };
        f.Time.Advance(10); await f.Client.TickAsync(default);
        Assert.IsFalse(f.Client.CanRequestCurrentWifi);
    }
    [TestMethod]
    public async Task ServerConflictDuringRefreshKeepsManagementOnLikeOtherTemporaryFailures()
    {
        var f = await Setup(); await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default);
        f.Api.CollectionConflict = true; f.Time.Advance(60);
        await Assert.ThrowsAsync<MemberException>(() => f.Client.TickAsync(default));
        Assert.IsTrue(f.Client.ManagementRequested);
        f.Api.CollectionConflict = false; f.Time.Advance(60); await f.Client.TickAsync(default);
        Assert.IsTrue(f.Client.Running);
    }
    [TestMethod]
    public async Task ResumingWhileOfflineKeepsManagementRequestedAndRecoversLater()
    {
        var f = await Setup(); f.Api.Offline = true;
        await Assert.ThrowsAsync<MemberException>(() => f.Client.StartAsync(NativeWifiTests.AdapterId, true, default));
        Assert.IsTrue(f.Client.ManagementRequested); Assert.AreEqual(0, f.Wifi.Observations);
        f.Api.Offline = false; f.Time.Advance(60); await f.Client.TickAsync(default);
        Assert.IsTrue(f.Client.Running); Assert.AreEqual(1, f.Wifi.Observations);
    }
    [TestMethod]
    public async Task DeletingTheAccountClearsEverythingLocalAndRemovesWifiProfiles()
    {
        var f = await Setup(); await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default);
        await f.Client.DeleteAccountAsync(default);
        Assert.AreEqual(1, f.Api.Deleted); Assert.IsFalse(f.Client.HasStoredSession); Assert.IsNull(f.Config.Value);
        Assert.IsNull(f.State.Value); Assert.AreEqual(ClientStatus.SignedOut, f.Client.Status); Assert.IsNull(f.Wifi.Kept[^1]);
    }
    [TestMethod]
    public async Task AlreadyDeletedAccountStillCleansThisDevice()
    {
        var f = await Setup(); f.Api.Revoked = true;
        await f.Client.DeleteAccountAsync(default);
        Assert.IsFalse(f.Client.HasStoredSession); Assert.IsNull(f.Config.Value); Assert.AreEqual(ClientStatus.SignedOut, f.Client.Status);
    }
    [TestMethod]
    public async Task PauseCancelsSlowObservationBeforeItCanConnect()
    {
        var f = await Setup(); await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default);
        f.Time.Advance(10); f.Wifi.Observation = WifiPolicyTests.Observation() with { Connection = null };
        f.Wifi.Observing = new(TaskCreationOptions.RunContinuationsAsynchronously); f.Wifi.ReleaseObserve = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var tick = f.Client.TickAsync(default); await f.Wifi.Observing.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var pause = f.Client.PauseAsync(default);
        await Assert.ThrowsAsync<OperationCanceledException>(() => tick);
        await pause.WaitAsync(TimeSpan.FromSeconds(5)); Assert.AreEqual(0, f.Wifi.Requests); Assert.IsFalse(f.Client.Running);
    }
    [TestMethod]
    public async Task ProfileCleanupRemovesOtherServicesAndNeverBlocksSignIn()
    {
        var f = await Setup();
        Assert.AreEqual(new Uri("https://waggle.example"), f.Wifi.Kept.Single());
        await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default); f.Wifi.FailRemove = true;
        await f.Client.LogoutAsync(default);
        Assert.IsTrue(f.Client.ProfileCleanupPending); Assert.IsFalse(f.Client.NeedsCleanup); Assert.AreEqual(ClientStatus.SignedOut, f.Client.Status);
        f.Wifi.FailRemove = false; await f.Client.RestoreAsync(default);
        Assert.IsNull(f.Wifi.Kept[^1]); Assert.IsFalse(f.Client.ProfileCleanupPending);
        await f.Client.LoginAsync("https://waggle.example", "synthetic-code", "검증", default);
        Assert.AreEqual(new Uri("https://waggle.example"), f.Wifi.Kept[^1]);
    }
    [TestMethod]
    public async Task LogoutAttemptsAllStoresAndBlocksLoginUntilCleanupRetry()
    {
        var f = await Setup(); await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default); f.Config.FailClear = true;
        Assert.AreEqual(Failure.Storage, (await Assert.ThrowsAsync<MemberException>(() => f.Client.LogoutAsync(default))).Failure);
        Assert.IsNull(f.State.Value); Assert.IsTrue(f.Client.NeedsCleanup); Assert.IsNull(f.Client.Identity); Assert.IsFalse(f.Client.ManagementRequested);
        await Assert.ThrowsAsync<MemberException>(() => f.Client.LoginAsync("https://waggle.example", "synthetic-code", "검증", default));
        f.Config.FailClear = false; await f.Client.LogoutAsync(default);
        Assert.IsFalse(f.Client.NeedsCleanup); Assert.IsFalse(f.Client.HasStoredSession); Assert.IsNull(f.Config.Value);
    }
    [TestMethod]
    public async Task AbsoluteExpiryStopsWithoutObservingOrRequestingAnotherConnection()
    {
        var f = await Setup(); await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default);
        f.Time.Advance(32 * 24 * 60 * 60);
        await Assert.ThrowsAsync<MemberException>(() => f.Client.TickAsync(default));
        Assert.IsFalse(f.Client.ManagementRequested); Assert.IsFalse(f.Client.Running); Assert.AreEqual(1, f.Wifi.Observations); Assert.AreEqual(0, f.Wifi.Requests);
    }
    [TestMethod]
    public async Task BusyScanDoesNotStopButLocationDenialRequiresUserAction()
    {
        var f = await Setup(); f.Wifi.ScanError = WifiFailure.Busy;
        await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default); Assert.IsTrue(f.Client.Running);
        await f.Client.PauseAsync(default); f.Wifi.ScanError = WifiFailure.LocationPermission;
        await Assert.ThrowsAsync<WifiException>(() => f.Client.StartAsync(NativeWifiTests.AdapterId, true, default));
        Assert.IsFalse(f.Client.ManagementRequested); Assert.AreEqual(ClientStatus.PermissionRequired, f.Client.Status); Assert.AreEqual(0, f.Wifi.Requests);
    }
    [TestMethod]
    public async Task ThreeSpacedWeakSamplesTriggerOnlyOneRequest()
    {
        var f = await Setup(); f.Wifi.Observation = WifiPolicyTests.Observation();
        await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default);
        await f.Client.TickAsync(default); Assert.AreEqual(0, f.Wifi.Requests);
        f.Time.Advance(10); await f.Client.TickAsync(default); Assert.AreEqual(0, f.Wifi.Requests);
        f.Time.Advance(10); await f.Client.TickAsync(default); Assert.AreEqual(1, f.Wifi.Requests);
        f.Time.Advance(10); await f.Client.TickAsync(default); Assert.AreEqual(1, f.Wifi.Requests);
    }
    [TestMethod]
    public async Task UnconfirmedRequestRecordsTimeoutWithoutAwardingCharacter()
    {
        var f = await Setup(); f.Wifi.Observation = WifiPolicyTests.Observation() with { Connection = null };
        await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default); f.Time.Advance(31); await f.Client.TickAsync(default);
        Assert.IsTrue(f.State.Value!.History.Any(e => e.Kind == LocalEventKind.TimedOut));
        Assert.HasCount(0, f.State.Value.Pending); Assert.AreEqual(1, f.Wifi.Requests);
    }
    [TestMethod]
    public async Task LogoutStillClearsAllLocalCredentialsWhenCallerCancellationIsAlreadyRequested()
    {
        var f = await Setup(); await f.Client.StartAsync(NativeWifiTests.AdapterId, true, default);
        using var ct = new CancellationTokenSource(); ct.Cancel();
        await f.Client.LogoutAsync(ct.Token);
        Assert.IsFalse(f.Client.HasStoredSession); Assert.IsNull(f.Client.Identity); Assert.IsNull(f.Config.Value); Assert.IsNull(f.State.Value);
    }
}
