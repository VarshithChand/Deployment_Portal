import authApi from "../api/authApi";

// The two-page PAT + MFA login flow (PatLoginPage/MfaVerifyPage) - see
// AuthController's pat-login/mfa/* actions. Separate from
// settingsService.js's saveMyGitHubSettings/previewGitHubToken, which
// back the ALREADY-authenticated Settings > Credentials > GitHub
// reconnect flow, a different use case with different semantics.
export const patLogin = async (personalAccessToken) => {
    const response = await authApi.post("/pat-login", { personalAccessToken });
    return response.data;
};

export const getMfaPendingStatus = async () => {
    const response = await authApi.get("/mfa/pending");
    return response.data;
};

// payload is { code } or { recoveryCode }.
export const verifyLoginMfa = async (payload) => {
    const response = await authApi.post("/mfa/verify", payload);
    return response.data;
};

export const cancelLoginMfa = async () => {
    const response = await authApi.post("/mfa/cancel");
    return response.data;
};
