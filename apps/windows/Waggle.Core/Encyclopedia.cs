using System.Diagnostics.CodeAnalysis;
using System.Text;
using System.Text.RegularExpressions;
namespace Waggle.Core;

internal static class ClientValues
{
    internal static bool Id(string? value) => Guid.TryParseExact(value, "D", out var id) && id.ToString() == value;
    internal static bool Text(string? value, int max, bool required, bool lines = false)
    {
        if (value is null || value.Length > max || required && string.IsNullOrWhiteSpace(value) || value.Any(c => char.IsControl(c) && (!lines || c != '\n'))) return false;
        try { _ = new UTF8Encoding(false, true).GetByteCount(value); return true; } catch (EncoderFallbackException) { return false; }
    }
    internal static void Require([DoesNotReturnIf(false)] bool condition) { if (!condition) throw new MemberException(Failure.InvalidResponse); }
}
public sealed record CharacterInfo(string Id, string Name, string Description, string? ImagePath);
public sealed record Encyclopedia(int SchemaVersion, long Version, CharacterInfo[] Characters)
{
    public void Validate()
    {
        ClientValues.Require(SchemaVersion == 1 && Version is >= 0 and <= 9_007_199_254_740_991 && Characters is { Length: <= 5000 });
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var c in Characters)
            ClientValues.Require(c is not null && ClientValues.Id(c.Id) && ids.Add(c.Id) && ClientValues.Text(c.Name, 40, true) && ClientValues.Text(c.Description, 300, false, true) && (c.ImagePath is null || Regex.IsMatch(c.ImagePath, @"\A/api/art/[a-f0-9]{64}\z")));
    }
    public bool EquivalentTo(Encyclopedia other) => Version == other.Version && SchemaVersion == other.SchemaVersion && Characters.OrderBy(c => c.Id, StringComparer.Ordinal).SequenceEqual(other.Characters.OrderBy(c => c.Id, StringComparer.Ordinal));
}
public sealed record Collection(int SchemaVersion, string[] ApIds)
{
    public void Validate() => ClientValues.Require(SchemaVersion == 1 && ApIds is { Length: <= 10000 } && ApIds.All(ClientValues.Id) && ApIds.Distinct(StringComparer.Ordinal).Count() == ApIds.Length);
}
public sealed record ConnectionReport(string ApId, string Ssid, string Bssid)
{
    public override string ToString() => "ConnectionReport [redacted]";
    public void Validate() => new SchoolConfig(1, 0, [new(ApId, Ssid, "open", null)], [new(ApId, ApId, Bssid)]).Validate();
    public bool Matches(SchoolConfig config) => config.AccessPoints.Any(a => a.Id == ApId && a.AllBssids.Contains(Bssid) && config.Networks.Any(n => n.Id == a.NetworkId && n.Ssid == Ssid));
}
public enum LocalEventKind { Started, Paused, Connected, Requested, Failed, Collected, TimedOut }
public sealed record LocalConnectionEvent(long At, LocalEventKind Kind, string? Ssid);
public sealed record ClientState(string Origin, string MemberId, Encyclopedia Catalog, Collection Collected, ConnectionReport[] Pending, LocalConnectionEvent[] History)
{
    public int SchemaVersion { get; init; } = 1;
    public override string ToString() => "ClientState [redacted]";
    public void Validate()
    {
        ClientValues.Require(SchemaVersion == 1 && ServiceOrigin.Parse(Origin).AbsoluteUri == Origin && ClientValues.Id(MemberId) && Catalog is not null && Collected is not null && Pending is { Length: <= 5000 } && History is { Length: <= 200 });
        Catalog.Validate(); Collected.Validate();
        foreach (var report in Pending) { ClientValues.Require(report is not null); report.Validate(); }
        ClientValues.Require(Pending.Select(p => p.ApId).Distinct(StringComparer.Ordinal).Count() == Pending.Length);
        foreach (var e in History) ClientValues.Require(e is not null && e.At > 0 && e.At <= DateTimeOffset.MaxValue.ToUnixTimeMilliseconds() && Enum.IsDefined(e.Kind) && (e.Ssid is null || ClientValues.Text(e.Ssid, 32, true)));
    }
}
public interface IClientStateStore
{
    Task<ClientState?> LoadAsync(CancellationToken ct);
    Task SaveAsync(ClientState value, CancellationToken ct);
    Task ClearAsync(CancellationToken ct);
}
