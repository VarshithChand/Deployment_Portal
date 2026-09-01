import externalHealthApi from "../api/externalHealthApi";

export const getExternalHealthEndpoints = async () => {
    const response = await externalHealthApi.get("/endpoints");
    return response.data.endpointsText || "";
};

export const saveExternalHealthEndpoints = async (endpointsText) => {
    const response = await externalHealthApi.post("/endpoints", { endpointsText });
    return response.data.endpointsText || "";
};

export const checkExternalHealth = async (urls) => {
    const response = await externalHealthApi.post("/check", { urls });
    return response.data;
};

// The login page's unauthenticated "External APIs" tool - see
// ExternalHealthController.CheckPublic. Capped at 5 URLs server-side and
// never reads/writes the saved endpoint list; a scratch-only check for
// someone who isn't signed in.
export const checkExternalHealthPublic = async (urls) => {
    const response = await externalHealthApi.post("/check-public", { urls });
    return response.data;
};
