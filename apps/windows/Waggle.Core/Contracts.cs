using System.Text.RegularExpressions;

namespace Waggle.Core;

public enum Failure { InvalidInput, Unauthorized, RateLimited, Offline, Unavailable, InvalidResponse, Storage, Conflict }
/// <summary>A student's request to register the in-school Wi-Fi they are connected to. Sent once, only on user action.</summary>
public sealed record WifiRequestInput(string Room, string Ssid, string Security, string? Password)
{
    public override string ToString() => "WifiRequestInput [redacted]";
}
public sealed record WifiRequestReceipt(string Status);
public sealed class MemberException(Failure failure) : Exception("waggle_" + failure)
{
    public Failure Failure { get; } = failure;
}
public sealed record TokenPair(string AccessToken, string RefreshToken, string TokenType, int AccessExpiresIn, long RefreshExpiresAt)
{
    public override string ToString() => "TokenPair [redacted]";
    public void Validate()
    {
        if (AccessToken is null || AccessToken.Length > 8192 || !Regex.IsMatch(AccessToken, @"\A[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\z") ||
            RefreshToken is null || !Regex.IsMatch(RefreshToken, @"\A[A-Za-z0-9_-]{32}\z") || TokenType != "Bearer" || AccessExpiresIn != 900 ||
            RefreshExpiresAt <= 0 || RefreshExpiresAt > DateTimeOffset.MaxValue.ToUnixTimeMilliseconds())
            throw new MemberException(Failure.InvalidResponse);
    }
}
public sealed record MemberInfo(string Id, string Alias);
public sealed record DeviceInfo(string Id, string Platform, string Name, long ExpiresAt);
public sealed record Identity(MemberInfo Member, DeviceInfo Device)
{
    public void Validate()
    {
        if (Member is null || Device is null || !Guid.TryParse(Member.Id, out _) || !Guid.TryParse(Device.Id, out _) ||
            string.IsNullOrWhiteSpace(Member.Alias) || Member.Alias.Length > 80 || string.IsNullOrWhiteSpace(Device.Name) || Device.Name.Length > 64 ||
            Device.Platform != "windows" || Device.ExpiresAt <= 0 || Device.ExpiresAt > DateTimeOffset.MaxValue.ToUnixTimeMilliseconds())
            throw new MemberException(Failure.InvalidResponse);
    }
}
public sealed record StoredSession(string Origin, TokenPair Tokens)
{
    public override string ToString() => "StoredSession [redacted]";
}
public interface ISessionStore
{
    Task<StoredSession?> LoadAsync(CancellationToken ct);
    Task SaveAsync(StoredSession value, CancellationToken ct);
    Task ClearAsync(CancellationToken ct);
}
public interface IMemberApi : IDisposable
{
    Task<TokenPair> LoginAsync(string code, string deviceName, CancellationToken ct);
    Task<TokenPair> RefreshAsync(string token, CancellationToken ct);
    Task<Identity> MeAsync(string token, CancellationToken ct);
    Task<SchoolConfig> GetSchoolConfigAsync(string token, CancellationToken ct);
    Task<Encyclopedia> GetEncyclopediaAsync(string token, CancellationToken ct);
    Task<Collection> SyncCollectionAsync(string token, ConnectionReport[] reports, CancellationToken ct);
    Task LogoutAsync(string token, CancellationToken ct);
    Task SubmitWifiRequestAsync(string token, WifiRequestInput input, CancellationToken ct);
    /// <summary>Permanently deletes the signed-in account (code, device sessions, collection).</summary>
    Task DeleteAccountAsync(string token, CancellationToken ct);
}
