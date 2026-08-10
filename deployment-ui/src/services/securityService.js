import api from "../api/securityApi";

// The portal's real activity log (same data/gate Settings > Activity Log
// uses) - see SecurityAuditLogController for why there's no create here.
export const getAuditLogs = async () => await api.get("/audit-logs");

export const getApiKeys = async () => await api.get("/api-keys");

export const createApiKey = async (name) => await api.post("/api-keys", { name });

export const revokeApiKey = async (id) => await api.delete(`/api-keys/${id}`);
