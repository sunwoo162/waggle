namespace Waggle.Core;

public sealed class WifiPolicy
{
    private readonly Dictionary<string, DateTimeOffset> blocked = [];
    private int weakSamples;
    private DateTimeOffset? lastRequest;
    private (string ApId, DateTimeOffset Deadline)? pending;
    public string? TimedOutApId { get; private set; }
    public WifiDecision Decide(SchoolConfig config, WifiObservation observation, DateTimeOffset now)
    {
        config.Validate(); TimedOutApId = null;
        var current = WifiMatch.ConnectedAp(config, observation.Connection);
        if (pending is { } request)
        {
            if (current?.Id == request.ApId) { pending = null; weakSamples = 0; }
            else if (now >= request.Deadline) { TimedOutApId = request.ApId; Failed(request.ApId, now); }
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
        var networks = config.Networks.ToDictionary(n => n.Id);
        var aps = config.AccessPoints.ToDictionary(a => a.Bssid);
        var candidates = new List<WifiTarget>();
        foreach (var candidate in observation.Candidates)
        {
            if (candidate.Quality is < 45 or > 100 || candidate.LastSeen > now || now - candidate.LastSeen > TimeSpan.FromSeconds(90) || !aps.TryGetValue(candidate.Bssid, out var ap) || ap.Id == current?.Id || blocked.TryGetValue(ap.Id, out var until) && now < until) continue;
            var network = networks[ap.NetworkId];
            if (network.Ssid != candidate.Ssid || candidate.Secured != (network.Security != "open")) continue;
            candidates.Add(new(ap.Id, network, ap.Bssid, candidate.Quality));
        }
        var best = candidates.OrderByDescending(c => c.Quality).ThenBy(c => c.ApId, StringComparer.Ordinal).FirstOrDefault();
        if (best is null || observation.Connection is { } old && best.Quality - old.Quality < 15) return new(WifiAction.Keep, WifiReason.NoCandidate);
        return new(WifiAction.Connect, WifiReason.WeakConnection, best);
    }
    public void Requested(WifiTarget target, DateTimeOffset now)
    {
        lastRequest = now; weakSamples = 0; pending = (target.ApId, now.AddSeconds(30));
    }
    public void Failed(string apId, DateTimeOffset now)
    {
        lastRequest = now; weakSamples = 0; pending = null; blocked[apId] = now.AddMinutes(5);
    }
    public void Reset() { weakSamples = 0; lastRequest = null; pending = null; TimedOutApId = null; blocked.Clear(); }
}
