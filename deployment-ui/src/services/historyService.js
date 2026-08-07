import historyApi from "../api/historyApi";

export const getWorkflowRuns = async () => {

    try {

        const response = await historyApi.get("/runs");

        return response.data;

    }
    catch (error) {

        console.error("Unable to fetch workflow runs:", error);

        return [];

    }

};

export const getRunById = async (runId) => {

    try {

        const response = await historyApi.get(`/run/${runId}`);

        return response.data;

    }
    catch (error) {

        console.error("Unable to fetch run status:", error);

        return null;

    }

};

export const getRunErrors = async (runId) => {

    try {

        const response = await historyApi.get(`/run/${runId}/errors`);

        return response.data;

    }
    catch (error) {

        console.error("Unable to fetch run errors:", error);

        return null;

    }

};

export const analyzeRunError = async (jobError) => {

    try {

        const response = await historyApi.post("/errors/analyze", {
            jobName: jobError.jobName,
            failedStep: jobError.failedStep,
            messages: jobError.messages || []
        });

        return response.data;

    }
    catch (error) {

        console.error("Unable to analyze run error:", error);

        return null;

    }

};