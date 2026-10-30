using System.Diagnostics.CodeAnalysis;
using System.Text;
using System.Text.RegularExpressions;

namespace Waggle.Core;

public sealed record NetworkConfig(string Id, string Ssid, string Security, string? Password)
{
    public override string ToString() => "NetworkConfig [redacted]";
}
public sealed record ApConfig(string Id, string NetworkId, string Bssid);
public sealed record SchoolConfig(int SchemaVersion, long Version, NetworkConfig[] Networks, ApConfig[] AccessPoints)
{
    public override string ToString() => "SchoolConfig [redacted]";
    public void Validate()
    {
        [DoesNotReturn] static void Invalid() => throw new MemberException(Failure.InvalidResponse);
        static bool Id(string? id) => Guid.TryParseExact(id, "D", out var value) && value.ToString() == id;
        if (SchemaVersion != 1 || Version < 0 || Version > 9_007_199_254_740_991 || Networks is null || AccessPoints is null || Networks.Length > 500 || AccessPoints.Length > 5000) Invalid();
        var networks = new HashSet<string>(StringComparer.Ordinal);
        foreach (var n in Networks)
        {
            if (n is null || !Id(n.Id) || !networks.Add(n.Id) || string.IsNullOrEmpty(n.Ssid) || n.Ssid.Any(char.IsControl)) Invalid();
            try { if (new UTF8Encoding(false, true).GetByteCount(n.Ssid) > 32) Invalid(); }
            catch (EncoderFallbackException) { Invalid(); }
            if (n.Security == "open") { if (n.Password is not null) Invalid(); }
            else if (n.Security is "wpa2-personal" or "wpa3-personal")
            {
                if (n.Password is null || !(Regex.IsMatch(n.Password, @"\A[\x20-\x7e]{8,63}\z") || n.Security == "wpa2-personal" && Regex.IsMatch(n.Password, @"\A[0-9a-fA-F]{64}\z"))) Invalid();
            }
            else Invalid();
        }
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var bssids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var a in AccessPoints)
            if (a is null || !Id(a.Id) || !ids.Add(a.Id) || !networks.Contains(a.NetworkId) || a.Bssid is null ||
                !Regex.IsMatch(a.Bssid, @"\A(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\z") || !bssids.Add(a.Bssid) ||
                a.Bssid == "00:00:00:00:00:00" || (Convert.ToInt32(a.Bssid[..2], 16) & 1) != 0) Invalid();
    }
    public bool EquivalentTo(SchoolConfig other) => SchemaVersion == other.SchemaVersion && Version == other.Version &&
        Networks.OrderBy(n => n.Id, StringComparer.Ordinal).SequenceEqual(other.Networks.OrderBy(n => n.Id, StringComparer.Ordinal)) &&
        AccessPoints.OrderBy(a => a.Id, StringComparer.Ordinal).SequenceEqual(other.AccessPoints.OrderBy(a => a.Id, StringComparer.Ordinal));
}
public sealed record CachedSchoolConfig(string Origin, string MemberId, SchoolConfig Config)
{
    public override string ToString() => "CachedSchoolConfig [redacted]";
    public void Validate()
    {
        ServiceOrigin.Parse(Origin);
        if (!Guid.TryParseExact(MemberId, "D", out _) || Config is null) throw new MemberException(Failure.InvalidResponse);
        Config.Validate();
    }
}
public interface ISchoolConfigStore
{
    Task<CachedSchoolConfig?> LoadAsync(CancellationToken ct);
    Task SaveAsync(CachedSchoolConfig value, CancellationToken ct);
    Task ClearAsync(CancellationToken ct);
}
