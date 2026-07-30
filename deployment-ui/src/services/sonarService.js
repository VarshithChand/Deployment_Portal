import sonarApi from "../api/sonarApi";

export const getSonarOverview = async () => {
    const response = await sonarApi.get("/overview");
    return response.data;
};
