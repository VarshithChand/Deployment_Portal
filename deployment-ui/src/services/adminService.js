import api from "../api/adminApi";

// Real PAT users (same data Settings > Sidebar Access shows) - see
// AdminUsersController for why there's no create/update here.
export const getUsers = async () => await api.get("/users");

// Ends that one session immediately - see GlobalLogoutMonitor's
// mySessionForceLogoutEpoch handling for how it takes effect.
export const forceLogoutUser = async (key) => await api.post(`/users/${encodeURIComponent(key)}/logout`);

// Rejected outright on every request from then on, even with a still-
// valid token - see the block-check middleware in Program.cs.
export const blockUser = async (key) => await api.post(`/users/${encodeURIComponent(key)}/block`);

export const unblockUser = async (key) => await api.post(`/users/${encodeURIComponent(key)}/unblock`);

// Real delete, not the soft sign-out above - removes every credential
// and restriction tied to this key. Irreversible.
export const deleteUser = async (key) => await api.delete(`/users/${encodeURIComponent(key)}`);

// Merges rows that resolve to the same real GitHub account, keeping
// whichever was active most recently - a one-time cleanup for rows that
// predate the one-session-per-PAT check saving now enforces.
export const removeDuplicateUsers = async () => await api.post("/users/dedupe");
