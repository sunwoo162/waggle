namespace Waggle.Core;

public sealed record WifiInterface(Guid Id, string Name, bool Busy = false);
public sealed record ConnectedWifi(string? Ssid, string Bssid, string Security, int Quality);
public sealed record WifiCandidate(string Ssid, string Bssid, bool Secured, int Quality, DateTimeOffset LastSeen);
public sealed record WifiObservation(ConnectedWifi? Connection, WifiCandidate[] Candidates, bool Busy = false);
public sealed record WifiTarget(string NetworkId, NetworkConfig Network, string Bssid, int Quality);
public enum WifiAction { Keep, Wait, Connect }
public enum WifiReason { NormalConnection, ForeignConnection, WeakConnection, NoCandidate, Cooldown, PendingConnection, AdapterBusy }
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
        if (connection is null || connection.Quality is < 0 or > 100) return null;
        var ap = config.AccessPoints.FirstOrDefault(a => a.AllBssids.Contains(connection.Bssid));
        if (ap is null) return null;
        var network = config.Networks.FirstOrDefault(n => n.Id == ap.NetworkId);
        return network is not null && network.Ssid == connection.Ssid && network.Security == connection.Security ? ap : null;
    }
}
