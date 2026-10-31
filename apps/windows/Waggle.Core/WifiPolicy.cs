namespace Waggle.Core;

public sealed class WifiPolicy
{
    private readonly Dictionary<string, DateTimeOffset> blocked = [];
    private int weakSamples;
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
            if (current?.Id == request.NetworkId) { pending = null; weakSamples = 0; }
            else if (now >= request.Deadline) { TimedOutNetworkId = request.NetworkId; Failed(pendingBssid!, now); }
            else return new(WifiAction.Wait, WifiReason.PendingConnection);
        }
        if (observation.Busy) return new(WifiAction.Wait, WifiReason.AdapterBusy);
        if (lastRequest is { } previous && now - previous < TimeSpan.FromSeconds(60)) return new(WifiAction.Keep, WifiReason.Cooldown);
        if (observation.Connection is { } connected)
        {
            if (current is null) { weakSamples = 0; return new(WifiAction.Keep, WifiReason.ForeignConnection); }
            if (connected.Quality >= 35) { weakSamples = 0; return new(WifiAction.Keep, WifiReason.NormalConnection); }
            weakSamples++;
            if (weakSamples < 3) return new(WifiAction.Keep, WifiReason.WeakConnection);
        }
        else weakSamples = 0;
        var candidates = new List<WifiTarget>();
        foreach (var candidate in observation.Candidates)
        {
            if (candidate.Quality is < 45 or > 100 || candidate.LastSeen > now || now - candidate.LastSeen > TimeSpan.FromSeconds(90) || candidate.Bssid == observation.Connection?.Bssid || blocked.TryGetValue(candidate.Bssid, out var until) && now < until) continue;
            var network = config.Networks.FirstOrDefault(n => n.Ssid == candidate.Ssid && candidate.Secured == (n.Security != "open"));
            if (network is null) continue;
            candidates.Add(new(network.Id, network, candidate.Bssid, candidate.Quality));
        }
        var best = candidates.OrderByDescending(c => c.Quality).ThenBy(c => c.Bssid, StringComparer.Ordinal).FirstOrDefault();
        if (best is null || observation.Connection is { } old && best.Quality - old.Quality < 15) return new(WifiAction.Keep, WifiReason.NoCandidate);
        return new(WifiAction.Connect, WifiReason.WeakConnection, best);
    }
    public void Requested(WifiTarget target, DateTimeOffset now)
    {
        lastRequest = now; weakSamples = 0; pending = (target.NetworkId, now.AddSeconds(30)); pendingBssid = target.Bssid;
    }
    public void Failed(string bssid, DateTimeOffset now)
    {
        lastRequest = now; weakSamples = 0; pending = null; blocked[bssid] = now.AddMinutes(5);
    }
    public void Reset() { weakSamples = 0; lastRequest = null; pending = null; pendingBssid = null; TimedOutNetworkId = null; blocked.Clear(); }
}
