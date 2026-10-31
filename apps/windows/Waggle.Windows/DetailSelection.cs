namespace Waggle.Windows;

internal static class DetailSelection
{
    // An open detail may only show a character that is still in the current collection.
    public static CharacterCard? Refresh(object? open, IReadOnlyDictionary<string, CharacterCard> cards) =>
        open is CharacterCard old && cards.TryGetValue(old.Info.Id, out var updated) ? updated : null;
}
