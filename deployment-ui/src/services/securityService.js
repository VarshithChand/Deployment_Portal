import api from "../api/securityApi";

// The portal's real activity log (same data/gate Settings > Activity Log
// uses) - see SecurityAuditLogController for why there's no create here.
export const getAuditLogs = async () => await api.get("/audit-logs");

// Admin-only — every PAT user's keys (Services > Security).
export const getApiKeys = async () => await api.get("/api-keys");

export const createApiKey = async (name) => await api.post("/api-keys", { name });

export const revokeApiKey = async (id) => await api.delete(`/api-keys/${id}`);

// Self-service, no admin required — the caller's own key(s) only
// (Settings > Credentials > API Key).
export const getMyApiKeys = async () => await api.get("/api-keys/mine");

export const createMyApiKey = async (name) => await api.post("/api-keys/mine", { name });

export const revokeMyApiKey = async (id) => await api.delete(`/api-keys/mine/${id}`);
