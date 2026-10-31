using System.Text.Json;
using Waggle.Core;
namespace Waggle.Tests;

[TestClass]
public sealed class PhysicalApTests
{
    private const string Dual = """{"schemaVersion":1,"version":4,"networks":[{"id":"11111111-1111-4111-8111-111111111111","ssid":"GSM-3-1","security":"open","password":null}],"accessPoints":[{"id":"22222222-2222-4222-8222-222222222222","networkId":"11111111-1111-4111-8111-111111111111","bssid":"02:00:00:00:00:01","bssids":["02:00:00:00:00:01","02:00:00:00:00:02"]}]}""";
    private static SchoolConfig Parse(string json) => JsonSerializer.Deserialize<SchoolConfig>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;

    [TestMethod]
    public void AnyBssidOfAPhysicalApResolvesToTheSameCharacter()
    {
        var config = Parse(Dual); config.Validate();
        foreach (var bssid in new[] { "02:00:00:00:00:01", "02:00:00:00:00:02" })
            Assert.AreEqual("22222222-2222-4222-8222-222222222222", WifiMatch.ConnectedAp(config, new("GSM-3-1", bssid, "open", 60))?.Id);
        Assert.IsNull(WifiMatch.ConnectedAp(config, new("GSM-3-1", "02:00:00:00:00:03", "open", 60)));
        Assert.IsTrue(new ConnectionReport("22222222-2222-4222-8222-222222222222", "GSM-3-1", "02:00:00:00:00:02").Matches(config));
        Assert.IsTrue(config.EquivalentTo(Parse(Dual)));
        // Older servers without "bssids" still work: the main BSSID alone.
        var single = Parse(Dual.Replace(",\"bssids\":[\"02:00:00:00:00:01\",\"02:00:00:00:00:02\"]", "")); single.Validate();
        Assert.IsNull(WifiMatch.ConnectedAp(single, new("GSM-3-1", "02:00:00:00:00:02", "open", 60)));
    }

    [TestMethod]
    public void BssidListMustStartWithTheMainBssidAndStayUniqueAcrossAps()
    {
        foreach (var bad in new[] {
            Dual.Replace("\"bssids\":[\"02:00:00:00:00:01\",", "\"bssids\":[\"02:00:00:00:00:09\","),
            Dual.Replace("\"02:00:00:00:00:02\"]", "\"02:00:00:00:00:01\"]"),
            Dual.Replace("\"02:00:00:00:00:02\"]", "\"03:00:00:00:00:02\"]") })
            Assert.ThrowsExactly<MemberException>(() => Parse(bad).Validate());
        var config = Parse(Dual);
        var clash = config with { AccessPoints = [.. config.AccessPoints, new("33333333-3333-4333-8333-333333333333", config.Networks[0].Id, "02:00:00:00:00:02")] };
        Assert.ThrowsExactly<MemberException>(() => clash.Validate());
    }
}
