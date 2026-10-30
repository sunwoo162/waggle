using System.Security.Principal;
using System.Windows;

namespace Waggle.Windows;

public partial class App : Application
{
    private Mutex? instance;
    private bool ownsInstance;
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        instance = new Mutex(false, "Local\\Waggle-" + WindowsIdentity.GetCurrent().User!.Value);
        try { ownsInstance = instance.WaitOne(0); }
        catch (AbandonedMutexException) { ownsInstance = true; }
        if (!ownsInstance)
        {
            MessageBox.Show("와글이 이미 실행 중입니다. 열려 있는 창을 확인해주세요.", "와글");
            Shutdown(); return;
        }
        new MainWindow().Show();
    }
    protected override void OnExit(ExitEventArgs e)
    {
        if (ownsInstance) instance?.ReleaseMutex();
        instance?.Dispose(); base.OnExit(e);
    }
}
