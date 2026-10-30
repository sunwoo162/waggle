using System.Security.Cryptography;
using System.Net;
using System.Net.Http.Headers;
using SkiaSharp;
using Waggle.Core;
using Waggle.Platform.Windows;
namespace Waggle.Tests;

[TestClass]
public sealed class ArtDecoderTests
{
    [TestMethod]
    public void DecodesHashMatchedStaticWebpToBoundedPng()
    {
        var bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Fixtures", "valid-art.webp"));
        var decoded = ArtDecoder.DecodeWebp(bytes, Convert.ToHexStringLower(SHA256.HashData(bytes)));
        Assert.AreEqual(24, decoded.Width); Assert.AreEqual(24, decoded.Height);
        using var image = SKCodec.Create(new MemoryStream(decoded.Png));
        Assert.IsNotNull(image); Assert.AreEqual(SKEncodedImageFormat.Png, image.EncodedFormat);
        Assert.Throws<MemberException>(() => ArtDecoder.DecodeWebp(bytes, new string('0', 64)));
    }
    [TestMethod]
    public void RejectsOversizedAnimatedOrForeignRasterBeforeAllocatingFullPixels()
    {
        foreach (var path in new[] { "oversized-art.webp", "animated-art.webp" })
        {
            var bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Fixtures", path));
            Assert.Throws<MemberException>(() => ArtDecoder.DecodeWebp(bytes, Convert.ToHexStringLower(SHA256.HashData(bytes))));
        }
        var fake = new byte[1024 * 1024 + 1];
        Assert.Throws<MemberException>(() => ArtDecoder.DecodeWebp(fake, Convert.ToHexStringLower(SHA256.HashData(fake))));
    }
    [TestMethod]
    public async Task PublicArtUsesOnlyValidatedSameServiceHashPathAndBoundedWebp()
    {
        var bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Fixtures", "valid-art.webp"));
        var hash = Convert.ToHexStringLower(SHA256.HashData(bytes)); var calls = 0;
        using var client = new ArtClient(new ProtocolTests.Handler(request =>
        {
            calls++; Assert.IsNull(request.Headers.Authorization); Assert.AreEqual("https://waggle.example/api/art/" + hash, request.RequestUri!.AbsoluteUri);
            var content = new ByteArrayContent(bytes); content.Headers.ContentType = new MediaTypeHeaderValue("image/webp");
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = content });
        }));
        Assert.AreEqual(24, (await client.DownloadAsync("https://waggle.example", "/api/art/" + hash, default)).Width);
        await Assert.ThrowsAsync<MemberException>(() => client.DownloadAsync("https://waggle.example", "https://foreign.example/picture", default));
        Assert.AreEqual(1, calls);
    }
}
