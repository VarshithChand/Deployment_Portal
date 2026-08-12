import api from "../api/aiApi";

// messages: [{ role: "user" | "model", content: string }, ...] - the
// frontend holds the full visible transcript (see DeploymentCopilot.jsx)
// and sends it back each turn; the backend keeps no chat history of its
// own (section 8/23 of the Deployment Copilot spec).
export const sendCopilotMessage = async (messages, context) => {
    const response = await api.post("/chat", { messages, context });
    return response.data;
};
