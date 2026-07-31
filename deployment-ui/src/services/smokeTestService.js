import smokeTestApi from "../api/smokeTestApi";

export const getLatestSmokeTest = async () => {
    const response = await smokeTestApi.get("/latest");
    return response.data;
};

export const runSmokeTests = async () => {
    const response = await smokeTestApi.post("/run");
    return response.data;
};

export const getSmokeTestRun = async (runId) => {
    const response = await smokeTestApi.get(`/run/${runId}`);
    return response.data;
};
