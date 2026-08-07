import awsSsoApi from "../api/awsSsoApi";

export const startAwsSso = async (startUrl, ssoRegion) => {
    const response = await awsSsoApi.post("/start", { startUrl, ssoRegion });
    return response.data;
};

export const pollAwsSso = async (pendingId) => {
    const response = await awsSsoApi.get("/poll", { params: { pendingId } });
    return response.data;
};

export const getAwsSsoAccounts = async (pendingId) => {
    const response = await awsSsoApi.get("/accounts", { params: { pendingId } });
    return response.data;
};

export const selectAwsSsoAccount = async (pendingId, accountId, roleName, region) => {
    const response = await awsSsoApi.post("/select", { pendingId, accountId, roleName, region });
    return response.data;
};
