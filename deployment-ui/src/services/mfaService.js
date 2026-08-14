import mfaApi from "../api/mfaApi";

// Self-service MFA for the currently connected session's own GitHub
// identity (see MfaController) - separate from the login-time gate
// (saveMyGitHubSettings, settingsService.js, gains an optional mfaCode/
// recoveryCode when reconnecting an MFA-enabled login).
export const getMfaStatus = async () => {
    const response = await mfaApi.get("/status");
    return response.data;
};

export const enrollMfa = async () => {
    const response = await mfaApi.post("/enroll");
    return response.data;
};

export const verifyMfaEnrollment = async (code) => {
    const response = await mfaApi.post("/enroll/verify", { code });
    return response.data;
};

// payload is { code } or { recoveryCode } - exactly one, matching
// MfaCodeRequestDto on the backend.
export const disableMfa = async (payload) => {
    const response = await mfaApi.post("/disable", payload);
    return response.data;
};

// Where MfaLockoutPolicy sends the "too many wrong codes" notice (see
// NotificationService.SendMfaLockoutEmailAsync) - self-service, only
// meaningful once MFA is enabled (the backend rejects setting one
// otherwise).
export const getMfaNotificationEmail = async () => {
    const response = await mfaApi.get("/notification-email");
    return response.data;
};

export const setMfaNotificationEmail = async (email) => {
    const response = await mfaApi.post("/notification-email", { email });
    return response.data;
};
