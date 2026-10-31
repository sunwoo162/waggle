using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
using Waggle.Core;
namespace Waggle.Platform.Windows;

internal sealed class WindowsWlanApi : IWindowsWlanApi
{
    private readonly Lazy<SafeWlanHandle> handle = new(() =>
    {
        var status = NativeMethods.WlanOpenHandle(2, IntPtr.Zero, out var version, out var value);
        if (status != 0 || value.IsInvalid || version < 2) { value.Dispose(); Check(status == 0 ? 50u : status); }
        return value;
    });
    private bool disposed;
    private SafeWlanHandle Handle { get { ObjectDisposedException.ThrowIf(disposed, this); return handle.Value; } }
    private static void Check(uint code, bool location = false, bool profile = false)
    {
        if (code == 0) return;
        throw new WifiException(code switch { 5 when location => WifiFailure.LocationPermission, 5 => WifiFailure.Permission, 170 => WifiFailure.Busy, 0x80342002u => WifiFailure.RadioOff, _ when profile => WifiFailure.ProfileRejected, _ => WifiFailure.Unavailable });
    }
    private static byte[] Copy(IntPtr pointer, uint size, int minimum, int maximum)
    {
        if (pointer == IntPtr.Zero || size < minimum || size > maximum) throw new WifiException(WifiFailure.InvalidResponse);
        var bytes = new byte[(int)size]; Marshal.Copy(pointer, bytes, 0, bytes.Length); return bytes;
    }
    private static void Free(IntPtr pointer) { if (pointer != IntPtr.Zero) NativeMethods.WlanFreeMemory(pointer); }
    public byte[] Interfaces()
    {
        var pointer = IntPtr.Zero;
        try
        {
            Check(NativeMethods.WlanEnumInterfaces(Handle, IntPtr.Zero, out pointer));
            if (pointer == IntPtr.Zero) throw new WifiException(WifiFailure.InvalidResponse);
            var count = unchecked((uint)Marshal.ReadInt32(pointer));
            if (count > 16) throw new WifiException(WifiFailure.InvalidResponse);
            return Copy(pointer, 8 + count * NativeWifiBuffers.InterfaceSize, 8, 8 + 16 * NativeWifiBuffers.InterfaceSize);
        }
        finally { Free(pointer); }
    }
    public byte[]? Connection(Guid id)
    {
        var pointer = IntPtr.Zero;
        try
        {
            var status = NativeMethods.WlanQueryInterface(Handle, ref id, 7, IntPtr.Zero, out var size, out pointer, out _);
            if (status is 5023 or 1168) return null;
            Check(status, location: true);
            return Copy(pointer, size, NativeWifiBuffers.ConnectionSize, 65536);
        }
        finally { Free(pointer); }
    }
    public byte[] Bss(Guid id)
    {
        var pointer = IntPtr.Zero;
        try
        {
            Check(NativeMethods.WlanGetNetworkBssList(Handle, ref id, IntPtr.Zero, 3, false, IntPtr.Zero, out pointer), location: true);
            if (pointer == IntPtr.Zero) throw new WifiException(WifiFailure.InvalidResponse);
            return Copy(pointer, unchecked((uint)Marshal.ReadInt32(pointer)), 8, 8 * 1024 * 1024);
        }
        finally { Free(pointer); }
    }
    public void Scan(Guid id) => Check(NativeMethods.WlanScan(Handle, ref id, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero), location: true);
    public void SetProfile(Guid id, string xml, uint flags, bool overwrite) => Check(NativeMethods.WlanSetProfile(Handle, ref id, flags, xml, IntPtr.Zero, overwrite, IntPtr.Zero, out _), profile: true);
    public void Connect(Guid id, string name, byte[] preferred)
    {
        var pointer = Marshal.AllocHGlobal(preferred.Length);
        try
        {
            Marshal.Copy(preferred, 0, pointer, preferred.Length);
            var parameters = new WlanConnectionParameters { Mode = 0, Profile = name, DesiredBssids = pointer, BssType = 1 };
            Check(NativeMethods.WlanConnect(Handle, ref id, ref parameters, IntPtr.Zero));
        }
        finally { Marshal.FreeHGlobal(pointer); }
    }
    public byte[] ProfileList(Guid id)
    {
        var pointer = IntPtr.Zero;
        try
        {
            Check(NativeMethods.WlanGetProfileList(Handle, ref id, IntPtr.Zero, out pointer));
            if (pointer == IntPtr.Zero) throw new WifiException(WifiFailure.InvalidResponse);
            var count = unchecked((uint)Marshal.ReadInt32(pointer));
            if (count > 4096) throw new WifiException(WifiFailure.InvalidResponse);
            return Copy(pointer, 8 + count * NativeWifiBuffers.ProfileInfoSize, 8, 8 + 4096 * NativeWifiBuffers.ProfileInfoSize);
        }
        finally { Free(pointer); }
    }
    public void DeleteProfile(Guid id, string name)
    {
        var status = NativeMethods.WlanDeleteProfile(Handle, ref id, name, IntPtr.Zero);
        if (status != 1168) Check(status); // ERROR_NOT_FOUND: already gone.
    }
    public void Dispose() { disposed = true; if (handle.IsValueCreated) handle.Value.Dispose(); }
}
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
internal struct WlanConnectionParameters
{
    public int Mode;
    [MarshalAs(UnmanagedType.LPWStr)] public string Profile;
    public IntPtr Ssid, DesiredBssids;
    public int BssType;
    public uint Flags;
}
internal sealed class SafeWlanHandle : SafeHandleZeroOrMinusOneIsInvalid
{
    public SafeWlanHandle() : base(true) { }
    protected override bool ReleaseHandle() => NativeMethods.WlanCloseHandle(handle, IntPtr.Zero) == 0;
}
internal static class NativeMethods
{
    private const string Library = "wlanapi.dll";
    [DllImport(Library, ExactSpelling = true), DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    internal static extern uint WlanOpenHandle(uint version, IntPtr reserved, out uint negotiated, out SafeWlanHandle handle);
    [DllImport(Library, ExactSpelling = true), DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    internal static extern uint WlanCloseHandle(IntPtr handle, IntPtr reserved);
    [DllImport(Library, ExactSpelling = true), DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    internal static extern void WlanFreeMemory(IntPtr pointer);
    [DllImport(Library, ExactSpelling = true), DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    internal static extern uint WlanEnumInterfaces(SafeWlanHandle handle, IntPtr reserved, out IntPtr list);
    [DllImport(Library, ExactSpelling = true), DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    internal static extern uint WlanQueryInterface(SafeWlanHandle handle, ref Guid id, int opcode, IntPtr reserved, out uint size, out IntPtr data, out int type);
    [DllImport(Library, ExactSpelling = true), DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    internal static extern uint WlanGetNetworkBssList(SafeWlanHandle handle, ref Guid id, IntPtr ssid, int bssType, [MarshalAs(UnmanagedType.Bool)] bool secured, IntPtr reserved, out IntPtr list);
    [DllImport(Library, ExactSpelling = true), DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    internal static extern uint WlanScan(SafeWlanHandle handle, ref Guid id, IntPtr ssid, IntPtr ies, IntPtr reserved);
    [DllImport(Library, ExactSpelling = true, CharSet = CharSet.Unicode), DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    internal static extern uint WlanSetProfile(SafeWlanHandle handle, ref Guid id, uint flags, string xml, IntPtr allUserSecurity, [MarshalAs(UnmanagedType.Bool)] bool overwrite, IntPtr reserved, out uint reason);
    [DllImport(Library, ExactSpelling = true, CharSet = CharSet.Unicode), DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    internal static extern uint WlanConnect(SafeWlanHandle handle, ref Guid id, ref WlanConnectionParameters parameters, IntPtr reserved);
    [DllImport(Library, ExactSpelling = true), DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    internal static extern uint WlanGetProfileList(SafeWlanHandle handle, ref Guid id, IntPtr reserved, out IntPtr list);
    [DllImport(Library, ExactSpelling = true, CharSet = CharSet.Unicode), DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    internal static extern uint WlanDeleteProfile(SafeWlanHandle handle, ref Guid id, string name, IntPtr reserved);
}
