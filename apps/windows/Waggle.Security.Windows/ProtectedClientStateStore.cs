using Waggle.Core;
namespace Waggle.Security.Windows;

public sealed class ProtectedClientStateStore(string filename) : IClientStateStore
{
    private readonly ProtectedJsonFile<ClientState> file = new(filename, "waggle/client-state/v1", 6 * 1024 * 1024 + 16 * 1024, value => value.Validate());
    public static string DefaultPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Waggle", "client.bin");
    public Task<ClientState?> LoadAsync(CancellationToken ct) => file.LoadAsync(ct);
    public Task SaveAsync(ClientState value, CancellationToken ct) => file.SaveAsync(value, ct);
    public Task ClearAsync(CancellationToken ct) => file.ClearAsync(ct);
}
