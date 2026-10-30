using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using Waggle.Core;
namespace Waggle.Platform.Windows;

public sealed class ArtClient : IDisposable
{
    private readonly HttpClient client;
    public ArtClient(HttpMessageHandler? handler = null) => client = new(handler ?? new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = TimeSpan.FromSeconds(10) };
    public async Task<DecodedArt> DownloadAsync(string origin, string path, CancellationToken ct)
    {
        if (!Regex.IsMatch(path, @"\A/api/art/[a-f0-9]{64}\z")) throw new MemberException(Failure.InvalidInput);
        var service = ServiceOrigin.Parse(origin);
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct); budget.CancelAfter(TimeSpan.FromSeconds(10));
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(service, path));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("image/webp"));
        try
        {
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, budget.Token);
            if (!response.IsSuccessStatusCode) throw new MemberException(Failure.Unavailable);
            if (response.Content.Headers.ContentType?.MediaType != "image/webp" || response.Content.Headers.ContentLength > 1024 * 1024) throw new MemberException(Failure.InvalidResponse);
            await using var stream = await response.Content.ReadAsStreamAsync(budget.Token);
            using var bytes = new MemoryStream(); var buffer = new byte[4096]; int read;
            while ((read = await stream.ReadAsync(buffer, budget.Token)) != 0)
            {
                if (bytes.Length + read > 1024 * 1024) throw new MemberException(Failure.InvalidResponse);
                bytes.Write(buffer, 0, read);
            }
            return ArtDecoder.DecodeWebp(bytes.ToArray(), path[^64..]);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new MemberException(Failure.Offline); }
        catch (HttpRequestException) { throw new MemberException(Failure.Offline); }
        catch (IOException) { throw new MemberException(Failure.Offline); }
    }
    public void Dispose() => client.Dispose();
}
