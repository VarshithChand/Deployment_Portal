import { createApiClient } from "./apiBase";

// See adminApi.js for why this is a plain API_BASE-routed client now
// instead of a separately-hosted PMSCoreAPI.
export default createApiClient("/api/pmscore");
