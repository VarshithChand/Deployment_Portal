import { createApiClient } from "./apiBase";

// Same origin as every other client here now — the Services page's
// "Users (AdminAPI)" tab used to call a separately-hosted AdminAPI via a
// relative /admin-api/api path that only worked behind a dev/Docker
// proxy; DeploymentAPI now has its own built-in copy of these endpoints
// (see Services/UserStore.cs), so this is just a normal API_BASE-routed
// client like the rest of the app.
export default createApiClient("/api/admin");
