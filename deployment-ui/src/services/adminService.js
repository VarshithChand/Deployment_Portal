import api from "../api/adminApi";

// Real PAT users (same data Settings > Sidebar Access shows) - see
// AdminUsersController for why there's no create/update here.
export const getUsers = async () => await api.get("/users");

// Ends that one session immediately - see GlobalLogoutMonitor's
// mySessionForceLogoutEpoch handling for how it takes effect.
export const forceLogoutUser = async (key) => await api.post(`/${encodeURIComponent(key)}/logout`);

// Rejected outright on every request from then on, even with a still-
// valid token - see the block-check middleware in Program.cs.
export const blockUser = async (key) => await api.post(`/${encodeURIComponent(key)}/block`);

export const unblockUser = async (key) => await api.post(`/${encodeURIComponent(key)}/unblock`);
