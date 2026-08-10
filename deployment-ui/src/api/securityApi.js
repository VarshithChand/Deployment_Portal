import { createApiClient } from "./apiBase";

// See adminApi.js for why this is a plain API_BASE-routed client now
// instead of a separately-hosted SecurityAPI.
export default createApiClient("/api/security");
