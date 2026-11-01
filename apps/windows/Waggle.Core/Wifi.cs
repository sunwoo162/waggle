namespace Waggle.Core;

public sealed record WifiInterface(Guid Id, string Name, bool Busy = false);
public sealed record ConnectedWifi(string? Ssid, string Bssid, string Security, int Quality);
/// <param name="FrequencyMhz">Channel centre frequency; 0 when unknown.</param>
public sealed record WifiCandidate(string Ssid, string Bssid, bool Secured, int Quality, DateTimeOffset LastSeen, int FrequencyMhz = 0)
{
    /// <summary>5 GHz or 6 GHz. These bands rarely reach the next room, unlike 2.4 GHz.</summary>
    public bool HighBand => FrequencyMhz >= 4900;
    public bool LowBand => FrequencyMhz is > 0 and < 4900;
}
public sealed record WifiObservation(ConnectedWifi? Connection, WifiCandidate[] Candidates, bool Busy = false);
public sealed record WifiTarget(string NetworkId, NetworkConfig Network, string Bssid, int Quality, bool HighBand = false);
public enum WifiAction { Keep, Wait, Connect }
public enum WifiReason { NormalConnection, ForeignConnection, WeakConnection, NoCandidate, Cooldown, PendingConnection, AdapterBusy, BandUpgrade }
public sealed record WifiDecision(WifiAction Action, WifiReason Reason, WifiTarget? Target = null);
public enum WifiFailure { LocationPermission, Permission, RadioOff, Unavailable, InvalidResponse, ProfileRejected, Busy }
public sealed class WifiException(WifiFailure failure) : Exception("waggle_wifi_" + failure)
{
    public WifiFailure Failure { get; } = failure;
}
public interface IWifiAdapter : IDisposable
{
    Task<WifiInterface[]> InterfacesAsync(CancellationToken ct);
    Task<WifiObservation> ObserveAsync(Guid adapterId, CancellationToken ct);
    Task ScanAsync(Guid adapterId, CancellationToken ct);
    Task ConnectAsync(Guid adapterId, Uri origin, NetworkConfig network, string bssid, CancellationToken ct);
    // Deletes Wi-Fi profiles this app installed, except those for the kept service origin (null: delete all).
    Task RemoveProfilesExceptAsync(Uri? keep, CancellationToken ct);
}
public static class WifiMatch
{
    // Connection management is by room network (SSID + security); BSSIDs only matter for characters.
    public static NetworkConfig? ConnectedNetwork(SchoolConfig config, ConnectedWifi? connection) =>
        connection is null || connection.Quality is < 0 or > 100 ? null : config.Networks.Where(n => n.Ssid == connection.Ssid && n.Security == connection.Security).Take(2).ToArray() is [var only] ? only : null;
    public static ApConfig? ConnectedAp(SchoolConfig config, ConnectedWifi? connection)
    {
        // The connection must be a registered room network; one physical AP may broadcast a different SSID per band.
        if (ConnectedNetwork(config, connection) is null) return null;
        var ap = config.AccessPoints.FirstOrDefault(a => a.AllBssids.Contains(connection!.Bssid));
        return ap is not null && config.Networks.Any(n => n.Id == ap.NetworkId) ? ap : null;
    }
}
