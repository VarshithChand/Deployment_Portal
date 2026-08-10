import axios from "axios";

// Relative path by default, proxied to PMSCoreAPI — see adminApi.js for
// why, and for what VITE_PMSCORE_API_BASE_URL is for.
const PMSCORE_API_BASE = import.meta.env.VITE_PMSCORE_API_BASE_URL || "/pmscore-api";

export default axios.create({
    baseURL: `${PMSCORE_API_BASE}/api`,
    withCredentials: true
});
