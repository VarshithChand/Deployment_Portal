import api from "../api/adminApi";

// Real PAT users (same data Settings > Sidebar Access shows) - see
// AdminUsersController for why there's no create/update/delete here.
export const getUsers = async () => await api.get("/users");
