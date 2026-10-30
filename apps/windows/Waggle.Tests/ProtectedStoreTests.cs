using System.Security.Cryptography;
using System.Text;
using Waggle.Core;
using Waggle.Security.Windows;
namespace Waggle.Tests;

[TestClass]
public sealed class ProtectedStoreTests
{
    [TestMethod]
    public async Task OsProtectionRoundTripReplacementAndNoPlaintextOnDisk()
    {
        var directory = Path.Combine(Path.GetTempPath(), "waggle-store-test-" + Guid.NewGuid());
        var file = Path.Combine(directory, "session.bin"); var store = new ProtectedSessionStore(file);
        Assert.IsNull(await store.LoadAsync(default));
        var first = new StoredSession("https://waggle.example", ProtocolTests.Pair);
        await store.SaveAsync(first, default); Assert.AreEqual(first, await store.LoadAsync(default));
        var bytes = await File.ReadAllBytesAsync(file);
        Assert.DoesNotContain(first.Tokens.RefreshToken, Encoding.UTF8.GetString(bytes));
        Assert.DoesNotContain(first.Tokens.AccessToken, Encoding.UTF8.GetString(bytes));
        var second = first with { Tokens = first.Tokens with { RefreshToken = new string('z', 32) } };
        await store.SaveAsync(second, default); Assert.AreEqual(second, await store.LoadAsync(default));
        Assert.HasCount(1, Directory.GetFiles(directory));
        bytes[bytes.Length / 2] ^= 0xff; await File.WriteAllBytesAsync(file, bytes);
        await Assert.ThrowsAsync<CryptographicException>(() => store.LoadAsync(default));
        await store.ClearAsync(default); Assert.IsFalse(File.Exists(file));
        Directory.Delete(directory);
    }
}

