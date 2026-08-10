import axios from "axios";

// Relative path by default, proxied to SecurityAPI — see adminApi.js for
// why, and for what VITE_SECURITY_API_BASE_URL is for.
const SECURITY_API_BASE = import.meta.env.VITE_SECURITY_API_BASE_URL || "/security-api";

export default axios.create({
    baseURL: `${SECURITY_API_BASE}/api`,
    withCredentials: true
});
