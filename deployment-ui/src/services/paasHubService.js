import api from "../api/paasHubApi";

export const getPaasApplications = async () => {
    const response = await api.get("/applications");
    return response.data;
};

export const bulkRestartPaasApplications = async (items) => {
    const response = await api.post("/bulk/restart", { items });
    return response.data;
};
