using DeploymentAPI.DTOs;
using Microsoft.AspNetCore.Mvc.ActionConstraints;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace DeploymentAPI.Helpers;

// Shared route-reflection logic - originally private to
// SecurityTestingController.GetDiscoveredRoutes, pulled out here so
// HostingObservabilityController's Backend Endpoint Inventory panel can
// reuse the exact same discovery mechanism (auto-discover live ASP.NET Core
// routes via IActionDescriptorCollectionProvider) without a second, drifting
// copy. SecurityTestingController keeps its own DiscoveredRouteDto-returning
// action as-is - different DTO, working feature, not worth the regression
// risk to force both onto one shared type.
public static class EndpointDiscovery
{
    public static List<HostingEndpointInventoryItemDto> Discover(IActionDescriptorCollectionProvider provider) =>
        provider.ActionDescriptors.Items
            .OfType<ControllerActionDescriptor>()
            .Where(a => !string.IsNullOrWhiteSpace(a.AttributeRouteInfo?.Template))
            .Select(a => new HostingEndpointInventoryItemDto
            {
                Controller = a.ControllerName,
                Method = a.ActionConstraints?.OfType<HttpMethodActionConstraint>()
                    .FirstOrDefault()?.HttpMethods.FirstOrDefault() ?? "GET",
                Path = "/" + a.AttributeRouteInfo!.Template!.TrimStart('/')
            })
            .DistinctBy(r => (r.Method, r.Path))
            .OrderBy(r => r.Controller).ThenBy(r => r.Path)
            .ToList();
}
