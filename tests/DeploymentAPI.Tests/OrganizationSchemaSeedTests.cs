using DeploymentAPI.Data;
using Xunit;

namespace DeploymentAPI.Tests;

// Pins down the seeded role -> permission matrix itself, specifically the
// credentials rule: Contributor and Read can both SEE an organization's
// credentials (name/provider/configured - never the secret), but only
// Admin can create/edit/delete one. A regression here would either hide
// the Credentials panel from a Contributor who should see it, or - far
// worse - let a Contributor/Read edit a credential they should only be
// able to view.
public class OrganizationSchemaSeedTests
{
    private static string[] PermissionsFor(string roleKey) =>
        OrganizationSchema.SystemRoles.Single(r => r.Key == roleKey).PermissionKeys;

    [Fact]
    public void Admin_HasEveryPermissionInTheCatalog()
    {
        var admin = PermissionsFor("admin");
        var allKeys = OrganizationSchema.PermissionCatalog.Select(p => p.Key);

        Assert.Equal(allKeys.OrderBy(k => k), admin.OrderBy(k => k));
    }

    [Fact]
    public void Contributor_CanSeeCredentials_ButNotEditThem()
    {
        var contributor = PermissionsFor("contributor");

        Assert.Contains("credentials.read", contributor);
        Assert.Contains("credentials.use", contributor);
        Assert.DoesNotContain("credentials.write", contributor);
        Assert.DoesNotContain("credentials.delete", contributor);
    }

    [Fact]
    public void Read_CanSeeCredentials_ButNotEditOrUseThem()
    {
        var read = PermissionsFor("read");

        Assert.Contains("credentials.read", read);
        Assert.DoesNotContain("credentials.use", read);
        Assert.DoesNotContain("credentials.write", read);
        Assert.DoesNotContain("credentials.delete", read);
    }

    [Theory]
    [InlineData("contributor")]
    [InlineData("read")]
    public void OnlyAdmin_HasCredentialsWriteOrDelete(string nonAdminRoleKey)
    {
        var permissions = PermissionsFor(nonAdminRoleKey);

        Assert.DoesNotContain("credentials.write", permissions);
        Assert.DoesNotContain("credentials.delete", permissions);
    }

    [Fact]
    public void EveryRolePermissionKey_ExistsInTheCatalog()
    {
        // Catches a typo'd permission key in the SystemRoles matrix that
        // would otherwise silently grant nothing (the seeding loop skips
        // any key it can't resolve to a real permissions row - see
        // SeedRolesAndPermissionsAsync).
        var catalogKeys = OrganizationSchema.PermissionCatalog.Select(p => p.Key).ToHashSet();

        foreach (var role in OrganizationSchema.SystemRoles)
        {
            foreach (var key in role.PermissionKeys)
                Assert.Contains(key, catalogKeys);
        }
    }
}
