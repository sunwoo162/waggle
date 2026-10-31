using Waggle.Core;
namespace Waggle.Tests;

[TestClass]
public sealed class WifiPolicyTests
{
    internal static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-30T00:00:00Z");
    internal static SchoolConfig Config => new(1, 1, [new(SchoolConfigTests.NetworkId, " QA 학교망 ", "wpa2-personal", "synthetic-fixture-only")], [new(SchoolConfigTests.ApId, SchoolConfigTests.NetworkId, "02:00:00:00:00:01"), new("33333333-3333-4333-8333-333333333333", SchoolConfigTests.NetworkId, "02:00:00:00:00:02")]);
    internal static WifiObservation Observation(int quality = 30, int candidateQuality = 65) => new(new(" QA 학교망 ", "02:00:00:00:00:01", "wpa2-personal", quality), [new(" QA 학교망 ", "02:00:00:00:00:02", true, candidateQuality, Now)]);
    [TestMethod]
    public void NormalAndForeignConnectionsAreMaintainedRegardlessOfCollection()
    {
        var policy = new WifiPolicy();
        Assert.AreEqual(WifiAction.Keep, policy.Decide(Config, Observation(65), Now).Action);
        var foreign = Observation() with { Connection = new("집", "02:00:00:00:00:03", "wpa2-personal", 5) };
        for (var i = 0; i < 5; i++) Assert.AreEqual(WifiAction.Keep, policy.Decide(Config, foreign, Now.AddSeconds(i * 10)).Action);
    }
    [TestMethod]
    public void ThreeWeakSamplesAndSufficientImprovementAreRequired()
    {
        var policy = new WifiPolicy();
        Assert.AreEqual(WifiAction.Keep, policy.Decide(Config, Observation(), Now).Action);
        Assert.AreEqual(WifiAction.Keep, policy.Decide(Config, Observation(), Now.AddSeconds(10)).Action);
        var decision = policy.Decide(Config, Observation(), Now.AddSeconds(20));
        Assert.AreEqual(WifiAction.Connect, decision.Action); Assert.AreEqual("02:00:00:00:00:02", decision.Target!.Bssid); Assert.AreEqual(SchoolConfigTests.NetworkId, decision.Target.NetworkId);
        var insufficient = new WifiPolicy();
        for (var i = 0; i < 5; i++) Assert.AreEqual(WifiAction.Keep, insufficient.Decide(Config, Observation(34, 45), Now.AddSeconds(i * 10)).Action);
        policy.Decide(Config, Observation(50), Now.AddSeconds(30));
        Assert.AreEqual(WifiAction.Keep, policy.Decide(Config, Observation(), Now.AddSeconds(40)).Action);
    }
    [TestMethod]
    public void PendingRequestCooldownAndFailedCandidatePreventRepeatedSwitching()
    {
        var policy = new WifiPolicy(); var disconnected = Observation() with { Connection = null };
        var target = policy.Decide(Config, disconnected, Now).Target!;
        policy.Requested(target, Now);
        Assert.AreEqual(WifiAction.Wait, policy.Decide(Config, disconnected, Now.AddSeconds(10)).Action);
        Assert.AreEqual(WifiAction.Keep, policy.Decide(Config, disconnected, Now.AddSeconds(31)).Action);
        Assert.AreEqual(WifiAction.Keep, policy.Decide(Config, disconnected, Now.AddSeconds(61)).Action);
        var later = disconnected with { Candidates = [disconnected.Candidates[0] with { LastSeen = Now.AddMinutes(6) }] };
        Assert.AreEqual(WifiAction.Connect, policy.Decide(Config, later, Now.AddMinutes(6)).Action);
    }
    [TestMethod]
    public void UnknownStaleInsecureOrTooWeakCandidatesAreNeverSelected()
    {
        foreach (var candidate in new[] {
            Observation().Candidates[0] with { Ssid="다른 이름" },
            Observation().Candidates[0] with { Secured=false },
            Observation().Candidates[0] with { Quality=44 },
            Observation().Candidates[0] with { LastSeen=Now.AddSeconds(-91) },
            Observation().Candidates[0] with { LastSeen=Now.AddSeconds(10) } })
            Assert.AreEqual(WifiAction.Keep, new WifiPolicy().Decide(Config, new(null, [candidate]), Now).Action);
    }
    internal const string OtherRoom = "44444444-4444-4444-8444-444444444444";
    // Rooms registered by SSID only: no BSSIDs at all.
    internal static SchoolConfig Rooms => new(1, 1, [new(SchoolConfigTests.NetworkId, "GSM-3-1", "wpa2-personal", "synthetic-fixture-only"), new(OtherRoom, "GSM-3-2", "wpa2-personal", "synthetic-fixture-two")], []);
    [TestMethod]
    public void SsidOnlyRoomsAreManagedWithoutRegisteredBssids()
    {
        var weak = new WifiObservation(new("GSM-3-1", "02:aa:00:00:00:01", "wpa2-personal", 20), [new("GSM-3-2", "02:bb:00:00:00:07", true, 80, Now)]);
        var policy = new WifiPolicy(); WifiDecision decision = null!;
        for (var i = 0; i < 3; i++) decision = policy.Decide(Rooms, weak, Now.AddSeconds(i * 10));
        Assert.AreEqual(WifiAction.Connect, decision.Action);
        Assert.AreEqual(OtherRoom, decision.Target!.NetworkId); Assert.AreEqual("02:bb:00:00:00:07", decision.Target.Bssid);
        Assert.AreEqual(OtherRoom, WifiMatch.ConnectedNetwork(Rooms, weak.Connection! with { Ssid = "GSM-3-2", Bssid = "02:cc:00:00:00:01" })!.Id);
        Assert.IsNull(WifiMatch.ConnectedNetwork(Rooms, weak.Connection! with { Security = "open" }));
        Assert.IsNull(WifiMatch.ConnectedAp(Rooms, weak.Connection!));
        var unregisteredBssid = new WifiObservation(null, [new(" QA 학교망 ", "02:00:00:00:00:09", true, 70, Now)]);
        Assert.AreEqual("02:00:00:00:00:09", new WifiPolicy().Decide(Config, unregisteredBssid, Now).Target!.Bssid);
    }
    [TestMethod]
    public void SameRoomMoveIsConfirmedOnlyWhenTheTargetBssidIsReached()
    {
        var policy = new WifiPolicy(); WifiDecision decision = null!;
        for (var i = 0; i < 3; i++) decision = policy.Decide(Config, Observation(), Now.AddSeconds(i * 10));
        Assert.AreEqual("02:00:00:00:00:02", decision.Target!.Bssid);
        policy.Requested(decision.Target, Now.AddSeconds(20));
        Assert.AreEqual(WifiAction.Wait, policy.Decide(Config, Observation(), Now.AddSeconds(30)).Action);
        policy.Decide(Config, Observation(), Now.AddSeconds(51));
        Assert.AreEqual(SchoolConfigTests.NetworkId, policy.TimedOutNetworkId);
        for (var i = 0; i < 6; i++) Assert.AreNotEqual(WifiAction.Connect, policy.Decide(Config, Observation(), Now.AddSeconds(120 + i * 10)).Action);
        var reached = new WifiPolicy();
        reached.Requested(decision.Target, Now);
        Assert.AreNotEqual(WifiAction.Wait, reached.Decide(Config, Observation() with { Connection = Observation().Connection! with { Bssid = "02:00:00:00:00:02", Quality = 70 } }, Now.AddSeconds(10)).Action);
    }
    [TestMethod]
    public void AmbiguousDuplicateSsidIsNeverChosenAndRejectedProfileBlocksTheRoom()
    {
        var duplicate = Rooms with { Networks = [.. Rooms.Networks, new("55555555-5555-4555-8555-555555555555", "GSM-3-2", "wpa3-personal", "synthetic-fixture-three")] };
        var seen = new WifiObservation(null, [new("GSM-3-2", "02:bb:00:00:00:07", true, 80, Now)]);
        Assert.AreEqual(WifiAction.Keep, new WifiPolicy().Decide(duplicate, seen, Now).Action);
        var policy = new WifiPolicy();
        var target = policy.Decide(Rooms, seen, Now).Target!;
        policy.Failed(target.Bssid, Now, target.NetworkId);
        var otherBssid = seen with { Candidates = [new("GSM-3-2", "02:bb:00:00:00:08", true, 85, Now.AddSeconds(70))] };
        Assert.AreEqual(WifiAction.Keep, policy.Decide(Rooms, otherBssid, Now.AddSeconds(70)).Action);
    }
    [TestMethod]
    public void OnlyActualOsConnectionMatchingSsidBssidAndSecurityResolvesCollectedAp()
    {
        Assert.AreEqual(Config.AccessPoints[0].Id, WifiMatch.ConnectedAp(Config, Observation().Connection!)!.Id);
        Assert.IsNull(WifiMatch.ConnectedAp(Config, null));
        Assert.IsNull(WifiMatch.ConnectedAp(Config, Observation().Connection! with { Security = "open" }));
        Assert.IsNull(WifiMatch.ConnectedAp(Config, Observation().Connection! with { Ssid = "잘못된 이름" }));
        Assert.IsNull(WifiMatch.ConnectedAp(Config, Observation().Connection! with { Bssid = "02:00:00:00:00:03" }));
    }
}
