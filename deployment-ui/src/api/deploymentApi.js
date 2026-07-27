import { createApiClient } from "./apiBase";

const deploymentApi = createApiClient("/api/deployment", {
    headers: {
        "Content-Type": "application/json"
    }
});

export default deploymentApi;
