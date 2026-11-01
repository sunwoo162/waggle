using System.Buffers.Binary;
using System.Runtime.InteropServices;
using System.Text;
using Waggle.Core;
namespace Waggle.Platform.Windows;

// Layouts are fixed by wlanapi.h in Windows SDK 10.0.26100, including native padding.
internal static class NativeWifiBuffers
{
    internal const int InterfaceSize = 532, BssSize = 360, ConnectionSize = 604;
    internal static int ConnectionParametersSize => Marshal.SizeOf<WlanConnectionParameters>();
    private static uint U32(ReadOnlySpan<byte> data, int offset) => BinaryPrimitives.ReadUInt32LittleEndian(data[offset..]);
    private static void Require(bool condition) { if (!condition) throw new WifiException(WifiFailure.InvalidResponse); }
    private static string? Ssid(ReadOnlySpan<byte> data)
    {
        var count = U32(data, 0); Require(count <= 32);
        if (count == 0) return null;
        try { var text = new UTF8Encoding(false, true).GetString(data.Slice(4, (int)count)); return text.Any(char.IsControl) ? null : text; }
        catch (DecoderFallbackException) { return null; }
    }
    private static string? Bssid(ReadOnlySpan<byte> value) => (value[0] & 1) != 0 || value.IndexOfAnyExcept((byte)0) < 0 ? null : string.Join(":", value.ToArray().Select(b => b.ToString("x2")));
    internal static WifiInterface[] Interfaces(ReadOnlySpan<byte> data)
    {
        Require(data.Length >= 8);
        var count = U32(data, 0); Require(count <= 16 && 8 + count * InterfaceSize <= data.Length);
        var result = new List<WifiInterface>();
        for (var i = 0; i < count; i++)
        {
            var entry = data.Slice(8 + i * InterfaceSize, InterfaceSize);
            var name = Encoding.Unicode.GetString(entry.Slice(16, 512)).Split('\0')[0];
            var state = U32(entry, 528);
            result.Add(new(new Guid(entry[..16]), name, state is 5 or 6 or 7));
        }
        return [.. result];
    }
    internal static WifiCandidate[] Bss(ReadOnlySpan<byte> data)
    {
        Require(data.Length >= 8);
        var total = U32(data, 0); var count = U32(data, 4);
        Require(total >= 8 && total <= data.Length && total <= 8 * 1024 * 1024 && count <= 10000 && 8 + count * BssSize <= total);
        var result = new List<WifiCandidate>();
        for (var i = 0; i < count; i++)
        {
            var entry = data.Slice(8 + i * BssSize, BssSize);
            var ssid = Ssid(entry[..36]); var bssid = Bssid(entry.Slice(40, 6));
            var quality = U32(entry, 60); Require(quality <= 100);
            if (ssid is null || bssid is null || U32(entry, 48) != 1) continue;
            var timestamp = BinaryPrimitives.ReadUInt64LittleEndian(entry[80..]);
            if (timestamp > long.MaxValue) continue;
            DateTimeOffset lastSeen;
            try { lastSeen = DateTimeOffset.FromFileTime((long)timestamp); } catch (ArgumentOutOfRangeException) { continue; }
            var secured = (BinaryPrimitives.ReadUInt16LittleEndian(entry[88..]) & 0x10) != 0;
            // ulChCenterFrequency is in kHz; anything outside the Wi-Fi bands is treated as unknown.
            var kilohertz = U32(entry, 92);
            var megahertz = kilohertz is >= 2_400_000 and <= 7_200_000 ? (int)(kilohertz / 1000) : 0;
            result.Add(new(ssid, bssid, secured, (int)quality, lastSeen, megahertz));
        }
        return [.. result];
    }
    internal static ConnectedWifi? Connection(ReadOnlySpan<byte> data)
    {
        Require(data.Length >= ConnectionSize);
        if (U32(data, 0) != 1) return null;
        var quality = U32(data, 576); Require(quality <= 100);
        var bssid = Bssid(data.Slice(560, 6)); Require(bssid is not null);
        var authentication = U32(data, 596); var cipher = U32(data, 600);
        var security = U32(data, 592) != 0 ? "unsupported" : (authentication, cipher, U32(data, 588) != 0) switch
        {
            (1, 0, false) => "open",
            (7, 4, true) => "wpa2-personal",
            (9, 4, true) => "wpa3-personal",
            _ => "unsupported"
        };
        return new(Ssid(data.Slice(520, 36)), bssid!, security, (int)quality);
    }
    internal const int ProfileInfoSize = 516;
    internal static string[] ProfileNames(ReadOnlySpan<byte> data)
    {
        Require(data.Length >= 8);
        var count = U32(data, 0);
        Require(count <= 4096 && data.Length >= 8 + count * ProfileInfoSize);
        var names = new string[count];
        for (var i = 0; i < count; i++)
        {
            var raw = System.Runtime.InteropServices.MemoryMarshal.Cast<byte, char>(data.Slice(8 + i * ProfileInfoSize, 512));
            var end = raw.IndexOf('\0'); names[i] = new string(end < 0 ? raw : raw[..end]);
        }
        return names;
    }
    internal static byte[] BssidPreference(string bssid)
    {
        var bytes = new byte[20]; bytes[0] = 0x80; bytes[1] = 1;
        BinaryPrimitives.WriteUInt16LittleEndian(bytes.AsSpan(2), 20);
        BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(4), 1);
        BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(8), 1);
        Convert.FromHexString(bssid.Replace(":", "")).CopyTo(bytes, 12);
        return bytes;
    }
}
