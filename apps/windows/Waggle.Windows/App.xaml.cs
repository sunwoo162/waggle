using System.Security.Principal;
using System.Windows;
using Waggle.Platform.Windows;

namespace Waggle.Windows;

public partial class App : Application
{
    private SingleInstanceLease? instance;
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        try { instance = new SingleInstanceLease("Global\\Waggle-" + WindowsIdentity.GetCurrent().User!.Value); }
        catch { MessageBox.Show("와글의 실행 상태를 확인하지 못했어요. 같은 Windows 사용자의 다른 실행을 확인해주세요.", "와글"); Shutdown(); return; }
        if (!instance.OwnsInstance)
        {
            MessageBox.Show("와글이 이미 실행 중이에요. 트레이에서 열어주세요.", "와글");
            Shutdown(); return;
        }
        new MainWindow().Show();
    }
    protected override void OnExit(ExitEventArgs e)
    {
        instance?.Dispose(); base.OnExit(e);
    }
}
