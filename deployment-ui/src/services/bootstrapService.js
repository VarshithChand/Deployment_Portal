import api from "../api/bootstrapApi";

// One consolidated read for everything AuthContext needs on startup -
// replaces what used to be GET /api/auth/me, GET /api/settings, GET
// /api/settings/me/github (previously fetched separately by AuthContext,
// RequireGitHubSetup, and TopBar), GET /api/settings/me/aws, GET
// /api/settings/me/pin, and conditionally GET /api/github/token-owner.
export const getBootstrap = async () => await api.get("/");
