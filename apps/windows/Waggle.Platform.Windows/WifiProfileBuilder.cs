using System.Security.Cryptography;
using System.Text;
using System.Xml.Linq;
using Waggle.Core;
namespace Waggle.Platform.Windows;

internal sealed record WifiProfile(string Name, string Xml)
{
    public override string ToString() => "WifiProfile [redacted]";
}
internal static class WifiProfileBuilder
{
    internal static WifiProfile Build(Uri origin, NetworkConfig network)
    {
        new SchoolConfig(1, 0, [network], []).Validate();
        var service = ServiceOrigin.Parse(origin.AbsoluteUri).AbsoluteUri;
        var name = "Waggle-" + Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(service)))[..12] + "-" + network.Id;
        XNamespace ns = "http://www.microsoft.com/networking/WLAN/profile/v1";
        XElement E(string key, object value) => new(ns + key, value);
        var encryption = E("authEncryption", new[] { E("authentication", network.Security switch { "open" => "open", "wpa3-personal" => "WPA3SAE", _ => "WPA2PSK" }), E("encryption", network.Security == "open" ? "none" : "AES"), E("useOneX", "false") });
        var security = E("security", encryption);
        if (network.Password is { } password) security.Add(E("sharedKey", new[] { E("keyType", network.Security == "wpa2-personal" && password.Length == 64 ? "networkKey" : "passPhrase"), E("protected", "false"), E("keyMaterial", password) }));
        var xml = new XDocument(E("WLANProfile", new[] { E("name", name), E("SSIDConfig", new[] { E("SSID", new[] { E("hex", Convert.ToHexString(Encoding.UTF8.GetBytes(network.Ssid))), E("name", network.Ssid) }), E("nonBroadcast", "false") }), E("connectionType", "ESS"), E("connectionMode", "manual"), E("MSM", security) }));
        return new(name, xml.ToString(SaveOptions.DisableFormatting));
    }
}
