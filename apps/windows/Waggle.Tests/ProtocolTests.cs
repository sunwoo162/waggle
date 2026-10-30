using System.Net;
using System.Text;
using System.Text.Json;
using Waggle.Core;
namespace Waggle.Tests;

[TestClass]
public sealed class ProtocolTests
{
    internal static readonly TokenPair Pair = new("header.payload.signature", new string('r', 32), "Bearer", 900, DateTimeOffset.UtcNow.AddDays(30).ToUnixTimeMilliseconds());
    internal static readonly Identity Identity = new(new(Guid.NewGuid().ToString(), "합성 이용자"), new(Guid.NewGuid().ToString(), "windows", "검증 노트북", Pair.RefreshExpiresAt));
    internal static HttpResponseMessage Json(object body, HttpStatusCode code = HttpStatusCode.OK) => new(code) { Content = new StringContent(JsonSerializer.Serialize(body, new JsonSerializerOptions(JsonSerializerDefaults.Web)), Encoding.UTF8, "application/json") };
    [TestMethod]
    public void OnlyHttpsAndExactLoopbackOrigins()
    {
        foreach (var s in new[] { "https://waggle.example", "http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000" }) Assert.IsNotNull(ServiceOrigin.Parse(s));
        foreach (var s in new[] { "http://school.example", "http://127.1", "http://localhost.evil.test", "https://a.test/path", "https://u:p@a.test", "https://a.test?token=x", "https://a.test#x", "file:///C:/a" }) Assert.Throws<MemberException>(() => ServiceOrigin.Parse(s));
    }
    [TestMethod]
    public async Task SendsWindowsFieldsAndExplicitAccessBearer()
    {
        var requests = new List<(string Path, string Body, string? Auth)>();
        using var api = new MemberApi(ServiceOrigin.Parse("https://waggle.example"), new Handler(async r => { requests.Add((r.RequestUri!.AbsolutePath, r.Content is null ? "" : await r.Content.ReadAsStringAsync(), r.Headers.Authorization?.ToString())); return r.Method == HttpMethod.Get ? Json(Identity) : Json(Pair); }));
        await api.LoginAsync("synthetic-code", "검증 노트북", default); await api.MeAsync(Pair.AccessToken, default);
        using var login = JsonDocument.Parse(requests[0].Body);
        Assert.AreEqual("windows", login.RootElement.GetProperty("platform").GetString()); Assert.AreEqual(3, login.RootElement.EnumerateObject().Count());
        Assert.AreEqual("/api/client/code-login", requests[0].Path); Assert.IsNull(requests[0].Auth); Assert.AreEqual("Bearer " + Pair.AccessToken, requests[1].Auth);
    }
    [TestMethod]
    public async Task RejectsRedirectsOversizedAndMalformedResponses()
    {
        foreach (var response in new[] { new HttpResponseMessage(HttpStatusCode.Redirect) { Headers = { Location = new Uri("https://outside.invalid") } }, new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(new string('x', 70_000)) }, Json(new { accessToken = "private-server-body" }) })
        {
            var calls = 0; using var api = new MemberApi(new Uri("https://waggle.example"), new Handler(_ => { calls++; return Task.FromResult(response); }));
            var error = await Assert.ThrowsAsync<MemberException>(() => api.RefreshAsync(Pair.RefreshToken, default)); Assert.DoesNotContain("private-server-body", error.Message); Assert.AreEqual(1, calls);
        }
    }
    [TestMethod]
    public async Task SeparatesAuthenticationLimitsAndNetworkErrors()
    {
        foreach (var (status, expected) in new[] { (HttpStatusCode.Unauthorized, Failure.Unauthorized), (HttpStatusCode.TooManyRequests, Failure.RateLimited), (HttpStatusCode.ServiceUnavailable, Failure.Unavailable) })
        {
            using var api = new MemberApi(new Uri("https://waggle.example"), new Handler(_ => Task.FromResult(new HttpResponseMessage(status)))); Assert.AreEqual(expected, (await Assert.ThrowsAsync<MemberException>(() => api.MeAsync(Pair.AccessToken, default))).Failure);
        }
        using var offline = new MemberApi(new Uri("https://waggle.example"), new Handler(_ => throw new HttpRequestException("private-network-details")));
        Assert.AreEqual(Failure.Offline, (await Assert.ThrowsAsync<MemberException>(() => offline.MeAsync(Pair.AccessToken, default))).Failure);
    }
    internal sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct) => send(r); }
}

