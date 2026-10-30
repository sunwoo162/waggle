namespace Waggle.Platform.Windows;

public sealed class SingleInstanceLease : IDisposable
{
    private readonly Mutex mutex;
    public bool OwnsInstance { get; }
    private bool disposed;
    public SingleInstanceLease(string name)
    {
        if (!name.StartsWith("Global\\Waggle-", StringComparison.Ordinal) || name.Length > 200) throw new ArgumentException("invalid_instance_name", nameof(name));
        mutex = new Mutex(false, name);
        try { OwnsInstance = mutex.WaitOne(0); } catch (AbandonedMutexException) { OwnsInstance = true; }
    }
    public void Dispose()
    {
        if (disposed) return;
        disposed = true; if (OwnsInstance) mutex.ReleaseMutex(); mutex.Dispose();
    }
}
