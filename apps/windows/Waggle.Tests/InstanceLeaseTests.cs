using Waggle.Platform.Windows;
namespace Waggle.Tests;

[TestClass]
public sealed class InstanceLeaseTests
{
    [TestMethod]
    public void GlobalLeaseRejectsASecondOwnerAndCanBeAcquiredAfterRelease()
    {
        var name = "Global\\Waggle-Tests-" + Guid.NewGuid();
        using (var first = new SingleInstanceLease(name))
        {
            Assert.IsTrue(first.OwnsInstance);
            var otherAcquired = true;
            var thread = new Thread(() => { using var other = new SingleInstanceLease(name); otherAcquired = other.OwnsInstance; });
            thread.Start(); Assert.IsTrue(thread.Join(TimeSpan.FromSeconds(5))); Assert.IsFalse(otherAcquired);
        }
        using var next = new SingleInstanceLease(name); Assert.IsTrue(next.OwnsInstance);
    }
}
