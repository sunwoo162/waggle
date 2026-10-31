using Microsoft.Win32;
namespace Waggle.Platform.Windows;

/// <summary>
/// Per-user "keep running" state: the app starts at Windows sign-in in the tray, and resumes management
/// only if the user left it on. Nothing secret is stored here (an adapter id and the app path).
/// </summary>
public sealed class AutoStartSettings(string settingsKey = @"Software\Waggle", string runKey = @"Software\Microsoft\Windows\CurrentVersion\Run", string runValue = "Waggle")
{
    public const string BackgroundArgument = "--background";
    private const string ResumeValue = "ResumeAdapter";

    /// <summary>Adapter to resume management on, or null when the user turned management off.</summary>
    public Guid? ResumeAdapter()
    {
        using var key = Registry.CurrentUser.OpenSubKey(settingsKey);
        return key?.GetValue(ResumeValue) is string value && Guid.TryParseExact(value, "D", out var id) ? id : null;
    }

    /// <summary>Management turned on: start at sign-in and resume on this adapter.</summary>
    public void TurnedOn(Guid adapterId, string executablePath)
    {
        using (var key = Registry.CurrentUser.CreateSubKey(settingsKey)) key.SetValue(ResumeValue, adapterId.ToString("D"));
        using var run = Registry.CurrentUser.CreateSubKey(runKey);
        run.SetValue(runValue, Command(executablePath));
    }

    /// <summary>Management paused: keep starting in the tray, but do not resume by itself.</summary>
    public void TurnedOff()
    {
        using var key = Registry.CurrentUser.OpenSubKey(settingsKey, writable: true);
        key?.DeleteValue(ResumeValue, throwOnMissingValue: false);
    }

    /// <summary>Signed out: stop starting at sign-in entirely.</summary>
    public void Remove()
    {
        TurnedOff();
        using var run = Registry.CurrentUser.OpenSubKey(runKey, writable: true);
        run?.DeleteValue(runValue, throwOnMissingValue: false);
    }

    public string? RegisteredCommand()
    {
        using var run = Registry.CurrentUser.OpenSubKey(runKey);
        return run?.GetValue(runValue) as string;
    }

    internal static string Command(string executablePath) => "\"" + executablePath + "\" " + BackgroundArgument;
}
