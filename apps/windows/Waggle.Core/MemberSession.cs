namespace Waggle.Core;

public sealed class MemberSession(ISessionStore store, Func<Uri, IMemberApi> createApi)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private StoredSession? saved;
    private string? lastOrigin;
    public Identity? Current { get; private set; }
    // Pending cleanup means a persisted file may still exist, even after a failed first save.
    public bool HasStoredSession => saved is not null || NeedsCleanup;
    public bool NeedsCleanup { get; private set; }
    public string? Origin => lastOrigin;

    public async Task<Identity?> RestoreAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            if (NeedsCleanup) throw new MemberException(Failure.Storage);
            try { saved = await store.LoadAsync(ct); }
            catch (Exception ex) when (ex is not OperationCanceledException) { throw new MemberException(Failure.Storage); }
            return saved is null ? null : await CheckCoreAsync(ct);
        }
        finally { gate.Release(); }
    }
    public async Task<Identity> LoginAsync(string origin, string code, string deviceName, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            if (NeedsCleanup) throw new MemberException(Failure.Storage);
            if (saved is not null) throw new MemberException(Failure.InvalidInput);
            var uri = ServiceOrigin.Parse(origin);
            lastOrigin = uri.AbsoluteUri;
            using var api = createApi(uri);
            var tokens = await api.LoginAsync(code, deviceName, ct);
            await SaveAsync(new(uri.AbsoluteUri, tokens), api);
            return await CheckCoreAsync(ct);
        }
        finally { gate.Release(); }
    }
    public async Task<Identity> CheckAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try { return await CheckCoreAsync(ct); }
        finally { gate.Release(); }
    }
    public Task<CachedSchoolConfig> DownloadSchoolConfigAsync(CancellationToken ct) =>
        WithSchoolConfigAsync((value, _) => Task.FromResult(value), ct);
    internal async Task<T> WithSchoolConfigAsync<T>(Func<CachedSchoolConfig, CancellationToken, Task<T>> accept, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            var refreshed = false;
            var identity = await CheckCoreAsync(ct, onRefresh: () => refreshed = true);
            if (saved is null || lastOrigin is null) throw new MemberException(Failure.Unauthorized);
            using var api = createApi(ServiceOrigin.Parse(lastOrigin));
            try
            {
                SchoolConfig config;
                try { config = await api.GetSchoolConfigAsync(saved.Tokens.AccessToken, ct); }
                catch (MemberException ex) when (ex.Failure == Failure.Unauthorized && !refreshed)
                {
                    var next = await api.RefreshAsync(saved.Tokens.RefreshToken, ct);
                    await SaveAsync(saved with { Tokens = next }, api);
                    identity = await CheckCoreAsync(ct, allowRefresh: false);
                    config = await api.GetSchoolConfigAsync(next.AccessToken, ct);
                }
                // Cache persistence and publication share the authentication lock with logout.
                return await accept(new(lastOrigin, identity.Member.Id, config), ct);
            }
            catch (MemberException ex) when (ex.Failure == Failure.Unauthorized) { await ForgetAsync(); throw; }
        }
        finally { gate.Release(); }
    }
    private async Task<Identity> CheckCoreAsync(CancellationToken ct, bool allowRefresh = true, Action? onRefresh = null)
    {
        Current = null;
        if (NeedsCleanup) throw new MemberException(Failure.Storage);
        if (saved is null) throw new MemberException(Failure.Unauthorized);
        try
        {
            var uri = ServiceOrigin.Parse(saved.Origin);
            lastOrigin = uri.AbsoluteUri;
            saved.Tokens.Validate();
            if (saved.Tokens.RefreshExpiresAt <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) throw new MemberException(Failure.Unauthorized);
            using var api = createApi(uri);
            try { Current = await api.MeAsync(saved.Tokens.AccessToken, ct); }
            catch (MemberException ex) when (ex.Failure == Failure.Unauthorized && allowRefresh)
            {
                onRefresh?.Invoke();
                var next = await api.RefreshAsync(saved.Tokens.RefreshToken, ct);
                await SaveAsync(saved with { Tokens = next }, api);
                Current = await api.MeAsync(next.AccessToken, ct);
            }
            return Current;
        }
        catch (MemberException ex) when (ex.Failure is Failure.Unauthorized or Failure.InvalidInput or Failure.InvalidResponse)
        {
            await ForgetAsync(); throw;
        }
    }
    private async Task SaveAsync(StoredSession value, IMemberApi api)
    {
        try { await store.SaveAsync(value, CancellationToken.None); saved = value; }
        catch
        {
            try { await api.LogoutAsync(value.Tokens.RefreshToken, CancellationToken.None); } catch (MemberException) { }
            await ForgetAsync(); throw new MemberException(Failure.Storage);
        }
    }
    private async Task ForgetAsync()
    {
        Current = null;
        NeedsCleanup = true;
        try { await store.ClearAsync(CancellationToken.None); saved = null; NeedsCleanup = false; }
        catch { throw new MemberException(Failure.Storage); }
    }
    public async Task<bool> LogoutAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            var revoked = true;
            try
            {
                if (saved is not null)
                {
                    using var api = createApi(ServiceOrigin.Parse(saved.Origin));
                    await api.LogoutAsync(saved.Tokens.RefreshToken, ct);
                }
            }
            catch (MemberException) { revoked = false; }
            finally { await ForgetAsync(); }
            return revoked;
        }
        finally { gate.Release(); }
    }
}
