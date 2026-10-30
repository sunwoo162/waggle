using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Waggle.Core;

namespace Waggle.Tests;

[TestClass]
public sealed class TransportIntegrationTests
{
    [TestMethod]
    public async Task DefaultTransportDoesNotFollowAnActualHttpRedirect()
    {
        await using var server = new Server((origin, count) => count == 1
            ? "HTTP/1.1 302 Found\r\nLocation: " + origin + "target\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            : JsonResponse(JsonSerializer.Serialize(ProtocolTests.Pair, new JsonSerializerOptions(JsonSerializerDefaults.Web))));
        using var api = new MemberApi(server.Origin);
        Assert.AreEqual(Failure.Unavailable, (await Assert.ThrowsAsync<MemberException>(() => api.RefreshAsync(ProtocolTests.Pair.RefreshToken, default))).Failure);
        Assert.AreEqual(1, server.Count);
    }
    [TestMethod]
    public async Task JsonWithoutContentLengthIsBoundedBeforeDeserialization()
    {
        var content = JsonSerializer.Serialize(new { ProtocolTests.Pair.AccessToken, ProtocolTests.Pair.RefreshToken, ProtocolTests.Pair.TokenType, ProtocolTests.Pair.AccessExpiresIn, ProtocolTests.Pair.RefreshExpiresAt, padding = new string('x', 70_000) }, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        await using var server = new Server((_, _) => "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n" + Encoding.UTF8.GetByteCount(content).ToString("x") + "\r\n" + content + "\r\n0\r\n\r\n");
        using var api = new MemberApi(server.Origin);
        Assert.AreEqual(Failure.InvalidResponse, (await Assert.ThrowsAsync<MemberException>(() => api.RefreshAsync(ProtocolTests.Pair.RefreshToken, default))).Failure);
    }
    private static string JsonResponse(string value) => "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + Encoding.UTF8.GetByteCount(value) + "\r\nConnection: close\r\n\r\n" + value;
    private sealed class Server : IAsyncDisposable
    {
        private readonly TcpListener listener = new(IPAddress.Loopback, 0);
        private readonly CancellationTokenSource stop = new(TimeSpan.FromSeconds(10));
        private readonly Task running;
        public Uri Origin { get; }
        public int Count { get; private set; }
        public Server(Func<Uri, int, string> response)
        {
            listener.Start(); Origin = new Uri("http://127.0.0.1:" + ((IPEndPoint)listener.LocalEndpoint).Port + "/");
            running = Task.Run(async () =>
            {
                try
                {
                    while (!stop.IsCancellationRequested)
                    {
                        using var socket = await listener.AcceptTcpClientAsync(stop.Token); await using var stream = socket.GetStream();
                        var request = new StringBuilder(); var buffer = new byte[4096];
                        while (true)
                        {
                            var read = await stream.ReadAsync(buffer, stop.Token); if (read == 0) break; request.Append(Encoding.ASCII.GetString(buffer, 0, read)); var text = request.ToString(); var end = text.IndexOf("\r\n\r\n", StringComparison.Ordinal); if (end < 0) continue;
                            if (!text[..end].Contains("Transfer-Encoding: chunked", StringComparison.OrdinalIgnoreCase) || text.EndsWith("\r\n0\r\n\r\n", StringComparison.Ordinal)) break;
                        }
                        Count++; await stream.WriteAsync(Encoding.UTF8.GetBytes(response(Origin, Count)), stop.Token);
                    }
                }
                catch (OperationCanceledException) { }
                catch (SocketException) when (stop.IsCancellationRequested) { }
            });
        }
        public async ValueTask DisposeAsync() { stop.Cancel(); listener.Stop(); await running; stop.Dispose(); }
    }
}
