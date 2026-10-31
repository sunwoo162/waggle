using Microsoft.Win32;
using Waggle.Platform.Windows;

namespace Waggle.Tests;

[TestClass]
public sealed class AutoStartSettingsTests
{
    [TestMethod]
    public void TurningOnResumesAtSignInPauseKeepsTrayAndSignOutRemovesEverything()
    {
        var root = @"Software\Waggle.Tests\" + Guid.NewGuid().ToString("N");
        try
        {
            var settings = new AutoStartSettings(root + @"\Settings", root + @"\Run");
            Assert.IsNull(settings.ResumeAdapter()); Assert.IsNull(settings.RegisteredCommand());
            settings.TurnedOn(NativeWifiTests.AdapterId, @"C:\Program Files\Waggle\Waggle.exe");
            Assert.AreEqual(NativeWifiTests.AdapterId, settings.ResumeAdapter());
            Assert.AreEqual("\"C:\\Program Files\\Waggle\\Waggle.exe\" --background", settings.RegisteredCommand());
            settings.TurnedOff();
            Assert.IsNull(settings.ResumeAdapter()); Assert.IsNotNull(settings.RegisteredCommand());
            settings.TurnedOn(NativeWifiTests.AdapterId, @"C:\Waggle.exe");
            settings.Remove();
            Assert.IsNull(settings.ResumeAdapter()); Assert.IsNull(settings.RegisteredCommand());
            settings.Remove();
        }
        finally { Registry.CurrentUser.DeleteSubKeyTree(root, throwOnMissingSubKey: false); }
    }
}
