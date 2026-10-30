using Waggle.Core;

namespace Waggle.Security.Windows;

public sealed class ProtectedSessionStore(string filename) : ISessionStore
{
    private readonly ProtectedJsonFile<StoredSession> file = new(filename, "waggle/session/v1", 65_536, value =>
    {
        ServiceOrigin.Parse(value.Origin);
        if (value.Tokens is null) throw new System.Security.Cryptography.CryptographicException("invalid_session_store");
        value.Tokens.Validate();
    });
    public static string DefaultPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Waggle", "session.bin");
    public Task<StoredSession?> LoadAsync(CancellationToken ct) => file.LoadAsync(ct);
    public Task SaveAsync(StoredSession value, CancellationToken ct) => file.SaveAsync(value, ct);
    public Task ClearAsync(CancellationToken ct) => file.ClearAsync(ct);
}
