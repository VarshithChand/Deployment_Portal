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

// Every controller action's response is wrapped server-side in a standard
// {success,data} / {success,error:{code,message,correlationId}} envelope
// (see DeploymentAPI's ApiResponseWrapperFilter) - unwrapped back out here,
// in the one place every API client in this app is built, so none of this
// codebase's many `response.data` call sites (the DTO itself, an array,
// etc.) needed to change to match. A DTO that has its own unrelated
// `success`/`error` fields (e.g. CloudServiceActionResultDto) is untouched -
// this only ever unwraps the outer envelope, one level, never anything
// nested inside `data`.
function unwrapEnvelope(client) {

    client.interceptors.response.use(
        (response) => {

            const body = response.data;

            if (body !== null && typeof body === "object" && "success" in body && "data" in body) {
                response.data = body.data;
            }

            return response;

        },
        (error) => {

            const body = error.response?.data;

            // Flattens error.message/code/correlationId back onto the top
            // level too, so the `err.response?.data?.message || "..."`
            // fallback pattern already used throughout this codebase keeps
            // reading the real backend message instead of silently falling
            // back to the generic default everywhere.
            if (body && typeof body === "object" && body.success === false && body.error) {
                body.message = body.error.message;
                body.code = body.error.code;
                body.correlationId = body.error.correlationId;
            }

            return Promise.reject(error);

        }
    );

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

    unwrapEnvelope(client);

    return client;

}
