using System.Windows;
using System.Windows.Media;
using Waggle.Core;
using Waggle.Security.Windows;

namespace Waggle.Windows;

public partial class MainWindow : Window
{
    private readonly CancellationTokenSource closing = new();
    private readonly MemberSession session = new(new ProtectedSessionStore(ProtectedSessionStore.DefaultPath), uri => new MemberApi(uri));
    private bool busy;
    public MainWindow() => InitializeComponent();
    private async void WindowLoaded(object sender, RoutedEventArgs e) => await RunAsync(async () =>
    {
        var identity = await session.RestoreAsync(closing.Token);
        if (identity is not null) Message("이전에 사용한 계정을 확인했어요.");
    });
    private async void LoginClicked(object sender, RoutedEventArgs e)
    {
        var code = CodeInput.Password;
        CodeInput.Clear();
        await RunAsync(async () =>
        {
            await session.LoginAsync(ServerInput.Text, code, DeviceInput.Text, closing.Token);
            Message("계정이 연결됐어요. Wi-Fi 자동 관리는 아직 준비 중입니다.");
        });
    }
    private async void CheckClicked(object sender, RoutedEventArgs e) => await RunAsync(async () =>
    {
        await session.CheckAsync(closing.Token); Message("현재 기기 세션이 유효합니다.");
    });
    private async void LogoutClicked(object sender, RoutedEventArgs e) => await RunAsync(async () =>
    {
        var remote = await session.LogoutAsync(closing.Token);
        Message(remote ? "이 기기에서 로그아웃했어요." : "이 기기의 로그인 정보를 지웠어요. 서버 회수는 확인하지 못했으니 필요하면 운영자에게 기기 세션 회수를 요청해주세요.");
    });
    private async Task RunAsync(Func<Task> action)
    {
        if (busy) return;
        busy = true; Render(); MessagePanel.Visibility = Visibility.Collapsed;
        try { await action(); }
        catch (OperationCanceledException) { }
        catch (MemberException ex)
        {
            Message(ex.Failure switch
            {
                Failure.InvalidInput => "서비스 주소·개인 코드·기기 이름을 확인해주세요.",
                Failure.Unauthorized => "코드가 올바르지 않거나 기기 세션이 만료·회수됐어요. 코드를 다시 확인해주세요.",
                Failure.RateLimited => "요청이 많아요. 5분 뒤 다시 시도해주세요.",
                Failure.Offline => "서버에 연결할 수 없어요. 인터넷과 서비스 주소를 확인한 뒤 다시 시도해주세요.",
                Failure.Storage => "이 Windows 계정의 로그인 정보를 읽거나 저장하지 못했어요. 저장 공간과 파일 권한을 확인해주세요.",
                Failure.InvalidResponse => "서버 응답을 확인하지 못했어요. 운영자에게 서버 상태를 확인해주세요.",
                _ => "지금 서버를 사용할 수 없어요. 잠시 후 다시 시도해주세요."
            }, error: true);
        }
        catch { Message("작업을 완료하지 못했어요. 앱을 다시 열어 확인해주세요.", error: true); }
        finally { busy = false; if (!closing.IsCancellationRequested) Render(); }
    }
    private void Render()
    {
        var stored = session.HasStoredSession;
        LoginPanel.Visibility = stored ? Visibility.Collapsed : Visibility.Visible;
        AccountPanel.Visibility = stored ? Visibility.Visible : Visibility.Collapsed;
        LoginPanel.IsEnabled = CheckButton.IsEnabled = LogoutButton.IsEnabled = !busy;
        LoginButton.Content = busy ? "확인 중…" : "개인 코드로 로그인";
        PageTitle.Text = stored ? "나의 와글" : "와글에 로그인";
        PageDescription.Text = stored ? session.Current is null ? "서버에서 계정 상태를 다시 확인해주세요." : "이 기기의 계정 연결을 관리합니다." : "운영자에게 받은 개인 코드로 시작하세요.";
        AliasText.Text = session.Current?.Member.Alias ?? "연결 확인 필요";
        DeviceText.Text = session.Current?.Device.Name ?? "저장된 기기 세션";
        ExpiryText.Text = session.Current is { } identity ? "기기 세션 만료  " + DateTimeOffset.FromUnixTimeMilliseconds(identity.Device.ExpiresAt).ToLocalTime().ToString("yyyy. M. d. HH:mm") : "네트워크 장애가 세션 회수를 뜻하지는 않습니다.";
        OriginText.Text = session.Origin ?? "";
    }
    private void Message(string text, bool error = false)
    {
        if (closing.IsCancellationRequested) return;
        MessageText.Text = text;
        MessageText.Foreground = new SolidColorBrush(error ? Color.FromRgb(163, 62, 54) : Color.FromRgb(16, 81, 81));
        MessagePanel.Visibility = Visibility.Visible;
    }
    private void WindowClosed(object? sender, EventArgs e) => closing.Cancel();
}
