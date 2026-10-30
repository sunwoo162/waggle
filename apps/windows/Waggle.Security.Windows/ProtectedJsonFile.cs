using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Waggle.Security.Windows;

internal sealed class ProtectedJsonFile<T>(string filename, string purpose, int maximumBytes, Action<T> validate) where T : class
{
    private readonly byte[] entropy = Encoding.UTF8.GetBytes(purpose);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { MaxDepth = 16 };
    public async Task<T?> LoadAsync(CancellationToken ct)
    {
        if (!File.Exists(filename)) return null;
        await using var file = new FileStream(filename, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.Asynchronous);
        using var bytes = new MemoryStream(); var buffer = new byte[4096]; int read;
        while ((read = await file.ReadAsync(buffer, ct)) != 0)
        {
            if (bytes.Length + read > maximumBytes) throw new CryptographicException("invalid_protected_store");
            bytes.Write(buffer, 0, read);
        }
        var plaintext = ProtectedData.Unprotect(bytes.ToArray(), entropy, DataProtectionScope.CurrentUser);
        try { var value = JsonSerializer.Deserialize<T>(plaintext, Json) ?? throw new CryptographicException("invalid_protected_store"); validate(value); return value; }
        finally { CryptographicOperations.ZeroMemory(plaintext); }
    }
    public async Task SaveAsync(T value, CancellationToken ct)
    {
        validate(value);
        var plaintext = JsonSerializer.SerializeToUtf8Bytes(value, Json); byte[] encrypted;
        try
        {
            if (plaintext.Length > maximumBytes) throw new CryptographicException("invalid_protected_store");
            encrypted = ProtectedData.Protect(plaintext, entropy, DataProtectionScope.CurrentUser);
        }
        finally { CryptographicOperations.ZeroMemory(plaintext); }
        if (encrypted.Length > maximumBytes) throw new CryptographicException("invalid_protected_store");
        var fullPath = Path.GetFullPath(filename); Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        var temporary = fullPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            await using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.Asynchronous | FileOptions.WriteThrough))
            { await stream.WriteAsync(encrypted, ct); await stream.FlushAsync(ct); stream.Flush(true); }
            ct.ThrowIfCancellationRequested(); File.Move(temporary, fullPath, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    public Task ClearAsync(CancellationToken ct) { ct.ThrowIfCancellationRequested(); File.Delete(filename); return Task.CompletedTask; }
}
