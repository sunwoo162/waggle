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
    internal sealed class Store : ISchoolConfigStore
    {
        public CachedSchoolConfig? Value; public bool FailSave;
        public Task<CachedSchoolConfig?> LoadAsync(CancellationToken ct) => Task.FromResult(Value);
        public Task SaveAsync(CachedSchoolConfig value, CancellationToken ct) { if (FailSave) throw new IOException("synthetic-save-failure"); Value = value; return Task.CompletedTask; }
        public Task ClearAsync(CancellationToken ct) { Value = null; return Task.CompletedTask; }
    }
}
