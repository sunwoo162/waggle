using System.Net;
using System.Text;
using System.Text.Json;
using Waggle.Core;
namespace Waggle.Tests;

[TestClass]
public sealed class CollectionProtocolTests
{
    [TestMethod]
    public async Task CatalogAndCollectionUseExplicitBearerAndOnlyConnectionReportFields()
    {
        var requests = new List<(string Path, HttpMethod Method, string? Bearer, string Body)>();
        using var api = new MemberApi(new("https://waggle.example"), new ProtocolTests.Handler(async request =>
        {
            requests.Add((request.RequestUri!.AbsolutePath, request.Method, request.Headers.Authorization?.Parameter, request.Content is null ? "" : await request.Content.ReadAsStringAsync()));
            return request.RequestUri.AbsolutePath.EndsWith("encyclopedia", StringComparison.Ordinal) ? ProtocolTests.Json(CollectionSyncTests.Catalog()) : ProtocolTests.Json(new Collection(1, []));
        }));
        await api.GetEncyclopediaAsync(ProtocolTests.Pair.AccessToken, default);
        await api.SyncCollectionAsync(ProtocolTests.Pair.AccessToken, [], default);
        await api.SyncCollectionAsync(ProtocolTests.Pair.AccessToken, [new(SchoolConfigTests.ApId, " QA 학교망 ", "02:00:00:00:00:01")], default);
        Assert.AreEqual("/api/client/encyclopedia", requests[0].Path); Assert.AreEqual(HttpMethod.Get, requests[1].Method); Assert.AreEqual(HttpMethod.Post, requests[2].Method);
        Assert.IsTrue(requests.All(r => r.Bearer == ProtocolTests.Pair.AccessToken));
        using var body = JsonDocument.Parse(requests[2].Body);
        Assert.AreEqual(1, body.RootElement.EnumerateObject().Count());
        Assert.AreEqual(3, body.RootElement.GetProperty("reports")[0].EnumerateObject().Count());
    }
    [TestMethod]
    public async Task RejectsInvalidCatalogAndOversizedJsonWithoutReflectingServerContent()
    {
        foreach (var response in new[] {
            ProtocolTests.Json(CollectionSyncTests.Catalog() with {Characters=[new(SchoolConfigTests.ApId,"친구","","https://foreign.example/secret-image")]}),
            new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent(new string('x',4*1024*1024+1),Encoding.UTF8,"application/json")} })
        {
            using var api = new MemberApi(new("https://waggle.example"), new ProtocolTests.Handler(_ => Task.FromResult(response)));
            var error = await Assert.ThrowsAsync<MemberException>(() => api.GetEncyclopediaAsync(ProtocolTests.Pair.AccessToken, default));
            Assert.AreEqual(Failure.InvalidResponse, error.Failure); Assert.DoesNotContain("secret-image", error.Message);
        }
    }
    [TestMethod]
    public async Task ReportRequestRejectsAnEscapedBodyOverServerLimitBeforeSending()
    {
        var sent = false;
        using var api = new MemberApi(new("https://waggle.example"), new ProtocolTests.Handler(_ => { sent = true; return Task.FromResult(ProtocolTests.Json(new Collection(1, []))); }));
        var reports = Enumerable.Range(0, 100).Select(_ => new ConnectionReport(Guid.NewGuid().ToString(), new string('<', 32), "02:00:00:00:00:01")).ToArray();
        Assert.AreEqual(Failure.InvalidInput, (await Assert.ThrowsAsync<MemberException>(() => api.SyncCollectionAsync(ProtocolTests.Pair.AccessToken, reports, default))).Failure);
        Assert.IsFalse(sent);
    }
}
