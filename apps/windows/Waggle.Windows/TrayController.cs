using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using Forms = System.Windows.Forms;
namespace Waggle.Windows;

internal sealed class TrayController : IDisposable
{
    private readonly Forms.NotifyIcon icon;
    private readonly Forms.ToolStripMenuItem pause;
    private readonly Icon drawing;
    internal TrayController(Action open, Action stop, Action exit)
    {
        drawing = CreateIcon();
        var menu = new Forms.ContextMenuStrip(); menu.Items.Add("와글 열기", null, (_, _) => open());
        pause = new Forms.ToolStripMenuItem("관리 일시 중지", null, (_, _) => stop()); menu.Items.Add(pause);
        menu.Items.Add(new Forms.ToolStripSeparator()); menu.Items.Add("와글 종료", null, (_, _) => exit());
        icon = new Forms.NotifyIcon { Icon = drawing, Text = "와글 · 자동 관리 꺼짐", ContextMenuStrip = menu, Visible = true };
        icon.DoubleClick += (_, _) => open();
    }
    internal void Update(bool requested, string status) { pause.Enabled = requested; icon.Text = ("와글 · " + status)[..Math.Min(60, ("와글 · " + status).Length)]; }
    internal void BackgroundNotice() => icon.ShowBalloonTip(3000, "와글이 계속 관리하고 있어요", "트레이 아이콘을 두 번 누르면 다시 열 수 있어요. 종료는 트레이 메뉴에서 선택해주세요.", Forms.ToolTipIcon.Info);
    internal void ResumeFailed() => icon.ShowBalloonTip(5000, "와글 자동 관리를 다시 켜지 못했어요", "트레이 아이콘을 두 번 눌러 상태를 확인해주세요. 인터넷이 연결되면 자동으로 다시 시도해요.", Forms.ToolTipIcon.Warning);
    internal void Collected(string name) => icon.ShowBalloonTip(3000, "새로운 친구를 만났어요", name + "와 친구가 됐어요.", Forms.ToolTipIcon.None);
    private static Icon CreateIcon()
    {
        using var bitmap = new Bitmap(32, 32); using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias; graphics.Clear(Color.Transparent);
        using var pen = new Pen(Color.FromArgb(0, 147, 139), 3) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        graphics.DrawArc(pen, 2, 4, 28, 28, 225, 90); graphics.DrawArc(pen, 7, 11, 18, 18, 225, 90);
        using var brush = new SolidBrush(pen.Color); graphics.FillEllipse(brush, 13, 24, 6, 6);
        var handle = bitmap.GetHicon();
        try { using var original = Icon.FromHandle(handle); return (Icon)original.Clone(); }
        finally { DestroyIcon(handle); }
    }
    [DllImport("user32.dll", ExactSpelling = true), DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [return: MarshalAs(UnmanagedType.Bool)] private static extern bool DestroyIcon(IntPtr icon);
    public void Dispose() { icon.Visible = false; icon.ContextMenuStrip?.Dispose(); icon.Dispose(); drawing.Dispose(); }
}
