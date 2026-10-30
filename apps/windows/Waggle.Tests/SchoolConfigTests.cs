using Waggle.Core;
using Waggle.Security.Windows;

namespace Waggle.Tests;

[TestClass]
public sealed class SchoolConfigTests
{
    internal static readonly string NetworkId = Guid.NewGuid().ToString();
    internal static readonly string ApId = Guid.NewGuid().ToString();
    internal static SchoolConfig Config(long version = 1) => new(1, version, [new(NetworkId, " QA 학교망 ", "wpa2-personal", "synthetic-fixture-only")], [new(ApId, NetworkId, "02:00:00:00:00:01")]);
    [TestMethod]
    public void ValidatesReferencesSecretsSsidAndDuplicatesWithoutNormalizingSsid()
    {
        var good = Config(); good.Validate(); Assert.AreEqual(" QA 학교망 ", good.Networks[0].Ssid);
        foreach (var invalid in new[]{
            good with {SchemaVersion=2}, good with {Version=-1},
            good with {Networks=[good.Networks[0] with {Ssid="가".PadRight(12,'가')}]},
            good with {Networks=[good.Networks[0] with {Password="short"}]},
            good with {Networks=[good.Networks[0] with {Password="synthetic-fixture-only\n"}]},
            good with {Networks=[good.Networks[0],good.Networks[0]]},
            good with {AccessPoints=[good.AccessPoints[0] with {NetworkId=Guid.NewGuid().ToString()}]},
            good with {AccessPoints=[good.AccessPoints[0] with {Bssid="ff:ff:ff:ff:ff:ff"}]}})
            Assert.Throws<MemberException>(() => invalid.Validate());
        Assert.DoesNotContain("synthetic-fixture-only", good.ToString());
        Assert.DoesNotContain("synthetic-fixture-only", good.Networks[0].ToString());
    }
    [TestMethod]
    public async Task SerialAuthenticatedSyncRejectsRollbackAndSameVersionConflicts()
    {
        var api = new SessionTests.Api(); var session = new MemberSession(new SessionTests.Store(), _ => api);
        await session.LoginAsync("https://waggle.example", "synthetic-code", "검증", default);
        var store = new Store(); var sync = new SchoolConfigSync(session, store);
        api.Config = Config(2); await sync.SyncAsync(default);
        Assert.AreEqual(2L, store.Value!.Config.Version);
        api.Config = Config(1); await Assert.ThrowsAsync<MemberException>(() => sync.SyncAsync(default));
        Assert.AreEqual(2L, store.Value.Config.Version);
        api.Config = Config(2) with { Networks = [Config().Networks[0] with { Password = "synthetic-changed-only" }] };
        await Assert.ThrowsAsync<MemberException>(() => sync.SyncAsync(default));
        api.Config = new SchoolConfig(1, 3, [], []); await sync.SyncAsync(default);
        Assert.HasCount(0, store.Value.Config.Networks);
        api.Revoked = true; await Assert.ThrowsAsync<MemberException>(() => sync.SyncAsync(default));
        Assert.IsNull(sync.Current);
    }
    [TestMethod]
    public async Task OtherOriginOrMemberCacheIsNeverUsedAndFailedSavePreservesPrevious()
    {
        var api = new SessionTests.Api { Config = Config() }; var session = new MemberSession(new SessionTests.Store(), _ => api);
        await session.LoginAsync("https://waggle.example", "synthetic-code", "검증", default);
        var store = new Store { Value = new("https://other.example/", Guid.NewGuid().ToString(), Config(99)) };
        var sync = new SchoolConfigSync(session, store); await sync.SyncAsync(default);
        Assert.AreEqual(1L, store.Value.Config.Version);
        var old = store.Value; store.FailSave = true; api.Config = Config(2);
        Assert.AreEqual(Failure.Storage, (await Assert.ThrowsAsync<MemberException>(() => sync.SyncAsync(default))).Failure);
        Assert.AreEqual(old, store.Value);
    }
    [TestMethod]
    public async Task ConfigurationUsesOsProtectionAndSeparatePurpose()
    {
        var directory = Path.Combine(Path.GetTempPath(), "waggle-config-test-" + Guid.NewGuid());
        var file = Path.Combine(directory, "school.bin"); var store = new ProtectedSchoolConfigStore(file);
        var value = new CachedSchoolConfig("https://waggle.example/", Guid.NewGuid().ToString(), Config());
        await store.SaveAsync(value, default); var loaded = await store.LoadAsync(default);
        Assert.IsTrue(loaded!.Config.EquivalentTo(value.Config));
        Assert.DoesNotContain("synthetic-fixture-only", System.Text.Encoding.UTF8.GetString(await File.ReadAllBytesAsync(file)));
        await Assert.ThrowsAsync<System.Security.Cryptography.CryptographicException>(() => new ProtectedSessionStore(file).LoadAsync(default));
        await store.ClearAsync(default); Directory.Delete(directory);
    }
    [TestMethod]
    public async Task LogoutImmediatelyHidesPreviouslySyncedCredentials()
    {
        var api = new SessionTests.Api { Config = Config() };
        var session = new MemberSession(new SessionTests.Store(), _ => api);
        await session.LoginAsync("https://waggle.example", "synthetic-code", "검증", default);
        var sync = new SchoolConfigSync(session, new Store());
        await sync.SyncAsync(default); Assert.IsNotNull(sync.Current);
        await session.LogoutAsync(default); Assert.IsNull(sync.Current);
    }
    [TestMethod]
    [DataRow(false)]
    [DataRow(true)]
    public async Task PendingStorageSerializesLogoutBeforeCredentialsCanBePublished(bool delaySave)
    {
        var api = new SessionTests.Api { Config = Config() };
        var session = new MemberSession(new SessionTests.Store(), _ => api);
        await session.LoginAsync("https://waggle.example", "synthetic-code", "검증", default);
        var store = new DelayedStore(delaySave); var sync = new SchoolConfigSync(session, store);
        var pending = sync.SyncAsync(default);
        await store.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var logout = session.LogoutAsync(default);
        try { Assert.IsFalse(logout.IsCompleted, "로그아웃은 진행 중인 설정 저장과 직렬화되어야 한다."); }
        finally { store.Release.TrySetResult(); await pending; await logout; }
        Assert.IsNull(sync.Current); Assert.IsNull(session.Current);
    }
    [TestMethod]
    public async Task ConfigEndpointExpiryRotatesOnceWithoutLosingSession()
    {
        var store = new SessionTests.Store(); var api = new SessionTests.Api { RejectOldConfig = true };
        var session = new MemberSession(store, _ => api);
        await session.LoginAsync("https://waggle.example", "synthetic-code", "검증", default);
        await session.DownloadSchoolConfigAsync(default);
        Assert.AreEqual(1, api.Refreshes); Assert.AreEqual(2, api.ConfigRequests);
        Assert.AreEqual(api.Next, store.Value!.Tokens); Assert.IsNotNull(session.Current);
    }
    [TestMethod]
    [DataRow(false)]
    [DataRow(true)]
    public async Task PreflightAndConfigRetryHaveOneRefreshBudget(bool preflightExpires)
    {
        var store = new SessionTests.Store(); var api = new SessionTests.Api();
        var session = new MemberSession(store, _ => api);
        await session.LoginAsync("https://waggle.example", "synthetic-code", "검증", default);
        api.RejectOld = preflightExpires; api.RejectAllConfigs = true;
        Assert.AreEqual(Failure.Unauthorized, (await Assert.ThrowsAsync<MemberException>(() => session.DownloadSchoolConfigAsync(default))).Failure);
        Assert.AreEqual(1, api.Refreshes); Assert.IsNull(store.Value); Assert.IsNull(session.Current);
    }
    private sealed class DelayedStore(bool delaySave) : ISchoolConfigStore
    {
        public TaskCompletionSource Started = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private async Task Delay(CancellationToken ct) { Started.TrySetResult(); await Release.Task.WaitAsync(ct); }
        public async Task<CachedSchoolConfig?> LoadAsync(CancellationToken ct) { if (!delaySave) await Delay(ct); return null; }
        public async Task SaveAsync(CachedSchoolConfig value, CancellationToken ct) { if (delaySave) await Delay(ct); }
        public Task ClearAsync(CancellationToken ct) => Task.CompletedTask;
    }
    internal sealed class Store : ISchoolConfigStore
    {
        public CachedSchoolConfig? Value; public bool FailSave;
        public Task<CachedSchoolConfig?> LoadAsync(CancellationToken ct) => Task.FromResult(Value);
        public Task SaveAsync(CachedSchoolConfig value, CancellationToken ct) { if (FailSave) throw new IOException("synthetic-save-failure"); Value = value; return Task.CompletedTask; }
        public Task ClearAsync(CancellationToken ct) { Value = null; return Task.CompletedTask; }
    }
}
