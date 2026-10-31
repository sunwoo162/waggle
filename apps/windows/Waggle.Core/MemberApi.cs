using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;

namespace Waggle.Core;

public sealed class MemberApi : IMemberApi
{
    private readonly HttpClient client;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { MaxDepth = 16 };
    public MemberApi(Uri origin, HttpMessageHandler? handler = null)
    {
        client = new HttpClient(handler ?? new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false })
        { BaseAddress = ServiceOrigin.Parse(origin.AbsoluteUri), Timeout = TimeSpan.FromSeconds(15) };
    }
    public async Task<TokenPair> LoginAsync(string code, string deviceName, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(code) || code.Length > 128 || string.IsNullOrWhiteSpace(deviceName) || deviceName.Trim().Length > 64 || deviceName.Any(char.IsControl))
            throw new MemberException(Failure.InvalidInput);
        var pair = await SendAsync<TokenPair>("code-login", new { code = code.Trim(), platform = "windows", deviceName = deviceName.Trim() }, null, ct);
        pair.Validate(); return pair;
    }
    public async Task<TokenPair> RefreshAsync(string token, CancellationToken ct)
    {
        var pair = await SendAsync<TokenPair>("refresh", new { refreshToken = token }, null, ct);
        pair.Validate(); return pair;
    }
    public async Task<Identity> MeAsync(string token, CancellationToken ct)
    {
        var identity = await SendAsync<Identity>("me", null, token, ct);
        identity.Validate(); return identity;
    }
    public async Task LogoutAsync(string token, CancellationToken ct) => await SendAsync<object>("logout", new { refreshToken = token }, null, ct);
    public async Task<SchoolConfig> GetSchoolConfigAsync(string token, CancellationToken ct)
    {
        var config = await SendAsync<SchoolConfig>("config", null, token, ct, 1024 * 1024);
        config.Validate(); return config;
    }
    public async Task<Encyclopedia> GetEncyclopediaAsync(string token, CancellationToken ct)
    {
        var catalog = await SendAsync<Encyclopedia>("encyclopedia", null, token, ct, 4 * 1024 * 1024);
        catalog.Validate(); return catalog;
    }
    public async Task<Collection> SyncCollectionAsync(string token, ConnectionReport[] reports, CancellationToken ct)
    {
        if (reports.Length > 100) throw new MemberException(Failure.InvalidInput);
        foreach (var report in reports) report.Validate();
        if (reports.Length > 0 && JsonSerializer.SerializeToUtf8Bytes(new { reports }, Json).Length > 16 * 1024) throw new MemberException(Failure.InvalidInput);
        var collection = await SendAsync<Collection>("collection", reports.Length == 0 ? null : new { reports }, token, ct, 512 * 1024);
        collection.Validate(); return collection;
    }
    public async Task SubmitWifiRequestAsync(string token, WifiRequestInput input, CancellationToken ct)
    {
        if (input.Room.Trim() is not { Length: > 0 and <= 40 } || input.Ssid.Length is 0 or > 32 || input.Security is not ("open" or "wpa2-personal" or "wpa3-personal"))
            throw new MemberException(Failure.InvalidInput);
        var receipt = await SendAsync<WifiRequestReceipt>("wifi-requests", new { room = input.Room.Trim(), ssid = input.Ssid, security = input.Security, password = input.Password ?? "" }, token, ct, 4096);
        if (receipt.Status != "received") throw new MemberException(Failure.InvalidResponse);
    }
    private async Task<T> SendAsync<T>(string path, object? body, string? bearer, CancellationToken ct, int maximumBytes = 65_536)
    {
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(TimeSpan.FromSeconds(15));
        using var request = new HttpRequestMessage(body is null ? HttpMethod.Get : HttpMethod.Post, "/api/client/" + path);
        if (body is not null) request.Content = JsonContent.Create(body, options: Json);
        if (bearer is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        try
        {
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, budget.Token);
            if (!response.IsSuccessStatusCode)
                throw new MemberException(response.StatusCode switch
                {
                    HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => Failure.Unauthorized,
                    HttpStatusCode.TooManyRequests => Failure.RateLimited,
                    HttpStatusCode.BadRequest => Failure.InvalidInput,
                    HttpStatusCode.Conflict => Failure.Conflict,
                    _ => Failure.Unavailable
                });
            if (path == "logout")
            {
                if (response.StatusCode != HttpStatusCode.NoContent) throw new MemberException(Failure.InvalidResponse);
                return default!;
            }
            if (response.Content.Headers.ContentType?.MediaType != "application/json" || response.Content.Headers.ContentLength > maximumBytes)
                throw new MemberException(Failure.InvalidResponse);
            await using var stream = await response.Content.ReadAsStreamAsync(budget.Token);
            using var bytes = new MemoryStream();
            var buffer = new byte[4096]; int read;
            try
            {
                while ((read = await stream.ReadAsync(buffer, budget.Token)) != 0)
                {
                    if (bytes.Length + read > maximumBytes) throw new MemberException(Failure.InvalidResponse);
                    bytes.Write(buffer, 0, read);
                }
                return JsonSerializer.Deserialize<T>(bytes.GetBuffer().AsSpan(0, (int)bytes.Length), Json) ?? throw new MemberException(Failure.InvalidResponse);
            }
            finally { CryptographicOperations.ZeroMemory(bytes.GetBuffer()); CryptographicOperations.ZeroMemory(buffer); }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new MemberException(Failure.Offline); }
        catch (HttpRequestException) { throw new MemberException(Failure.Offline); }
        catch (IOException) { throw new MemberException(Failure.Offline); }
        catch (JsonException) { throw new MemberException(Failure.InvalidResponse); }
    }
    public void Dispose() => client.Dispose();
}
