import axios from "axios";

// Empty by default so every client's baseURL stays a plain "/api/..." path —
// that works as-is for local dev (Vite's proxy) and the Docker/nginx setup
// (nginx reverse-proxies /api to the backend container). Set
// VITE_API_BASE_URL at build time when frontend and backend are on
// different origins (e.g. a static host + a separately hosted API), so
// requests go to an absolute URL instead.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// Identifies this browser to the backend's per-user GitHub credentials
// (see PortalIdentity.cs) when there's no GitHub OAuth login — generated
// once and persisted in localStorage, then sent as an explicit header on
// every request rather than relying on a cookie. A cookie set by a
// separately-hosted API (e.g. this Cloudflare-hosted frontend calling a
// Render-hosted backend) is a third-party cookie from the browser's point
// of view, and modern browsers (Safari, increasingly Chrome) block those
// by default regardless of SameSite/Secure — a plain custom header has no
// such restriction.
const SESSION_STORAGE_KEY = "portalSessionId";

function getSessionId() {

    let id = localStorage.getItem(SESSION_STORAGE_KEY);

    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(SESSION_STORAGE_KEY, id);
    }

    return id;

}

export function createApiClient(path, options = {}) {

    const client = axios.create({
        baseURL: `${API_BASE}${path}`,
        withCredentials: true,
        ...options
    });

    client.interceptors.request.use((config) => {
        config.headers["X-Session-Id"] = getSessionId();
        return config;
    });

    return client;

}
