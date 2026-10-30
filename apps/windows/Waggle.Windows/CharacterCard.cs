using System.ComponentModel;
using System.Windows;
using System.Windows.Media;
using Waggle.Core;
namespace Waggle.Windows;

internal sealed class CharacterCard(CharacterInfo info, bool found, bool pending) : INotifyPropertyChanged
{
    // Realized WPF images and the bounded ArtImages cache own frames; catalog rows do not.
    private WeakReference<ImageSource>? picture;
    public CharacterInfo Info { get; } = info;
    public bool Found { get; } = found;
    public bool Pending { get; } = pending;
    public bool Loading { get; set; }
    public string Name => Found ? Info.Name : "???";
    public string Caption => Found ? Pending ? "동기화 대기" : "친구가 됐어요" : "아직 미발견";
    public string Story => Found ? Info.Description : "학교 Wi-Fi에 실제로 연결되면 이 친구를 만날 수 있어요.";
    public string AccessibleName => Name + ", " + Caption;
    public Visibility Placeholder => Picture is null ? Visibility.Visible : Visibility.Collapsed;
    public ImageSource? Picture
    {
        get => picture is not null && picture.TryGetTarget(out var image) ? image : null;
        set { picture = value is null ? null : new(value); PropertyChanged?.Invoke(this, new(nameof(Picture))); PropertyChanged?.Invoke(this, new(nameof(Placeholder))); }
    }
    public event PropertyChangedEventHandler? PropertyChanged;
}
internal sealed record CharacterRow(IReadOnlyList<CharacterCard> Cards);
