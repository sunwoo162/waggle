namespace Waggle.Core;

public sealed class WifiPolicy
{
    private readonly Dictionary<string, DateTimeOffset> blocked = [];
    private readonly Dictionary<string, DateTimeOffset> blockedNetworks = [];
    // Network the device was on when the last Connect decision was made.
    private string? decidedFrom;
    private bool pendingSameNetwork;
    private int weakSamples;
    private int upgradeSamples;
    private DateTimeOffset? lastRequest;
    private (string NetworkId, DateTimeOffset Deadline)? pending;
    private string? pendingBssid;
    public string? TimedOutNetworkId { get; private set; }
    public WifiDecision Decide(SchoolConfig config, WifiObservation observation, DateTimeOffset now)
    {
        config.Validate(); TimedOutNetworkId = null;
        var current = WifiMatch.ConnectedNetwork(config, observation.Connection);
        if (pending is { } request)
        {
            // Moving within the same room counts only once the requested BSSID is actually reached.
            if (current?.Id == request.NetworkId && (!pendingSameNetwork || observation.Connection?.Bssid == pendingBssid)) { pending = null; weakSamples = 0; }
            else if (now >= request.Deadline) { TimedOutNetworkId = request.NetworkId; Failed(pendingBssid!, now); }
            else return new(WifiAction.Wait, WifiReason.PendingConnection);
        }
        if (observation.Busy) return new(WifiAction.Wait, WifiReason.AdapterBusy);
        if (lastRequest is { } previous && now - previous < TimeSpan.FromSeconds(60)) return new(WifiAction.Keep, WifiReason.Cooldown);
        if (observation.Connection is { } connected)
        {
            if (current is null) { weakSamples = 0; return new(WifiAction.Keep, WifiReason.ForeignConnection); }
            if (connected.Quality >= 35)
            {
                weakSamples = 0;
                // 2.4 GHz reaches the neighbouring rooms, so a usable 2.4 GHz link can be the room the student left.
                // A strong registered 5/6 GHz network nearby is the better signal of where the device is now.
                var band = observation.Candidates.FirstOrDefault(c => c.Bssid == connected.Bssid);
                var upgrade = band is { LowBand: true } ? Best(Targets(config, observation, now).Where(t => t.HighBand && t.Quality >= StrongHighBand)) : null;
                if (upgrade is null) { upgradeSamples = 0; return new(WifiAction.Keep, WifiReason.NormalConnection); }
                if (++upgradeSamples < 2) return new(WifiAction.Keep, WifiReason.NormalConnection);
                upgradeSamples = 0; decidedFrom = current.Id;
                return new(WifiAction.Connect, WifiReason.BandUpgrade, upgrade);
            }
            upgradeSamples = 0;
            weakSamples++;
            if (weakSamples < 3) return new(WifiAction.Keep, WifiReason.WeakConnection);
        }
        else { weakSamples = 0; upgradeSamples = 0; }
        var best = Best(Targets(config, observation, now));
        if (best is null || observation.Connection is { } old && best.Quality - old.Quality < 15) return new(WifiAction.Keep, WifiReason.NoCandidate);
        decidedFrom = current?.Id;
        return new(WifiAction.Connect, WifiReason.WeakConnection, best);
    }
    private const int StrongHighBand = 60;
    // A strong 5/6 GHz candidate wins over a stronger 2.4 GHz one; otherwise the strongest signal wins.
    private static WifiTarget? Best(IEnumerable<WifiTarget> targets) =>
        targets.OrderByDescending(t => t.HighBand && t.Quality >= StrongHighBand).ThenByDescending(t => t.Quality).ThenBy(t => t.Bssid, StringComparer.Ordinal).FirstOrDefault();
    private List<WifiTarget> Targets(SchoolConfig config, WifiObservation observation, DateTimeOffset now)
    {
        var targets = new List<WifiTarget>();
        foreach (var candidate in observation.Candidates)
        {
            if (candidate.Quality is < 45 or > 100 || candidate.LastSeen > now || now - candidate.LastSeen > TimeSpan.FromSeconds(90) || candidate.Bssid == observation.Connection?.Bssid || blocked.TryGetValue(candidate.Bssid, out var until) && now < until) continue;
            var matches = config.Networks.Where(n => n.Ssid == candidate.Ssid && candidate.Secured == (n.Security != "open")).Take(2).ToArray();
            // Two registered networks with the same name are ambiguous: never guess which password applies.
            if (matches.Length != 1 || blockedNetworks.TryGetValue(matches[0].Id, out var networkUntil) && now < networkUntil) continue;
            var network = matches[0];
            targets.Add(new(network.Id, network, candidate.Bssid, candidate.Quality, candidate.HighBand));
        }
        return targets;
    }
    public void Requested(WifiTarget target, DateTimeOffset now)
    {
        lastRequest = now; weakSamples = 0; upgradeSamples = 0; pending = (target.NetworkId, now.AddSeconds(30)); pendingBssid = target.Bssid; pendingSameNetwork = decidedFrom == target.NetworkId;
    }
    // A rejected profile (e.g. wrong password) is a room-level failure: block every BSSID of that network.
    public void Failed(string bssid, DateTimeOffset now, string? networkId = null)
    {
        lastRequest = now; weakSamples = 0; pending = null; blocked[bssid] = now.AddMinutes(5);
        if (networkId is not null) blockedNetworks[networkId] = now.AddMinutes(5);
    }
    public void Reset() { weakSamples = 0; upgradeSamples = 0; lastRequest = null; pending = null; pendingBssid = null; decidedFrom = null; pendingSameNetwork = false; TimedOutNetworkId = null; blocked.Clear(); blockedNetworks.Clear(); }
}
