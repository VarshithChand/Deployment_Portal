import api from "../api/aiApi";

// The frontend still displays the full visible transcript locally (see
// DeploymentCopilot.jsx) but only ever sends the NEW message plus the
// prior turn's interactionId - Gemini's Interactions API resolves the
// actual conversation history server-side from that ID (see
// GeminiService), so there's nothing to resend. previousInteractionId is
// null/undefined for the first message in a conversation.
export const sendCopilotMessage = async (message, previousInteractionId, context) => {
    const response = await api.post("/chat", { message, previousInteractionId, context });
    return response.data;
};
