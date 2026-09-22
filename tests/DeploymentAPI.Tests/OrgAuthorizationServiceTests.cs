using DeploymentAPI.Services;
using Xunit;

namespace DeploymentAPI.Tests;

// OrgAuthorizationService.ApplyOverrides is the actual security-sensitive
// decision rule behind "can a Contributor deploy without seeing the
// credential" etc - the role-permissions-minus-deny-plus-grant merge. This
// is the one piece of this feature most worth pinning down with tests,
// since a mistake here is a silent authorization bug, not a crash.
public class OrgAuthorizationServiceTests
{
    [Fact]
    public void NoOverrides_KeepsRolePermissionsUnchanged()
    {
        var granted = new HashSet<string> { "deployments.execute", "deployments.view" };

        OrgAuthorizationService.ApplyOverrides(granted, []);

        Assert.Equal(["deployments.execute", "deployments.view"], granted.OrderBy(x => x));
    }

    [Fact]
    public void DenyOverride_RemovesARolePermission()
    {
        var granted = new HashSet<string> { "credentials.read", "deployments.view" };

        OrgAuthorizationService.ApplyOverrides(granted, [("credentials.read", "deny")]);

        Assert.DoesNotContain("credentials.read", granted);
        Assert.Contains("deployments.view", granted);
    }

    [Fact]
    public void GrantOverride_AddsAPermissionTheRoleDidNotHave()
    {
        // Contributor's seeded matrix has no credentials.read - an
        // explicit per-user grant override adds it just for this one member.
        var granted = new HashSet<string> { "credentials.use", "deployments.execute" };

        OrgAuthorizationService.ApplyOverrides(granted, [("credentials.read", "grant")]);

        Assert.Contains("credentials.read", granted);
    }

    [Fact]
    public void GrantOverride_WinsOverADenyOnTheSamePermission()
    {
        // Shouldn't happen given the DB's unique constraint on
        // (organization_member_id, permission_id), but the resolution
        // order must still be unambiguous if it ever did - see
        // ApplyOverrides' own comment on why deny is applied first.
        var granted = new HashSet<string> { "credentials.write" };

        OrgAuthorizationService.ApplyOverrides(
            granted, [("credentials.write", "deny"), ("credentials.write", "grant")]);

        Assert.Contains("credentials.write", granted);
    }

    [Fact]
    public void DenyOverride_OnAPermissionTheRoleNeverHad_IsANoOp()
    {
        var granted = new HashSet<string> { "deployments.view" };

        OrgAuthorizationService.ApplyOverrides(granted, [("credentials.delete", "deny")]);

        Assert.Single(granted, "deployments.view");
    }

    [Fact]
    public void MixedOverrides_AdminExampleFromTheSeededMatrix_ResolvesCorrectly()
    {
        // Admin's full seeded set, with one permission individually
        // revoked (e.g. an org wants one specific Admin to never delete
        // credentials, even though the role normally allows it) and one
        // unrelated permission re-granted for clarity that grant/deny are
        // independent, not mutually exclusive across different keys.
        var granted = new HashSet<string>
        {
            "organization.manage", "members.manage", "credentials.read",
            "credentials.write", "credentials.delete", "credentials.use",
            "deployments.execute", "deployments.view", "audit_logs.view"
        };

        OrgAuthorizationService.ApplyOverrides(
            granted, [("credentials.delete", "deny"), ("cloud_services.write", "grant")]);

        Assert.DoesNotContain("credentials.delete", granted);
        Assert.Contains("cloud_services.write", granted);
        Assert.Contains("organization.manage", granted);
    }
}
