using Waggle.Core;
namespace Waggle.Platform.Windows;

internal interface IWindowsWlanApi : IDisposable
{
    byte[] Interfaces();
    byte[]? Connection(Guid id);
    byte[] Bss(Guid id);
    void Scan(Guid id);
    void SetProfile(Guid id, string xml, uint flags, bool overwrite);
    void Connect(Guid id, string name, byte[] preferred);
    byte[] ProfileList(Guid id);
    void DeleteProfile(Guid id, string name);
}
public sealed class NativeWifiAdapter : IWifiAdapter
{
    private readonly IWindowsWlanApi api;
    public NativeWifiAdapter() : this(new WindowsWlanApi()) { }
    internal NativeWifiAdapter(IWindowsWlanApi api) => this.api = api;
    public Task<WifiInterface[]> InterfacesAsync(CancellationToken ct) => Task.Run(() => NativeWifiBuffers.Interfaces(api.Interfaces()), ct);
    public Task<WifiObservation> ObserveAsync(Guid adapterId, CancellationToken ct) => Task.Run(() =>
    {
        var selected = NativeWifiBuffers.Interfaces(api.Interfaces()).FirstOrDefault(i => i.Id == adapterId) ?? throw new WifiException(WifiFailure.Unavailable);
        ct.ThrowIfCancellationRequested();
        var raw = api.Connection(adapterId); var connection = raw is null ? null : NativeWifiBuffers.Connection(raw);
        ct.ThrowIfCancellationRequested();
        return new WifiObservation(connection, NativeWifiBuffers.Bss(api.Bss(adapterId)), selected.Busy);
    }, ct);
    public Task ScanAsync(Guid adapterId, CancellationToken ct) => Task.Run(() => api.Scan(adapterId), ct);
    public Task ConnectAsync(Guid adapterId, Uri origin, NetworkConfig network, string bssid, CancellationToken ct) => Task.Run(() =>
    {
        if (adapterId == Guid.Empty) throw new WifiException(WifiFailure.Unavailable);
        new SchoolConfig(1, 0, [network], [new(network.Id, network.Id, bssid)]).Validate();
        var profile = WifiProfileBuilder.Build(origin, network);
        ct.ThrowIfCancellationRequested();
        api.SetProfile(adapterId, profile.Xml, 2, true);
        ct.ThrowIfCancellationRequested();
        api.Connect(adapterId, profile.Name, NativeWifiBuffers.BssidPreference(bssid));
    }, ct);
    public Task RemoveProfilesExceptAsync(Uri? keep, CancellationToken ct) => Task.Run(() =>
    {
        var kept = keep is null ? null : WifiProfileBuilder.Prefix(keep);
        foreach (var adapter in NativeWifiBuffers.Interfaces(api.Interfaces()))
            foreach (var name in NativeWifiBuffers.ProfileNames(api.ProfileList(adapter.Id)).Where(n => WifiProfileBuilder.IsOwned(n) && (kept is null || !n.StartsWith(kept, StringComparison.Ordinal))))
            {
                ct.ThrowIfCancellationRequested();
                api.DeleteProfile(adapter.Id, name);
            }
    }, ct);
    public void Dispose() => api.Dispose();
}
