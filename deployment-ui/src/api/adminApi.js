import axios from "axios";

// Relative path by default, proxied to AdminAPI by vite.config.js in dev
// and by nginx.conf in a Docker build - same-origin there, so no CORS
// needed. Set VITE_ADMIN_API_BASE_URL at build time when AdminAPI is
// hosted separately from the frontend (e.g. this Cloudflare-hosted
// frontend calling an AdminAPI deployed on its own, with no proxy in
// between) - see apiBase.js's VITE_API_BASE_URL for the same pattern on
// the main backend. AdminAPI's own CORS (see AdminAPI/Program.cs) must
// then list this frontend's origin.
const ADMIN_API_BASE = import.meta.env.VITE_ADMIN_API_BASE_URL || "/admin-api";

export default axios.create({
    baseURL: `${ADMIN_API_BASE}/api`,
    withCredentials: true
});
