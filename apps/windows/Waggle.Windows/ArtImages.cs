using System.Collections.Concurrent;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Waggle.Platform.Windows;
namespace Waggle.Windows;

internal sealed record ArtFrames(BitmapSource Color, BitmapSource Gray);
internal sealed class ArtImages : IDisposable
{
    private readonly ArtClient client = new();
    private readonly SemaphoreSlim slots = new(2, 2);
    private readonly CancellationTokenSource lifetime = new();
    private readonly ConcurrentDictionary<string, Lazy<Task<ArtFrames?>>> pending = new(StringComparer.Ordinal);
    private readonly Dictionary<string, ArtFrames> cache = new(StringComparer.Ordinal);
    private readonly Queue<string> order = new();
    internal async Task<ArtFrames?> LoadAsync(string origin, string path, CancellationToken ct)
    {
        var key = origin + path;
        lock (cache) { if (cache.TryGetValue(key, out var cached)) return cached; }
        return await pending.GetOrAdd(key, _ => new(() => LoadCoreAsync(key, origin, path))).Value.WaitAsync(ct);
    }
    private async Task<ArtFrames?> LoadCoreAsync(string key, string origin, string path)
    {
        var acquired = false;
        try
        {
            await slots.WaitAsync(lifetime.Token); acquired = true;
            var decoded = await client.DownloadAsync(origin, path, lifetime.Token);
            var frames = await Task.Run(() => CreateFrames(decoded), lifetime.Token);
            lock (cache)
            {
                cache[key] = frames; order.Enqueue(key);
                while (cache.Count > 24 && order.TryDequeue(out var oldest)) cache.Remove(oldest);
            }
            return frames;
        }
        catch (Exception) { return null; }
        finally { if (acquired) slots.Release(); pending.TryRemove(key, out _); }
    }
    private static ArtFrames CreateFrames(DecodedArt decoded)
    {
        var scale = Math.Min(1d, 384d / Math.Max(decoded.Width, decoded.Height));
        var image = new BitmapImage();
        using (var stream = new MemoryStream(decoded.Png, writable: false))
        {
            image.BeginInit(); image.CacheOption = BitmapCacheOption.OnLoad;
            image.DecodePixelWidth = Math.Max(1, (int)(decoded.Width * scale)); image.DecodePixelHeight = Math.Max(1, (int)(decoded.Height * scale));
            image.StreamSource = stream; image.EndInit(); image.Freeze();
        }
        var bgra = new FormatConvertedBitmap(image, PixelFormats.Pbgra32, null, 0); bgra.Freeze();
        var stride = bgra.PixelWidth * 4; var pixels = new byte[stride * bgra.PixelHeight]; bgra.CopyPixels(pixels, stride, 0);
        for (var i = 0; i < pixels.Length; i += 4)
        {
            var gray = (byte)(((pixels[i + 2] * 77 + pixels[i + 1] * 150 + pixels[i] * 29) >> 8) * 65 / 100);
            pixels[i] = pixels[i + 1] = pixels[i + 2] = gray;
        }
        var grayscale = BitmapSource.Create(bgra.PixelWidth, bgra.PixelHeight, 96, 96, PixelFormats.Pbgra32, null, pixels, stride); grayscale.Freeze();
        return new(image, grayscale);
    }
    public void Dispose() { lifetime.Cancel(); client.Dispose(); lock (cache) { cache.Clear(); order.Clear(); } }
}
