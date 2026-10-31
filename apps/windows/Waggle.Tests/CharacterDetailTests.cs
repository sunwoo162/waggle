using Waggle.Core;
using Waggle.Windows;

namespace Waggle.Tests;

[TestClass]
public sealed class CharacterDetailTests
{
    private const string Id = "11111111-1111-4111-8111-111111111111";
    private static CharacterCard Card(string name, bool found = false) => new(new CharacterInfo(Id, name, "", null), found, false);

    [TestMethod]
    public void OpenDetailFollowsTheUpdatedCardForTheSameCharacter()
    {
        var updated = Card("새 이름", found: true);
        Assert.AreSame(updated, DetailSelection.Refresh(Card("옛 이름"), new Dictionary<string, CharacterCard> { [Id] = updated }));
    }

    [TestMethod]
    public void OpenDetailClosesWhenTheCharacterDisappearsOrCollectionIsGone()
    {
        Assert.IsNull(DetailSelection.Refresh(Card("사라질 친구"), new Dictionary<string, CharacterCard>()));
        Assert.IsNull(DetailSelection.Refresh(null, new Dictionary<string, CharacterCard> { [Id] = Card("남은 친구") }));
    }
}
