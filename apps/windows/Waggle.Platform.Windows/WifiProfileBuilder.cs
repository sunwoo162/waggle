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
    // Exactly the names Build produces, so a user's own network such as "Waggle-Guest" is never touched.
    private static readonly System.Text.RegularExpressions.Regex Owned = new(@"\AWaggle-[0-9a-f]{12}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z", System.Text.RegularExpressions.RegexOptions.CultureInvariant);
    internal static bool IsOwned(string name) => Owned.IsMatch(name);
    internal static string Prefix(Uri origin) => "Waggle-" + Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(ServiceOrigin.Parse(origin.AbsoluteUri).AbsoluteUri)))[..12] + "-";
    internal static WifiProfile Build(Uri origin, NetworkConfig network)
    {
        new SchoolConfig(1, 0, [network], []).Validate();
        var name = Prefix(origin) + network.Id;
        XNamespace ns = "http://www.microsoft.com/networking/WLAN/profile/v1";
        XElement E(string key, object value) => new(ns + key, value);
        var encryption = E("authEncryption", new[] { E("authentication", network.Security switch { "open" => "open", "wpa3-personal" => "WPA3SAE", _ => "WPA2PSK" }), E("encryption", network.Security == "open" ? "none" : "AES"), E("useOneX", "false") });
        var security = E("security", encryption);
        if (network.Password is { } password) security.Add(E("sharedKey", new[] { E("keyType", network.Security == "wpa2-personal" && password.Length == 64 ? "networkKey" : "passPhrase"), E("protected", "false"), E("keyMaterial", password) }));
        var xml = new XDocument(E("WLANProfile", new[] { E("name", name), E("SSIDConfig", new[] { E("SSID", new[] { E("hex", Convert.ToHexString(Encoding.UTF8.GetBytes(network.Ssid))), E("name", network.Ssid) }), E("nonBroadcast", "false") }), E("connectionType", "ESS"), E("connectionMode", "manual"), E("MSM", security) }));
        return new(name, xml.ToString(SaveOptions.DisableFormatting));
    }
}
