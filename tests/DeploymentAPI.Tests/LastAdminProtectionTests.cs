using DeploymentAPI.Services;
using Xunit;

namespace DeploymentAPI.Tests;

// The "cannot remove the last organization administrator" rule (spec
// section 19) - MembershipService.ChangeRoleAsync/RemoveMemberAsync/
// HandleAccountDeletionAsync all call this same rule after counting
// active admins EXCLUDING the member being changed/removed (see those
// methods' own SQL, "AND om.id != @excludingMemberId") - so
// remainingActiveAdmins here already has that exclusion baked in.
public class LastAdminProtectionTests
{
    [Fact]
    public void ZeroRemainingAdmins_WouldLeaveOrgWithoutAdmin()
    {
        Assert.True(LastAdminProtection.WouldLeaveOrganizationWithoutAdmin(0));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(10)]
    public void AtLeastOneRemainingAdmin_IsSafe(int remaining)
    {
        Assert.False(LastAdminProtection.WouldLeaveOrganizationWithoutAdmin(remaining));
    }
}
