using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Helpers;

// Mirrors AdminGate's shape (a static gate a controller action calls in
// one line, returning a denial IActionResult or null) for the new,
// SEPARATE org-permission authorization axis - see the plan's "Scope
// boundary" section. AdminGate stays exactly as-is for the portal-wide
// admin surfaces it already covers; this only appears on genuinely new
// org-scoped actions. No action should ever need both gates.
public static class OrgAuthGate
{
    // organizationId is passed explicitly rather than resolved here from a
    // header - callers that already have it from the route (org
    // management actions) or from OrgContext.ResolveAsync (cross-cutting
    // resource actions) both just hand it in, keeping this gate itself
    // agnostic to where the id came from.
    public static async Task<IActionResult?> DenyUnlessPermissionAsync(
        ControllerBase controller,
        MembershipService membership,
        OrgAuthorizationService orgAuth,
        string userId,
        Guid organizationId,
        string permissionKey,
        string action)
    {
        var membershipRow = await membership.GetActiveMembershipAsync(organizationId, userId);

        if (membershipRow == null)
            return controller.StatusCode(403, new { message = "You are not a member of that organization." });

        var permissions = await orgAuth.ResolveAsync(userId, organizationId);

        if (!permissions.Contains(permissionKey))
        {
            return controller.StatusCode(403, new
            {
                message = $"You don't have permission to {action}. Contact your organization administrator."
            });
        }

        return null;
    }
}
