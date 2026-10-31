using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using Waggle.Core;
using Waggle.Platform.Windows;
using Waggle.Security.Windows;
namespace Waggle.Windows;

public partial class MainWindow : Window
{
    private readonly ClientCoordinator client;
    private readonly CancellationTokenSource closing = new();
    private readonly ArtImages art = new();
    private readonly DispatcherTimer ticker = new() { Interval = TimeSpan.FromSeconds(10) };
    private readonly TrayController tray;
    private bool loaded, busy, starting, pausing, rendering, allowClose, exiting, backgroundNotice;
    private string view = "home";
    private ClientState? renderedCollection;
    private (string? Id, DateTimeOffset? At) lastNotice;
    private Dictionary<string, CharacterCard> cards = new(StringComparer.Ordinal);
    public MainWindow() : this(CreateClient()) { }
    public MainWindow(ClientCoordinator client, string? initialOrigin = null)
    {
        this.client = client; InitializeComponent();
        if (initialOrigin is not null) ServerInput.Text = initialOrigin;
        tray = new(() => Dispatcher.InvokeAsync(ShowWindow), () => Dispatcher.InvokeAsync(async () => await PauseControlAsync()), () => Dispatcher.InvokeAsync(async () => await ExitAsync()));
        ticker.Tick += TimerTick;
        AdapterInput.SelectionChanged += (_, _) => Render();
        ConsentInput.Checked += (_, _) => Render(); ConsentInput.Unchecked += (_, _) => Render();
    }
    private static ClientCoordinator CreateClient()
    {
        var session = new MemberSession(new ProtectedSessionStore(ProtectedSessionStore.DefaultPath), uri => new MemberApi(uri));
        return new(session, new(session, new ProtectedSchoolConfigStore(ProtectedSchoolConfigStore.DefaultPath)), new(session, new ProtectedClientStateStore(ProtectedClientStateStore.DefaultPath)), new NativeWifiAdapter());
    }
    private async void WindowLoaded(object sender, RoutedEventArgs e)
    {
        loaded = true; ticker.Start();
        await RunAsync(async () => { await client.RestoreAsync(closing.Token); if (client.Origin is { } origin) ServerInput.Text = origin; });
    }
    private async void LoginClicked(object sender, RoutedEventArgs e)
    {
        var code = CodeInput.Password; CodeInput.Clear();
        await RunAsync(async () => { await client.LoginAsync(ServerInput.Text, code, DeviceInput.Text, closing.Token); view = "home"; Notice("계정과 학교 설정을 확인했어요. 어댑터를 확인한 뒤 관리를 시작해요."); });
    }
    private async void InterfacesClicked(object sender, RoutedEventArgs e) => await RunAsync(async () => { await client.LoadInterfacesAsync(closing.Token); Notice(client.Interfaces.Length == 0 ? "사용할 수 있는 Wi-Fi 어댑터가 없어요. 무선 기능과 드라이버를 확인해주세요." : "사용할 어댑터를 골라주세요."); });
    private async void StartClicked(object sender, RoutedEventArgs e)
    {
        starting = true;
        try { await RunAsync(async () => { if (AdapterInput.SelectedValue is not Guid id) throw new MemberException(Failure.InvalidInput); await client.StartAsync(id, ConsentInput.IsChecked == true, closing.Token); Notice("자동 관리를 시작했어요. 연결 결과는 Windows에서 확인해요."); }); }
        finally { starting = false; Render(); }
    }
    private async void PauseClicked(object sender, RoutedEventArgs e) => await PauseControlAsync();
    private async Task PauseControlAsync()
    {
        if (pausing || exiting) return;
        pausing = true; Render();
        try { await client.PauseAsync(CancellationToken.None); Notice("자동 관리를 일시 중지했어요. 현재 Wi-Fi 연결은 유지해요."); }
        catch (Exception error) { ShowError(error); }
        finally { pausing = false; Render(); }
    }
    private async void RefreshClicked(object sender, RoutedEventArgs e) => await RunAsync(async () => { await client.RefreshAsync(closing.Token); Notice("계정·학교 설정과 도감을 동기화했어요."); });
    private async void ClearHistoryClicked(object sender, RoutedEventArgs e) => await RunAsync(async () => { await client.ClearHistoryAsync(closing.Token); Notice("이 기기의 연결 기록을 비웠어요."); });
    private async void LogoutClicked(object sender, RoutedEventArgs e) => await RunAsync(async () =>
    {
        var remote = await client.LogoutAsync(closing.Token); ConsentInput.IsChecked = false; lastNotice = default;
        Notice((remote ? "이 기기에서 로그아웃했어요." : "이 기기의 자료를 정리했어요. 서버 회수는 확인하지 못했으니 필요하면 운영자에게 기기 회수를 요청해주세요.") +
            (client.ProfileCleanupPending ? " 등록한 학교 Wi-Fi는 지우지 못했어요. 다음에 와글을 열 때 다시 지울게요." : ""));
    });
    private async void TimerTick(object? sender, EventArgs e)
    {
        if (!busy && !exiting && client.ManagementRequested) await RunAsync(() => client.TickAsync(closing.Token), quiet: true);
    }
    private async Task RunAsync(Func<Task> action, bool quiet = false)
    {
        if (busy || exiting) return;
        busy = true; if (!quiet) MessagePanel.Visibility = Visibility.Collapsed; Render();
        var wasRunning = client.Running;
        try { await action(); if (quiet && !wasRunning && client.Running) Notice("상태를 다시 확인했어요. 자동 관리를 이어가요."); }
        catch (OperationCanceledException) { }
        catch (Exception error) { ShowError(error); }
        finally
        {
            busy = false;
            if (!exiting)
            {
                Render();
                var notice = (client.NewlyCollectedApId, client.LastObservationAt);
                if (notice.Item1 is { } id && notice != lastNotice)
                {
                    lastNotice = notice; var name = client.Collection?.Catalog.Characters.FirstOrDefault(c => c.Id == id)?.Name ?? "새로운 친구";
                    Notice(name + "와 친구가 됐어요."); if (!IsVisible) tray.Collected(name);
                }
            }
        }
    }
    private void ShowError(Exception error)
    {
        if (exiting) return;
        var text = error switch
        {
            MemberException member => member.Failure switch
            {
                Failure.InvalidInput => client.HasStoredSession ? "학교 설정·어댑터 선택·자동 관리 동의를 확인해주세요." : "서비스 주소·개인 코드·기기 이름을 확인해주세요.",
                Failure.Unauthorized => "기기 세션이 만료·회수됐거나 코드가 올바르지 않아요. 계정을 다시 확인해주세요.",
                Failure.RateLimited => "요청이 많아요. 5분 뒤 다시 확인해주세요.",
                Failure.Offline => "서버에 연결하지 못했어요. 인터넷과 서비스 주소를 확인해주세요. 관리 중이었다면 재확인 전까지 새 연결 요청을 쉬어요.",
                Failure.Storage => client.NeedsCleanup || client.Status == ClientStatus.CleanupRequired ? "저장 자료를 모두 정리하지 못했어요. 내 계정에서 정리를 다시 시도해주세요. 정리 전 앱을 다시 열면 계정이 복원될 수 있어요." : "이 Windows 계정의 보호 자료를 읽거나 저장하지 못했어요. 저장 공간과 파일 권한을 확인해주세요.",
                Failure.InvalidResponse => "서버 설정이나 저장 자료를 확인하지 못했어요. 운영자에게 확인해주세요.",
                _ => "지금 서버를 사용할 수 없어요. 잠시 후 다시 확인해주세요."
            },
            WifiException wifi => wifi.Failure switch
            {
                WifiFailure.LocationPermission => "Windows 설정의 개인정보 및 보안 → 위치에서 위치 서비스와 데스크톱 앱 접근을 확인한 뒤 다시 시작해주세요.",
                WifiFailure.Permission => "Windows에서 Wi-Fi 접근을 허용하지 않았어요. 기기 권한과 학교 정책을 확인해주세요.",
                WifiFailure.RadioOff => "무선 기능이 꺼져 있어요. Wi-Fi를 켜면 다시 확인해요.",
                WifiFailure.ProfileRejected => "Windows가 학교 Wi-Fi 설정을 받아들이지 않았어요. 보안 방식과 드라이버를 확인해주세요.",
                _ => "Wi-Fi 상태를 읽지 못했어요. 어댑터·무선 서비스·드라이버를 확인해주세요."
            },
            _ => "작업을 완료하지 못했어요. 앱을 다시 열어 확인해주세요."
        };
        Notice(text, true);
    }
    private static string StatusText(ClientStatus status) => status switch
    {
        ClientStatus.Managing => "자동 관리 중",
        ClientStatus.Connecting => "연결 결과 확인 중",
        ClientStatus.Ready => "관리 시작 전",
        ClientStatus.Paused => "일시 중지",
        ClientStatus.VerificationRequired => "계정 재확인 필요",
        ClientStatus.PermissionRequired => "Wi-Fi 권한 확인 필요",
        ClientStatus.WifiUnavailable => "Wi-Fi 다시 확인 중",
        ClientStatus.CleanupRequired => "자료 정리 필요",
        _ => "자동 관리 꺼짐"
    };
    private void Render()
    {
        if (!loaded || rendering || exiting) return;
        rendering = true;
        try
        {
            var stored = client.HasStoredSession; var cleanup = client.NeedsCleanup || client.Status == ClientStatus.CleanupRequired;
            if (cleanup) view = "account";
            LoginPanel.Visibility = stored ? Visibility.Collapsed : Visibility.Visible;
            HomePanel.Visibility = stored && view == "home" ? Visibility.Visible : Visibility.Collapsed;
            CollectionPanel.Visibility = stored && view == "collection" ? Visibility.Visible : Visibility.Collapsed;
            AccountPanel.Visibility = stored && view == "account" ? Visibility.Visible : Visibility.Collapsed;
            HomeNav.IsEnabled = CollectionNav.IsEnabled = stored && !cleanup;
            AccountNav.IsEnabled = stored;
            foreach (var nav in new[] { HomeNav, CollectionNav, AccountNav }) nav.Background = (string)nav.Tag == view ? (Brush)FindResource("PrimeSoft") : Brushes.Transparent;
            PageTitle.Text = !stored ? "와글에 로그인" : view switch { "collection" => "와이파이 도감", "account" => "내 계정", _ => "나의 연결" };
            PageDescription.Text = !stored ? "운영자에게 받은 개인 코드로 시작하세요." : view switch { "collection" => "학교 Wi-Fi에서 만나는 작은 친구들.", "account" => "이 기기의 계정과 저장 정보를 관리해요.", _ => "연결은 가볍게, 친구는 차곡차곡." };
            LoginPanel.IsEnabled = !busy; LoginButton.Content = busy ? "확인 중…" : "개인 코드로 로그인";
            CheckButton.IsEnabled = CollectionRefreshButton.IsEnabled = !busy && !cleanup;
            LogoutButton.IsEnabled = !busy; LogoutButton.Content = cleanup ? "저장 정보 다시 정리" : "이 기기에서 로그아웃";
            var identity = client.Identity;
            AliasText.Text = cleanup ? "로그아웃 마무리 필요" : identity?.Member.Alias ?? "계정 재확인 필요";
            DeviceText.Text = identity?.Device.Name ?? "저장된 기기 세션";
            ExpiryText.Text = identity is null ? "서버에서 계정 상태를 다시 확인해주세요." : "기기 세션 만료  " + DateTimeOffset.FromUnixTimeMilliseconds(identity.Device.ExpiresAt).ToLocalTime().ToString("yyyy. M. d. HH:mm");
            OriginText.Text = client.Origin ?? "";
            if (!ReferenceEquals(AdapterInput.ItemsSource, client.Interfaces))
            {
                var selected = AdapterInput.SelectedValue; AdapterInput.ItemsSource = client.Interfaces;
                AdapterInput.SelectedValue = client.AdapterId ?? selected ?? (client.Interfaces.Length == 1 ? client.Interfaces[0].Id : null);
            }
            AdapterInput.IsEnabled = ConsentInput.IsEnabled = InterfacesButton.IsEnabled = !busy && !client.ManagementRequested && !cleanup;
            StartButton.IsEnabled = !busy && !client.ManagementRequested && !cleanup && AdapterInput.SelectedValue is Guid && ConsentInput.IsChecked == true;
            StartButton.Content = starting ? "준비 중…" : "관리 시작";
            PauseButton.IsEnabled = !pausing && (client.ManagementRequested || starting);
            var status = StatusText(client.Status); ManagementStateText.Text = TrayStateText.Text = status; tray.Update(client.ManagementRequested, status);
            ManagementHintText.Text = client.Status == ClientStatus.VerificationRequired && client.ManagementRequested ? "서버에서 계정을 재확인할 때까지 새 연결 요청을 쉬어요. 잠시 후 자동으로 다시 확인해요." : client.DecisionReason == WifiReason.ForeignConnection ? "학교 밖의 Wi-Fi를 사용하고 있어요. 현재 연결을 유지해요." : client.Status == ClientStatus.Connecting ? "연결을 요청했어요. Windows가 확인한 결과를 기다리고 있어요." : "신호가 충분하면 연결을 유지하고, 나빠지면 더 나은 학교망 후보를 확인해요. 신호 세기가 실제 속도를 보장하지는 않아요.";
            var observation = client.Observation; var connected = observation?.Connection;
            ConnectionStateText.Text = client.Running ? connected is null ? "연결할 학교망 확인 중" : "Windows 연결 확인" : observation is null ? "연결 상태 확인 전" : "마지막으로 확인한 연결";
            ConnectionNameText.Text = connected is not null ? connected.Ssid ?? "이름을 읽을 수 없는 Wi-Fi" : observation is null ? "관리 시작으로 연결을 확인해요" : "연결된 Wi-Fi가 없어요";
            QualityText.Text = connected is null ? "현재 연결은 Windows에서 확인해요." : $"신호 {connected.Quality}% · 신호 세기와 실제 속도는 다를 수 있어요.";
            ObservedAtText.Text = client.LastObservationAt is { } time ? "마지막 확인  " + time.ToLocalTime().ToString("HH:mm:ss") : "";
            var state = client.Collection;
            ClearHistoryButton.IsEnabled = !busy && identity is not null && state?.History.Length > 0;
            HistoryText.Text = state?.History.Length > 0 ? string.Join("\n", state.History.TakeLast(6).Reverse().Select(e => DateTimeOffset.FromUnixTimeMilliseconds(e.At).ToLocalTime().ToString("HH:mm") + "  " + EventText(e.Kind) + (e.Ssid is null ? "" : " · " + e.Ssid))) : "아직 연결 기록이 없어요.";
            RenderCollection(state);
            if (!stored || cleanup) CloseDetail();
        }
        finally { rendering = false; }
    }
    private void RenderCollection(ClientState? state)
    {
        if (ReferenceEquals(renderedCollection, state) && GalleryRows.ItemsSource is not null) return;
        renderedCollection = state;
        var found = state is null ? new HashSet<string>(StringComparer.Ordinal) : state.Collected.ApIds.Concat(state.Pending.Select(p => p.ApId)).ToHashSet(StringComparer.Ordinal);
        var pending = state?.Pending.Select(p => p.ApId).ToHashSet(StringComparer.Ordinal) ?? [];
        cards = (state?.Catalog.Characters ?? []).ToDictionary(c => c.Id, c => new CharacterCard(c, found.Contains(c.Id), pending.Contains(c.Id)), StringComparer.Ordinal);
        var total = cards.Count; var count = cards.Values.Count(c => c.Found);
        CollectionCountText.Text = $"{count} / {total}명 발견"; CollectionProgress.Maximum = Math.Max(1, total); CollectionProgress.Value = count;
        CollectionSyncText.Text = pending.Count > 0 ? $"동기화 대기 {pending.Count}명 · 같은 계정의 기기에서 함께 모아요." : "같은 계정의 기기에서 함께 모아요.";
        GalleryRows.ItemsSource = cards.Values.OrderBy(c => c.Info.Name, StringComparer.Ordinal).ThenBy(c => c.Info.Id, StringComparer.Ordinal).Chunk(3).Select(row => new CharacterRow(row)).ToArray();
        GalleryEmptyText.Visibility = total == 0 ? Visibility.Visible : Visibility.Collapsed;
        GalleryEmptyText.Text = state is null ? "계정 상태를 다시 확인하면 친구들을 불러와요." : "아직 준비된 친구가 없어요. 잠시 후 다시 확인해주세요.";
        var open = DetailSelection.Refresh(CharacterDetail.DataContext, cards);
        if (open is null) CloseDetail(); else CharacterDetail.DataContext = open;
    }
    private static string EventText(LocalEventKind kind) => kind switch { LocalEventKind.Started => "자동 관리 시작", LocalEventKind.Paused => "일시 중지", LocalEventKind.Connected => "연결 확인", LocalEventKind.Requested => "연결 요청", LocalEventKind.Failed => "연결 요청 실패", LocalEventKind.TimedOut => "연결 확인 시간 초과", _ => "새 친구 수집" };
    private void NavigateClicked(object sender, RoutedEventArgs e) { if (sender is Button { Tag: string selected }) { view = selected; CloseDetail(); Render(); } }
    private void CharacterClicked(object sender, RoutedEventArgs e) { if (sender is Button { DataContext: CharacterCard card }) { CharacterDetail.DataContext = card; CharacterDetail.Visibility = Visibility.Visible; } }
    private void CloseDetailClicked(object sender, RoutedEventArgs e) => CloseDetail();
    private void CloseDetail() { CharacterDetail.Visibility = Visibility.Collapsed; CharacterDetail.DataContext = null; }
    private async void CharacterImageLoaded(object sender, RoutedEventArgs e) { if (sender is FrameworkElement { DataContext: CharacterCard card }) await LoadPictureAsync(card); }
    private async void CharacterImageContextChanged(object sender, DependencyPropertyChangedEventArgs e) { if (e.NewValue is CharacterCard card) await LoadPictureAsync(card); }
    private async Task LoadPictureAsync(CharacterCard card)
    {
        if (card.Picture is not null || card.Loading || card.Info.ImagePath is null || client.Origin is not { } origin) return;
        card.Loading = true;
        try { var frames = await art.LoadAsync(origin, card.Info.ImagePath, closing.Token); if (frames is not null && !closing.IsCancellationRequested) card.Picture = card.Found ? frames.Color : frames.Gray; }
        catch (OperationCanceledException) { }
        finally { card.Loading = false; }
    }
    private void Notice(string text, bool error = false)
    {
        if (exiting) return;
        MessageText.Text = text; MessageText.Foreground = new SolidColorBrush(error ? Color.FromRgb(163, 62, 54) : Color.FromRgb(16, 81, 81));
        MessagePanel.Background = new SolidColorBrush(error ? Color.FromRgb(255, 244, 244) : Color.FromRgb(224, 243, 244)); MessagePanel.Visibility = Visibility.Visible;
    }
    private void ShowWindow() { Show(); WindowState = WindowState.Normal; Activate(); Focus(); }
    private async void WindowClosing(object? sender, CancelEventArgs e)
    {
        if (allowClose) return;
        e.Cancel = true;
        if (client.ManagementRequested && !exiting) { Hide(); if (!backgroundNotice) { backgroundNotice = true; tray.BackgroundNotice(); } return; }
        await ExitAsync();
    }
    private async Task ExitAsync()
    {
        if (exiting) return;
        exiting = true; ticker.Stop(); closing.Cancel();
        try { await client.PauseAsync(CancellationToken.None); } catch { }
        try { await client.DisposeAsync(); } finally { art.Dispose(); tray.Dispose(); allowClose = true; Close(); Application.Current.Shutdown(); }
    }
    private void WindowClosed(object? sender, EventArgs e) => closing.Cancel();
}
