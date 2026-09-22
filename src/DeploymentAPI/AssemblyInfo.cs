using System.Runtime.CompilerServices;

// Lets tests/DeploymentAPI.Tests exercise the `internal` pure-logic
// methods extracted specifically for unit testing (OrgAuthorizationService.
// ApplyOverrides, InvitationService.ComputeTokenHash/IsAcceptable,
// OrganizationService.SlugifyBase) without making them public API surface
// this app's controllers/frontend could otherwise be tempted to call
// directly.
[assembly: InternalsVisibleTo("DeploymentAPI.Tests")]
