using Waggle.Core;
using Waggle.Security.Windows;
namespace Waggle.Tests;

[TestClass]
public sealed class CollectionSyncTests
{
    internal static Encyclopedia Catalog(long version = 1) => new(1, version, [new(SchoolConfigTests.ApId, "쉿파이", "조용한 친구\n작은 패킷을 품어요.", "/api/art/" + new string('a', 64))]);
    [TestMethod]
    public void CatalogAndProtectedStateRejectForeignUrlsDuplicatesAndInvalidIdentifiers()
    {
        var good = Catalog(); good.Validate();
        foreach (var bad in new[] { good with { SchemaVersion = 2 }, good with { Version = -1 }, good with { Characters = [good.Characters[0], good.Characters[0]] }, good with { Characters = [good.Characters[0] with { ImagePath = "https://foreign.example/picture.webp" }] }, good with { Characters = [good.Characters[0] with { Name = "" }] } }) Assert.Throws<MemberException>(() => bad.Validate());
        Assert.Throws<MemberException>(() => new Collection(1, [SchoolConfigTests.ApId, SchoolConfigTests.ApId]).Validate());
    }
    [TestMethod]
    public async Task OnlyConfirmedConnectionIsPersistedOnceAndServerMergeClearsPending()
    {
        var api = new SessionTests.Api { Config = SchoolConfigTests.Config(), Catalog = Catalog() };
        var session = new MemberSession(new SessionTests.Store(), _ => api);
        await session.LoginAsync("https://waggle.example", "synthetic-code", "검증", default);
        var school = await session.DownloadSchoolConfigAsync(default);
        var store = new Store(); var sync = new CollectionSync(session, store);
        await sync.RefreshAsync(school, default);
        Assert.IsFalse(await sync.RecordAsync(school, null, WifiPolicyTests.Now, default));
        Assert.IsFalse(await sync.RecordAsync(school, WifiPolicyTests.Observation().Connection! with { Security = "open" }, WifiPolicyTests.Now, default));
        Assert.HasCount(0, store.Value!.Pending);
        Assert.IsTrue(await sync.RecordAsync(school, WifiPolicyTests.Observation().Connection, WifiPolicyTests.Now, default));
        Assert.IsFalse(await sync.RecordAsync(school, WifiPolicyTests.Observation().Connection, WifiPolicyTests.Now.AddSeconds(10), default));
        Assert.HasCount(1, store.Value.Pending); Assert.HasCount(1, store.Value.History);
        api.Collection = new(1, [SchoolConfigTests.ApId]);
        await sync.RefreshAsync(school, default);
        Assert.HasCount(0, store.Value.Pending); Assert.HasCount(1, store.Value.Collected.ApIds);
        Assert.HasCount(1, api.Reports); Assert.AreEqual(SchoolConfigTests.ApId, api.Reports[0].ApId);
        await session.LogoutAsync(default); Assert.IsNull(sync.Current);
    }
    [TestMethod]
    public async Task OtherOwnerIsIgnoredAndFailedSaveNeverPublishesNewCollection()
    {
        var api = new SessionTests.Api { Config = SchoolConfigTests.Config(), Catalog = Catalog() };
        var session = new MemberSession(new SessionTests.Store(), _ => api);
        await session.LoginAsync("https://waggle.example", "synthetic-code", "검증", default);
        var school = await session.DownloadSchoolConfigAsync(default);
        var store = new Store { Value = new("https://foreign.example/", Guid.NewGuid().ToString(), Catalog(99), new(1, [SchoolConfigTests.ApId]), [], []) };
        var sync = new CollectionSync(session, store); await sync.RefreshAsync(school, default);
        Assert.AreEqual(1L, store.Value.Catalog.Version); Assert.HasCount(0, store.Value.Collected.ApIds);
        var old = store.Value; store.FailSave = true;
        Assert.AreEqual(Failure.Storage, (await Assert.ThrowsAsync<MemberException>(() => sync.RecordAsync(school, WifiPolicyTests.Observation().Connection, WifiPolicyTests.Now, default))).Failure);
        Assert.AreSame(old, store.Value); Assert.HasCount(0, sync.Current!.Pending);
        await Assert.ThrowsAsync<MemberException>(() => sync.RefreshAsync(school with { MemberId = Guid.NewGuid().ToString() }, default));
        Assert.IsNotNull(session.Current);
    }
    [TestMethod]
    public async Task CachePersistenceAndAuthenticatedCatalogRetryAreSerializedWithLogout()
    {
        var api = new SessionTests.Api { Config = SchoolConfigTests.Config(), Catalog = Catalog(), RejectOldCatalog = true };
        var session = new MemberSession(new SessionTests.Store(), _ => api);
        await session.LoginAsync("https://waggle.example", "synthetic-code", "검증", default);
        var school = await session.DownloadSchoolConfigAsync(default);
        var store = new Store(); var sync = new CollectionSync(session, store);
        await sync.RefreshAsync(school, default); Assert.AreEqual(1, api.Refreshes);
        store.SaveStarted = new(TaskCreationOptions.RunContinuationsAsynchronously); store.ReleaseSave = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var pending = sync.RecordAsync(school, WifiPolicyTests.Observation().Connection, WifiPolicyTests.Now, default);
        await store.SaveStarted.Task.WaitAsync(TimeSpan.FromSeconds(5)); var logout = session.LogoutAsync(default);
        try { Assert.IsFalse(logout.IsCompleted); } finally { store.ReleaseSave.TrySetResult(); await pending; await logout; }
        Assert.IsNull(sync.Current);
    }
    [TestMethod]
    public async Task CollectionStateUsesSeparateOsProtectionAndClearRemovesPending()
    {
        var directory = Path.Combine(Path.GetTempPath(), "waggle-collection-test-" + Guid.NewGuid());
        var path = Path.Combine(directory, "client.bin"); var store = new ProtectedClientStateStore(path);
        var state = new ClientState("https://waggle.example/", Guid.NewGuid().ToString(), Catalog(), new(1, []), [new(SchoolConfigTests.ApId, " QA 학교망 ", "02:00:00:00:00:01")], []);
        await store.SaveAsync(state, default);
        Assert.HasCount(1, (await store.LoadAsync(default))!.Pending);
        Assert.DoesNotContain(" QA 학교망 ", System.Text.Encoding.UTF8.GetString(await File.ReadAllBytesAsync(path)));
        await Assert.ThrowsAsync<System.Security.Cryptography.CryptographicException>(() => new ProtectedSchoolConfigStore(path).LoadAsync(default));
        await store.ClearAsync(default); Assert.IsNull(await store.LoadAsync(default)); Directory.Delete(directory);
    }
    [TestMethod]
    public async Task ReobservedChangedApReplacesStalePendingWithoutAwardingTwice()
    {
        var api = new SessionTests.Api { Config = SchoolConfigTests.Config(), Catalog = Catalog() };
        var session = new MemberSession(new SessionTests.Store(), _ => api);
        await session.LoginAsync("https://waggle.example", "synthetic-code", "검증", default);
        var school = await session.DownloadSchoolConfigAsync(default); var store = new Store(); var sync = new CollectionSync(session, store);
        await sync.RefreshAsync(school, default);
        await sync.RecordAsync(school, WifiPolicyTests.Observation().Connection, WifiPolicyTests.Now, default);
        var updated = school with { Config = school.Config with { Version = 2, AccessPoints = [school.Config.AccessPoints[0] with { Bssid = "02:00:00:00:00:03" }] } };
        Assert.IsFalse(await sync.RecordAsync(updated, WifiPolicyTests.Observation().Connection! with { Bssid = "02:00:00:00:00:03" }, WifiPolicyTests.Now.AddMinutes(1), default));
        Assert.AreEqual("02:00:00:00:00:03", store.Value!.Pending.Single().Bssid); Assert.HasCount(1, store.Value.History);
    }
    internal sealed class Store : IClientStateStore
    {
        public ClientState? Value; public bool FailSave; public TaskCompletionSource? SaveStarted, ReleaseSave;
        public Task<ClientState?> LoadAsync(CancellationToken ct) => Task.FromResult(Value);
        public async Task SaveAsync(ClientState value, CancellationToken ct) { if (FailSave) throw new IOException("synthetic-save-failure"); if (ReleaseSave is not null) { SaveStarted!.TrySetResult(); await ReleaseSave.Task.WaitAsync(ct); } Value = value; }
        public Task ClearAsync(CancellationToken ct) { Value = null; return Task.CompletedTask; }
    }
}
