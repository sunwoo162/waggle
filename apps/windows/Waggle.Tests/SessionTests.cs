using Waggle.Core;
namespace Waggle.Tests;

[TestClass]
public sealed class SessionTests
{
    [TestMethod]
    public async Task LoginPersistsAndRestoresAfterRestart()
    {
        var store = new Store(); var api = new Api(); var session = new MemberSession(store, _ => api);
        Assert.AreEqual("합성 이용자", (await session.LoginAsync("https://waggle.example", "synthetic-code", "검증", default)).Member.Alias);
        Assert.IsNotNull(store.Value); var restart = new MemberSession(store, _ => api); Assert.AreEqual(api.Identity, await restart.RestoreAsync(default)); Assert.AreEqual(1, api.Logins);
    }
    [TestMethod]
    public async Task ConcurrentChecksRotateOnce()
    {
        var store = new Store { Value = new("https://waggle.example", ProtocolTests.Pair) }; var api = new Api(); var session = new MemberSession(store, _ => api);
        await session.RestoreAsync(default);
        api.RejectOld = true;
        await Task.WhenAll(session.CheckAsync(default), session.CheckAsync(default)); Assert.AreEqual(1, api.Refreshes); Assert.AreEqual(api.Next, store.Value!.Tokens);
    }
    [TestMethod]
    public async Task RevokedClearsButOfflineKeepsRecoverableSession()
    {
        var store = new Store { Value = new("https://waggle.example", ProtocolTests.Pair) }; var api = new Api { Offline = true }; var session = new MemberSession(store, _ => api);
        Assert.AreEqual(Failure.Offline, (await Assert.ThrowsAsync<MemberException>(() => session.RestoreAsync(default))).Failure); Assert.IsNotNull(store.Value); Assert.IsNull(session.Current);
        api.Offline = false; api.Revoked = true; await Assert.ThrowsAsync<MemberException>(() => session.CheckAsync(default)); Assert.IsNull(store.Value); Assert.IsFalse(session.HasStoredSession);
    }
    [TestMethod]
    public async Task FailedRotationSaveRevokesNewGrantAndClearsMemory()
    {
        var store = new Store { Value = new("https://waggle.example", ProtocolTests.Pair), FailSave = true }; var api = new Api { RejectOld = true }; var session = new MemberSession(store, _ => api);
        Assert.AreEqual(Failure.Storage, (await Assert.ThrowsAsync<MemberException>(() => session.RestoreAsync(default))).Failure); Assert.IsNull(session.Current); Assert.IsNull(store.Value); Assert.AreEqual(api.Next.RefreshToken, api.LoggedOut.Single());
    }
    [TestMethod]
    public async Task LogoutClearsLocallyWhenOffline()
    {
        var store = new Store { Value = new("https://waggle.example", ProtocolTests.Pair) }; var api = new Api(); var session = new MemberSession(store, _ => api);
        await session.RestoreAsync(default); api.Offline = true; Assert.IsFalse(await session.LogoutAsync(default)); Assert.IsNull(store.Value); Assert.IsNull(session.Current);
    }
    [TestMethod]
    public async Task AbsoluteExpiryClearsWithoutSendingOldTokens()
    {
        var store = new Store { Value = new("https://waggle.example", ProtocolTests.Pair with { RefreshExpiresAt = 1 }) };
        var api = new Api(); var session = new MemberSession(store, _ => api);
        Assert.AreEqual(Failure.Unauthorized, (await Assert.ThrowsAsync<MemberException>(() => session.RestoreAsync(default))).Failure);
        Assert.IsNull(store.Value); Assert.AreEqual(0, api.Refreshes);
    }
    [TestMethod]
    public async Task FailedLocalRemovalKeepsCleanupControlsWithoutAuthenticatingAgain()
    {
        var store = new Store { Value = new("https://configured.waggle.example", ProtocolTests.Pair) };
        var api = new Api(); var session = new MemberSession(store, _ => api);
        await session.RestoreAsync(default);
        api.Offline = true; store.FailClear = true;
        Assert.AreEqual(Failure.Storage, (await Assert.ThrowsAsync<MemberException>(() => session.LogoutAsync(default))).Failure);
        Assert.IsNull(session.Current); Assert.IsTrue(session.HasStoredSession);
        Assert.IsNotNull(store.Value);
        api.Offline = false;
        Assert.AreEqual(Failure.Storage, (await Assert.ThrowsAsync<MemberException>(() => session.CheckAsync(default))).Failure);
        store.FailClear = false;
        await session.LogoutAsync(default);
        Assert.IsNull(store.Value); Assert.IsFalse(session.HasStoredSession);
    }
    [TestMethod]
    public async Task RestoredServiceAddressSurvivesExpiryAndLogout()
    {
        const string origin = "https://configured.waggle.example/";
        var store = new Store { Value = new(origin, ProtocolTests.Pair with { RefreshExpiresAt = 1 }) };
        var session = new MemberSession(store, _ => new Api());
        await Assert.ThrowsAsync<MemberException>(() => session.RestoreAsync(default));
        Assert.AreEqual(origin, session.Origin);
        store.Value = new(origin, ProtocolTests.Pair);
        await session.RestoreAsync(default);
        await session.LogoutAsync(default);
        Assert.AreEqual(origin, session.Origin);
    }
    [TestMethod]
    public async Task FailedFirstSaveAndRemovalStillOffersCleanupRetry()
    {
        var store = new Store { FailSave = true, FailClear = true };
        var session = new MemberSession(store, _ => new Api());
        await Assert.ThrowsAsync<MemberException>(() => session.LoginAsync("https://waggle.example", "synthetic-code", "검증", default));
        Assert.IsTrue(session.NeedsCleanup); Assert.IsTrue(session.HasStoredSession);
        store.FailClear = false;
        await session.LogoutAsync(default);
        Assert.IsFalse(session.NeedsCleanup); Assert.IsFalse(session.HasStoredSession);
    }
    internal sealed class Store : ISessionStore
    {
        public StoredSession? Value; public bool FailSave, FailClear;
        public Task<StoredSession?> LoadAsync(CancellationToken ct) => Task.FromResult(Value);
        public Task SaveAsync(StoredSession s, CancellationToken ct) { if (FailSave) throw new IOException("synthetic-storage-failure"); Value = s; return Task.CompletedTask; }
        public Task ClearAsync(CancellationToken ct) { if (FailClear) throw new IOException("synthetic-clear-failure"); Value = null; return Task.CompletedTask; }
    }
    internal sealed class Api : IMemberApi
    {
        public SchoolConfig Config = new(1, 0, [], []);
        public Encyclopedia Catalog = new(1, 0, []); public Collection Collection = new(1, []); public List<ConnectionReport> Reports = []; public bool RejectOldCatalog;
        public Identity Identity = ProtocolTests.Identity; public TokenPair Next = ProtocolTests.Pair with { AccessToken = "fresh.payload.signature", RefreshToken = new string('n', 32) };
        public bool Offline, Revoked, RejectOld, RejectOldConfig, RejectAllConfigs; public int Refreshes, Logins, ConfigRequests; public List<string> LoggedOut = [];
        public bool Limited, CatalogOffline;
        void Guard() { if (Offline) throw new MemberException(Failure.Offline); if (Revoked) throw new MemberException(Failure.Unauthorized); }
        public Task<TokenPair> LoginAsync(string code, string name, CancellationToken ct) { Guard(); Logins++; return Task.FromResult(ProtocolTests.Pair); }
        public async Task<TokenPair> RefreshAsync(string token, CancellationToken ct) { Guard(); await Task.Yield(); Refreshes++; return Next; }
        public Task<Identity> MeAsync(string token, CancellationToken ct) { Guard(); if (RejectOld && token == ProtocolTests.Pair.AccessToken) throw new MemberException(Failure.Unauthorized); return Task.FromResult(Identity); }
        public Task<SchoolConfig> GetSchoolConfigAsync(string token, CancellationToken ct) { Guard(); ConfigRequests++; if (RejectAllConfigs || RejectOldConfig && token == ProtocolTests.Pair.AccessToken) throw new MemberException(Failure.Unauthorized); return Task.FromResult(Config); }
        public Task<Encyclopedia> GetEncyclopediaAsync(string token, CancellationToken ct) { Guard(); if (Limited) throw new MemberException(Failure.RateLimited); if (CatalogOffline) throw new MemberException(Failure.Offline); if (RejectOldCatalog && token == ProtocolTests.Pair.AccessToken) throw new MemberException(Failure.Unauthorized); return Task.FromResult(Catalog); }
        public Task<Collection> SyncCollectionAsync(string token, ConnectionReport[] reports, CancellationToken ct) { Guard(); Reports.AddRange(reports); return Task.FromResult(Collection); }
        public Task LogoutAsync(string token, CancellationToken ct) { Guard(); LoggedOut.Add(token); return Task.CompletedTask; }
        public List<WifiRequestInput> WifiRequests = [];
        public Task SubmitWifiRequestAsync(string token, WifiRequestInput input, CancellationToken ct) { Guard(); WifiRequests.Add(input); return Task.CompletedTask; }
        public void Dispose() { }
    }
}
