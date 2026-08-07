import environmentsApi from "../api/environmentsApi";

export const getEnvironments = async () => {

    try {

        const response = await environmentsApi.get("/");
        return response.data;

    }
    catch (error) {

        console.error("Unable to fetch environments:", error);
        return [];

    }

};

export const saveEnvironments = async (environments) => {
    const response = await environmentsApi.post("/", { environments });
    return response.data;
};

export const getEnvironmentDetail = async (name) => {

    try {

        const response = await environmentsApi.get(`/${encodeURIComponent(name)}`);
        return response.data;

    }
    catch (error) {

        console.error("Unable to fetch environment detail:", error);
        return null;

    }

};

export const getEnvironmentCloudStatus = async (name) => {

    try {

        const response = await environmentsApi.get(`/${encodeURIComponent(name)}/cloud-status`);
        return response.data;

    }
    catch (error) {

        console.error("Unable to fetch environment cloud status:", error);
        return null;

    }

};

// Reads the CD workflow's actual YAML to find its real AWS/Azure
// deployment target, instead of requiring it typed in by hand.
export const detectDeploymentTarget = async (workflowName) => {
    const response = await environmentsApi.get("/detect-target", { params: { workflowName } });
    return response.data;
};
