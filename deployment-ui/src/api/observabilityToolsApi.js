import { createApiClient } from "./apiBase";

// "ObservabilityTools", not "Observability" - that name is already taken
// by observabilityApi.js (the portal's own super-admin-only Hosting
// Observability dashboard, a completely different, pre-existing feature -
// see ObservabilityController.cs's own comment on the same naming
// collision on the backend side).
export default createApiClient("/api/observabilitytools");
