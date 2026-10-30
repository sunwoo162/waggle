namespace Waggle.Core;

public sealed class SchoolConfigSync(MemberSession session, ISchoolConfigStore store)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private CachedSchoolConfig? current;
    public CachedSchoolConfig? Current
    {
        get => current is { } value && !session.NeedsCleanup && session.Current?.Member.Id == value.MemberId && session.Origin == value.Origin ? value : null;
        private set => current = value;
    }
    public async Task<CachedSchoolConfig> SyncAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            var incoming = await session.DownloadSchoolConfigAsync(ct);
            incoming.Validate();
            CachedSchoolConfig? previous;
            try { previous = await store.LoadAsync(ct); }
            catch (Exception ex) when (ex is not OperationCanceledException) { throw new MemberException(Failure.Storage); }
            if (previous?.Origin == incoming.Origin && previous.MemberId == incoming.MemberId)
            {
                if (incoming.Config.Version < previous.Config.Version || incoming.Config.Version == previous.Config.Version && !incoming.Config.EquivalentTo(previous.Config))
                    throw new MemberException(Failure.InvalidResponse);
                if (incoming.Config.EquivalentTo(previous.Config)) return Current = previous;
            }
            try { await store.SaveAsync(incoming, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException) { throw new MemberException(Failure.Storage); }
            return Current = incoming;
        }
        catch (MemberException ex) when (ex.Failure == Failure.Unauthorized) { Current = null; throw; }
        finally { gate.Release(); }
    }
    public async Task ClearAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try { Current = null; await store.ClearAsync(ct); }
        catch (Exception ex) when (ex is not OperationCanceledException) { throw new MemberException(Failure.Storage); }
        finally { gate.Release(); }
    }
}
