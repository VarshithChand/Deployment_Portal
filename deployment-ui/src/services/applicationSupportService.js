import api from "../api/applicationSupportApi";

// Every one of these hits api/admin/application-support/*, admin-gated
// server-side regardless of what the UI shows (see ApplicationSupportController).

export const getApplicationVersion = async () => {
    const response = await api.get("/version");
    return response.data;
};

export const getApplicationHealth = async () => {
    const response = await api.get("/health");
    return response.data;
};

export const getLatestDeployment = async () => {
    const response = await api.get("/latest-deployment");
    return response.data;
};

export const getUserVersions = async () => {
    const response = await api.get("/user-versions");
    return response.data;
};

// messages: [{ role: "user" | "model", content: string }, ...] - same
// shape/convention as Deployment Copilot's own aiService.sendCopilotMessage,
// just a different (narrower, admin-only) backend endpoint.
export const sendApplicationSupportMessage = async (messages, context) => {
    const response = await api.post("/chat", { messages, context });
    return response.data;
};
