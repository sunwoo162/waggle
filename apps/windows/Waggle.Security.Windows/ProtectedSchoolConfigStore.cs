using Waggle.Core;

namespace Waggle.Security.Windows;

public sealed class ProtectedSchoolConfigStore(string filename) : ISchoolConfigStore
{
    private readonly ProtectedJsonFile<CachedSchoolConfig> file = new(filename, "waggle/school-config/v1", 1024 * 1024 + 16 * 1024, value => value.Validate());
    public static string DefaultPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Waggle", "school.bin");
    public Task<CachedSchoolConfig?> LoadAsync(CancellationToken ct) => file.LoadAsync(ct);
    public Task SaveAsync(CachedSchoolConfig value, CancellationToken ct) => file.SaveAsync(value, ct);
    public Task ClearAsync(CancellationToken ct) => file.ClearAsync(ct);
}
