using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using SkiaSharp;
using Waggle.Core;
namespace Waggle.Platform.Windows;

public sealed record DecodedArt(byte[] Png, int Width, int Height);
public static class ArtDecoder
{
    public static DecodedArt DecodeWebp(byte[] bytes, string expectedHash)
    {
        static void Require([DoesNotReturnIf(false)] bool valid) { if (!valid) throw new MemberException(Failure.InvalidResponse); }
        Require(bytes.Length is > 12 and <= 1024 * 1024 && expectedHash.Length == 64 && Convert.ToHexStringLower(SHA256.HashData(bytes)) == expectedHash);
        using var data = SKData.CreateCopy(bytes);
        using var codec = SKCodec.Create(data);
        Require(codec is not null && codec.EncodedFormat == SKEncodedImageFormat.Webp && codec.FrameCount <= 1 && codec.Info.Width is > 0 and <= 1024 && codec.Info.Height is > 0 and <= 1024);
        using var bitmap = SKBitmap.Decode(bytes);
        Require(bitmap is not null);
        using var image = SKImage.FromBitmap(bitmap);
        using var png = image.Encode(SKEncodedImageFormat.Png, 100);
        Require(png is not null);
        return new(png.ToArray(), codec.Info.Width, codec.Info.Height);
    }
}
