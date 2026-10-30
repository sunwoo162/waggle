using System.Runtime.CompilerServices;
using System.Windows.Media;
using Waggle.Core;
using Waggle.Windows;

namespace Waggle.Tests;

[TestClass]
public sealed class CharacterMemoryTests
{
    [TestMethod]
    public void OffscreenCardDoesNotRetainDecodedImage()
    {
        var (card, image) = CreateOffscreenCard();
        GC.Collect(); GC.WaitForPendingFinalizers(); GC.Collect();
        Assert.IsFalse(image.IsAlive, "A virtualized catalog must not retain every decoded picture.");
        Assert.IsNull(card.Picture);
        GC.KeepAlive(card);
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static (CharacterCard, WeakReference) CreateOffscreenCard()
    {
        var image = new DrawingImage(new GeometryDrawing(Brushes.Teal, null, new RectangleGeometry(new(0, 0, 10, 10))));
        image.Freeze();
        var card = new CharacterCard(new CharacterInfo("11111111-1111-4111-8111-111111111111", "합성 친구", "", null), false, false) { Picture = image };
        Assert.AreSame(image, card.Picture);
        return (card, new WeakReference(image));
    }
}
