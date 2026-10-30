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
    internal sealed class Store : ISessionStore
    {
        public StoredSession? Value; public bool FailSave;
        public Task<StoredSession?> LoadAsync(CancellationToken ct) => Task.FromResult(Value);
        public Task SaveAsync(StoredSession s, CancellationToken ct) { if (FailSave) throw new IOException("synthetic-storage-failure"); Value = s; return Task.CompletedTask; }
        public Task ClearAsync(CancellationToken ct) { Value = null; return Task.CompletedTask; }
    }
    internal sealed class Api : IMemberApi
    {
        public Identity Identity = ProtocolTests.Identity; public TokenPair Next = ProtocolTests.Pair with { AccessToken = "fresh.payload.signature", RefreshToken = new string('n', 32) };
        public bool Offline, Revoked, RejectOld; public int Refreshes, Logins; public List<string> LoggedOut = [];
        void Guard() { if (Offline) throw new MemberException(Failure.Offline); if (Revoked) throw new MemberException(Failure.Unauthorized); }
        public Task<TokenPair> LoginAsync(string code, string name, CancellationToken ct) { Guard(); Logins++; return Task.FromResult(ProtocolTests.Pair); }
        public async Task<TokenPair> RefreshAsync(string token, CancellationToken ct) { Guard(); await Task.Yield(); Refreshes++; return Next; }
        public Task<Identity> MeAsync(string token, CancellationToken ct) { Guard(); if (RejectOld && token == ProtocolTests.Pair.AccessToken) throw new MemberException(Failure.Unauthorized); return Task.FromResult(Identity); }
        public Task LogoutAsync(string token, CancellationToken ct) { Guard(); LoggedOut.Add(token); return Task.CompletedTask; }
        public void Dispose() { }
    }
}
