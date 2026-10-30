using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Waggle.Core;

namespace Waggle.Security.Windows;

public sealed class ProtectedSessionStore(string filename) : ISessionStore
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("waggle/session/v1");
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { MaxDepth = 16 };
    public static string DefaultPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Waggle", "session.bin");
    public async Task<StoredSession?> LoadAsync(CancellationToken ct)
    {
        if (!File.Exists(filename)) return null;
        if (new FileInfo(filename).Length > 65_536) throw new CryptographicException("invalid_session_store");
        var encrypted = await File.ReadAllBytesAsync(filename, ct);
        var plaintext = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser);
        try
        {
            var value = JsonSerializer.Deserialize<StoredSession>(plaintext, Json) ?? throw new CryptographicException("invalid_session_store");
            ServiceOrigin.Parse(value.Origin);
            if (value.Tokens is null) throw new CryptographicException("invalid_session_store");
            value.Tokens.Validate();
            return value;
        }
        finally { CryptographicOperations.ZeroMemory(plaintext); }
    }
    public async Task SaveAsync(StoredSession value, CancellationToken ct)
    {
        ServiceOrigin.Parse(value.Origin); value.Tokens.Validate();
        var plaintext = JsonSerializer.SerializeToUtf8Bytes(value, Json);
        byte[] encrypted;
        try { encrypted = ProtectedData.Protect(plaintext, Entropy, DataProtectionScope.CurrentUser); }
        finally { CryptographicOperations.ZeroMemory(plaintext); }
        var fullPath = Path.GetFullPath(filename);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        var temporary = fullPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            await using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await stream.WriteAsync(encrypted, ct);
                await stream.FlushAsync(ct);
                stream.Flush(flushToDisk: true);
            }
            ct.ThrowIfCancellationRequested();
            File.Move(temporary, fullPath, overwrite: true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    public Task ClearAsync(CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        File.Delete(filename);
        return Task.CompletedTask;
    }
}
