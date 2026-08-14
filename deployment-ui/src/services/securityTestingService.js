import api from "../api/securityTestingApi";

export const getTargets = async () => (await api.get("/targets")).data;

export const addTarget = async (url) => (await api.post("/targets", { url })).data;

export const removeTarget = async (id) => (await api.delete(`/targets/${encodeURIComponent(id)}`)).data;

// activeMode/activeModeConfirmed are both re-checked server-side
// regardless of what's sent here - see SecurityScanRequestDto's own
// comment for why a caller can't trip active testing with just one flag.
export const runScan = async (url, activeMode, activeModeConfirmed) =>
    (await api.post("/scan", { url, activeMode, activeModeConfirmed })).data;

export const getDiscoveredRoutes = async () => (await api.get("/discovered-routes")).data;

export const getScans = async () => (await api.get("/scans")).data;

export const getScan = async (id) => (await api.get(`/scans/${encodeURIComponent(id)}`)).data;

export const deleteScan = async (id) => (await api.delete(`/scans/${encodeURIComponent(id)}`)).data;
