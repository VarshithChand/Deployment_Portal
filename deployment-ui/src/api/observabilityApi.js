import { createApiClient } from "./apiBase";

// Super-admin-only end to end (see AdminGate.DenyUnlessSuperAdminAsync on
// every action this hits) - same posture as securityTestingApi.js/adminApi.js.
export default createApiClient("/api/observability");
