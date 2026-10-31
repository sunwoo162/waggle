namespace Waggle.Core;

public sealed class CollectionSync(MemberSession session, IClientStateStore store)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private ClientState? current;
    public ClientState? Current => current is { } value && !session.NeedsCleanup && session.Current is { } identity && identity.Member.Id == value.MemberId && identity.Device.ExpiresAt > DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() && session.Origin == value.Origin ? value : null;
    private static void Owner(CachedSchoolConfig school, Identity identity, string origin)
    {
        school.Validate();
        if (school.MemberId != identity.Member.Id || school.Origin != origin) throw new MemberException(Failure.InvalidResponse);
    }
    private async Task<ClientState> LoadAsync(Identity identity, string origin, CancellationToken ct)
    {
        ClientState? previous;
        try { previous = await store.LoadAsync(ct); previous?.Validate(); }
        catch (Exception ex) when (ex is not OperationCanceledException) { throw new MemberException(Failure.Storage); }
        return previous?.Origin == origin && previous.MemberId == identity.Member.Id ? previous : new(origin, identity.Member.Id, new(1, 0, []), new(1, []), [], []);
    }
    private async Task<ClientState> SaveAsync(ClientState value, CancellationToken ct)
    {
        value.Validate();
        try { await store.SaveAsync(value, ct); }
        catch (Exception ex) when (ex is not OperationCanceledException) { throw new MemberException(Failure.Storage); }
        return current = value;
    }
    public async Task<ClientState> RefreshAsync(CachedSchoolConfig school, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            return await session.WithAccessAsync(async (identity, origin, api, token, cancellation) =>
            {
                Owner(school, identity, origin);
                var previous = await LoadAsync(identity, origin, cancellation);
                var catalog = await api.GetEncyclopediaAsync(token, cancellation); catalog.Validate();
                if (catalog.Version < previous.Catalog.Version || catalog.Version == previous.Catalog.Version && !catalog.EquivalentTo(previous.Catalog)) throw new MemberException(Failure.InvalidResponse);
                // Fifty worst-case escaped 32-byte SSIDs still fit the server's 16 KiB body limit.
                var batch = previous.Pending.Where(p => p.Matches(school.Config)).Take(50).ToArray();
                var collected = await api.SyncCollectionAsync(token, batch, cancellation); collected.Validate();
                var confirmed = collected.ApIds.ToHashSet(StringComparer.Ordinal);
                // The server accepted the whole batch; reports it did not collect (unpublished character) are not retried later.
                var sent = batch.ToHashSet();
                return await SaveAsync(previous with { Catalog = catalog, Collected = collected, Pending = previous.Pending.Where(p => !confirmed.Contains(p.ApId) && !sent.Contains(p)).ToArray() }, cancellation);
            }, ct);
        }
        catch (MemberException ex) when (ex.Failure == Failure.Unauthorized) { current = null; throw; }
        finally { gate.Release(); }
    }
    public async Task<bool> RecordAsync(CachedSchoolConfig school, ConnectedWifi? connection, DateTimeOffset now, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            return await session.WithCurrentAsync(async (identity, origin, cancellation) =>
            {
                Owner(school, identity, origin);
                var ap = WifiMatch.ConnectedAp(school.Config, connection);
                if (ap is null) return false;
                var previous = await LoadAsync(identity, origin, cancellation);
                if (previous.Collected.ApIds.Contains(ap.Id)) return false;
                // Only characters in the published catalog are collectable; no retroactive collection.
                if (!previous.Catalog.Characters.Any(c => c.Id == ap.Id)) return false;
                var network = school.Config.Networks.Single(n => n.Id == ap.NetworkId);
                // Report the BSSID actually observed; the server accepts any BSSID of the physical AP.
                var report = new ConnectionReport(ap.Id, network.Ssid, connection!.Bssid);
                var existing = previous.Pending.FirstOrDefault(p => p.ApId == ap.Id);
                if (existing == report) return false;
                await SaveAsync(previous with { Pending = [.. previous.Pending.Where(p => p.ApId != ap.Id), report], History = existing is null ? [.. previous.History.TakeLast(199), new(now.ToUnixTimeMilliseconds(), LocalEventKind.Collected, network.Ssid)] : previous.History }, cancellation);
                return existing is null;
            }, ct);
        }
        finally { gate.Release(); }
    }
    public async Task LogAsync(LocalEventKind kind, string? ssid, DateTimeOffset now, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            await session.WithCurrentAsync(async (identity, origin, cancellation) =>
            {
                var previous = await LoadAsync(identity, origin, cancellation);
                return await SaveAsync(previous with { History = [.. previous.History.TakeLast(199), new(now.ToUnixTimeMilliseconds(), kind, ssid)] }, cancellation);
            }, ct);
        }
        finally { gate.Release(); }
    }
    public async Task ClearHistoryAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            await session.WithCurrentAsync(async (identity, origin, cancellation) =>
            {
                var previous = await LoadAsync(identity, origin, cancellation);
                return await SaveAsync(previous with { History = [] }, cancellation);
            }, ct);
        }
        finally { gate.Release(); }
    }
    public async Task ClearAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try { current = null; await store.ClearAsync(ct); }
        catch (Exception ex) when (ex is not OperationCanceledException) { throw new MemberException(Failure.Storage); }
        finally { gate.Release(); }
    }
}
