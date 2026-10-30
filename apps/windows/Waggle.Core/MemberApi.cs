using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
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
    private async Task<T> SendAsync<T>(string path, object? body, string? bearer, CancellationToken ct)
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
                    _ => Failure.Unavailable
                });
            if (path == "logout")
            {
                if (response.StatusCode != HttpStatusCode.NoContent) throw new MemberException(Failure.InvalidResponse);
                return default!;
            }
            if (response.Content.Headers.ContentType?.MediaType != "application/json" || response.Content.Headers.ContentLength > 65_536)
                throw new MemberException(Failure.InvalidResponse);
            await using var stream = await response.Content.ReadAsStreamAsync(budget.Token);
            using var bytes = new MemoryStream();
            var buffer = new byte[4096]; int read;
            while ((read = await stream.ReadAsync(buffer, budget.Token)) != 0)
            {
                if (bytes.Length + read > 65_536) throw new MemberException(Failure.InvalidResponse);
                bytes.Write(buffer, 0, read);
            }
            return JsonSerializer.Deserialize<T>(bytes.GetBuffer().AsSpan(0, (int)bytes.Length), Json) ?? throw new MemberException(Failure.InvalidResponse);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new MemberException(Failure.Offline); }
        catch (HttpRequestException) { throw new MemberException(Failure.Offline); }
        catch (IOException) { throw new MemberException(Failure.Offline); }
        catch (JsonException) { throw new MemberException(Failure.InvalidResponse); }
    }
    public void Dispose() => client.Dispose();
}
