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
