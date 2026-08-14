import { createApiClient } from "./apiBase";

// Super-admin-only end to end (see AdminGate.DenyUnlessSuperAdminAsync on
// every action this hits) - same as adminApi.js, just its own path.
export default createApiClient("/api/admin/security-testing");
