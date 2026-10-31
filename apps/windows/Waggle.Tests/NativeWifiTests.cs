using System.Buffers.Binary;
using System.Text;
using System.Xml.Linq;
using Waggle.Core;
using Waggle.Platform.Windows;
namespace Waggle.Tests;

[TestClass]
public sealed class NativeWifiTests
{
    internal static readonly Guid AdapterId = Guid.Parse("55555555-5555-4555-8555-555555555555");
    internal static void U32(byte[] bytes, int offset, uint value) => BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(offset), value);
    internal static byte[] Interfaces()
    {
        var bytes = new byte[8 + 532]; U32(bytes, 0, 1); AdapterId.TryWriteBytes(bytes.AsSpan(8));
        Encoding.Unicode.GetBytes("합성 어댑터").CopyTo(bytes, 24); U32(bytes, 536, 4); return bytes;
    }
    internal static byte[] Bss()
    {
        var bytes = new byte[8 + 360]; U32(bytes, 0, (uint)bytes.Length); U32(bytes, 4, 1);
        var ssid = Encoding.UTF8.GetBytes(" QA 학교망 "); U32(bytes, 8, (uint)ssid.Length); ssid.CopyTo(bytes, 12);
        new byte[] { 2, 0, 0, 0, 0, 2 }.CopyTo(bytes, 48); U32(bytes, 56, 1); U32(bytes, 68, 65);
        BinaryPrimitives.WriteUInt64LittleEndian(bytes.AsSpan(88), (ulong)WifiPolicyTests.Now.ToFileTime());
        BinaryPrimitives.WriteUInt16LittleEndian(bytes.AsSpan(96), 0x10); return bytes;
    }
    internal static byte[] Connection()
    {
        var bytes = new byte[604]; U32(bytes, 0, 1);
        var ssid = Encoding.UTF8.GetBytes(" QA 학교망 "); U32(bytes, 520, (uint)ssid.Length); ssid.CopyTo(bytes, 524);
        U32(bytes, 556, 1); new byte[] { 2, 0, 0, 0, 0, 1 }.CopyTo(bytes, 560); U32(bytes, 576, 30);
        U32(bytes, 588, 1); U32(bytes, 596, 7); U32(bytes, 600, 4); return bytes;
    }
    [TestMethod]
    public void ParsesSdkLayoutsAndPreservesExactSsidWithoutCallingWindows()
    {
        Assert.AreEqual(AdapterId, NativeWifiBuffers.Interfaces(Interfaces()).Single().Id);
        Assert.AreEqual("합성 어댑터", NativeWifiBuffers.Interfaces(Interfaces()).Single().Name);
        var bss = NativeWifiBuffers.Bss(Bss()).Single();
        Assert.AreEqual(" QA 학교망 ", bss.Ssid); Assert.AreEqual("02:00:00:00:00:02", bss.Bssid);
        Assert.AreEqual(65, bss.Quality); Assert.IsTrue(bss.Secured); Assert.AreEqual(WifiPolicyTests.Now, bss.LastSeen);
        var current = NativeWifiBuffers.Connection(Connection());
        Assert.AreEqual(" QA 학교망 ", current!.Ssid); Assert.AreEqual(30, current.Quality); Assert.AreEqual("wpa2-personal", current.Security);
        Assert.AreEqual(40, NativeWifiBuffers.ConnectionParametersSize);
    }
    [TestMethod]
    public void RejectsMalformedNativeLengthsCountsAndSignals()
    {
        Assert.Throws<WifiException>(() => NativeWifiBuffers.Interfaces(new byte[7]));
        var many = Interfaces(); U32(many, 0, 17); Assert.Throws<WifiException>(() => NativeWifiBuffers.Interfaces(many));
        var truncated = Bss()[..^1]; Assert.Throws<WifiException>(() => NativeWifiBuffers.Bss(truncated));
        var invalid = Bss(); U32(invalid, 4, 10001); Assert.Throws<WifiException>(() => NativeWifiBuffers.Bss(invalid));
        var oversizedSsid = Bss(); U32(oversizedSsid, 8, 33); Assert.Throws<WifiException>(() => NativeWifiBuffers.Bss(oversizedSsid));
        var signal = Connection(); U32(signal, 576, 101); Assert.Throws<WifiException>(() => NativeWifiBuffers.Connection(signal));
        Assert.Throws<WifiException>(() => NativeWifiBuffers.Connection(Connection()[..603]));
        var invalidUtf8 = Bss(); U32(invalidUtf8, 8, 1); invalidUtf8[12] = 255; Assert.HasCount(0, NativeWifiBuffers.Bss(invalidUtf8));
        var disconnected = Connection(); U32(disconnected, 0, 4); Assert.IsNull(NativeWifiBuffers.Connection(disconnected));
        var nativeBool = Connection(); U32(nativeBool, 588, uint.MaxValue); Assert.AreEqual("wpa2-personal", NativeWifiBuffers.Connection(nativeBool)!.Security);
    }
    [TestMethod]
    public void ProfilesEscapeSsidAndSecretAndAreManualPerUserWithoutDowngrading()
    {
        var network = WifiPolicyTests.Config.Networks[0] with { Ssid = " QA & <학교> ", Password = "synthetic-<&-only" };
        var profile = WifiProfileBuilder.Build(new("https://waggle.example"), network);
        XNamespace ns = "http://www.microsoft.com/networking/WLAN/profile/v1";
        var root = XDocument.Parse(profile.Xml).Root!;
        Assert.AreEqual("manual", root.Element(ns + "connectionMode")!.Value);
        Assert.AreEqual(network.Ssid, root.Descendants(ns + "SSID").Single().Element(ns + "name")!.Value);
        Assert.AreEqual(Convert.ToHexString(Encoding.UTF8.GetBytes(network.Ssid)), root.Descendants(ns + "hex").Single().Value);
        Assert.AreEqual(network.Password, root.Descendants(ns + "keyMaterial").Single().Value);
        Assert.AreEqual("WPA2PSK", root.Descendants(ns + "authentication").Single().Value);
        Assert.DoesNotContain(network.Password, profile.ToString());
        Assert.AreNotEqual(profile.Name, WifiProfileBuilder.Build(new("https://other.example"), network).Name);
        Assert.AreEqual("WPA3SAE", XDocument.Parse(WifiProfileBuilder.Build(new("https://waggle.example"), network with { Security = "wpa3-personal" }).Xml).Descendants(ns + "authentication").Single().Value);
        Assert.IsFalse(XDocument.Parse(WifiProfileBuilder.Build(new("https://waggle.example"), network with { Security = "open", Password = null }).Xml).Descendants(ns + "sharedKey").Any());
    }
    [TestMethod]
    public async Task AdapterInstallsOnlyNamedPerUserProfileAndConnectionRequestIsNotConfirmation()
    {
        using var api = new Api(); using var adapter = new NativeWifiAdapter(api);
        Assert.AreEqual(AdapterId, (await adapter.InterfacesAsync(default)).Single().Id);
        Assert.AreEqual("02:00:00:00:00:01", (await adapter.ObserveAsync(AdapterId, default)).Connection!.Bssid);
        await adapter.ScanAsync(AdapterId, default);
        await adapter.ConnectAsync(AdapterId, new("https://waggle.example"), WifiPolicyTests.Config.Networks[0], "02:00:00:00:00:02", default);
        Assert.AreEqual(2u, api.Flags); Assert.IsTrue(api.Overwrite); Assert.StartsWith("Waggle-", api.ProfileName!);
        Assert.AreEqual(AdapterId, api.TargetAdapter); Assert.AreEqual(1, api.Scans);
        var preferred = api.Preferred!; Assert.HasCount(20, preferred);
        Assert.AreEqual(0x80, preferred[0]); Assert.AreEqual(1, preferred[1]); Assert.AreEqual(20, BinaryPrimitives.ReadUInt16LittleEndian(preferred.AsSpan(2)));
        Assert.AreEqual(1u, BinaryPrimitives.ReadUInt32LittleEndian(preferred.AsSpan(4))); Assert.AreEqual(1u, BinaryPrimitives.ReadUInt32LittleEndian(preferred.AsSpan(8)));
        CollectionAssert.AreEqual(new byte[] { 2, 0, 0, 0, 0, 2 }, preferred[12..18]);
        Assert.AreEqual("02:00:00:00:00:01", (await adapter.ObserveAsync(AdapterId, default)).Connection!.Bssid);
    }
    internal static byte[] ProfileList(string[] names)
    {
        var bytes = new byte[8 + names.Length * 516]; U32(bytes, 0, (uint)names.Length);
        for (var i = 0; i < names.Length; i++) Encoding.Unicode.GetBytes(names[i]).CopyTo(bytes, 8 + i * 516);
        return bytes;
    }
    [TestMethod]
    public async Task RemovesOnlyWaggleProfilesExceptTheKeptService()
    {
        var origin = new Uri("https://waggle.example");
        var mine = WifiProfileBuilder.Build(origin, WifiPolicyTests.Config.Networks[0]).Name;
        var other = WifiProfileBuilder.Build(new("https://other.example"), WifiPolicyTests.Config.Networks[0]).Name;
        using var api = new Api { Profiles = [mine, "집 Wi-Fi", other] }; using var adapter = new NativeWifiAdapter(api);
        await adapter.RemoveProfilesExceptAsync(origin, default);
        CollectionAssert.AreEqual(new[] { other }, api.Deleted);
        api.Deleted.Clear(); await adapter.RemoveProfilesExceptAsync(null, default);
        CollectionAssert.AreEqual(new[] { mine, other }, api.Deleted);
        CollectionAssert.AreEqual(new[] { mine, "집 Wi-Fi" }, NativeWifiBuffers.ProfileNames(ProfileList([mine, "집 Wi-Fi"])));
        var bad = ProfileList([mine]); U32(bad, 0, 2); Assert.Throws<WifiException>(() => NativeWifiBuffers.ProfileNames(bad));
    }
    [TestMethod]
    public async Task CancellationAfterProfileInstallDoesNotSendAnotherConnectionRequest()
    {
        using var ct = new CancellationTokenSource(); using var api = new Api { AfterInstall = () => ct.Cancel() }; using var adapter = new NativeWifiAdapter(api);
        await Assert.ThrowsAsync<OperationCanceledException>(() => adapter.ConnectAsync(AdapterId, new("https://waggle.example"), WifiPolicyTests.Config.Networks[0], "02:00:00:00:00:02", ct.Token));
        Assert.IsNull(api.Preferred);
    }
    internal sealed class Api : IWindowsWlanApi
    {
        public uint Flags; public bool Overwrite; public string? ProfileName; public byte[]? Preferred; public Guid TargetAdapter; public int Scans; public Action? AfterInstall;
        public byte[] Interfaces() => NativeWifiTests.Interfaces();
        public byte[]? Connection(Guid id) => NativeWifiTests.Connection();
        public byte[] Bss(Guid id) => NativeWifiTests.Bss();
        public void Scan(Guid id) { Scans++; }
        public void SetProfile(Guid id, string xml, uint flags, bool overwrite) { Flags = flags; Overwrite = overwrite; AfterInstall?.Invoke(); }
        public void Connect(Guid id, string name, byte[] preferred) { TargetAdapter = id; ProfileName = name; Preferred = preferred; }
        public string[] Profiles = []; public List<string> Deleted = [];
        public byte[] ProfileList(Guid id) => NativeWifiTests.ProfileList(Profiles);
        public void DeleteProfile(Guid id, string name) => Deleted.Add(name);
        public void Dispose() { }
    }
}
