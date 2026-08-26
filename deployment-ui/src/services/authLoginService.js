import authApi from "../api/authApi";
import { setAuthToken } from "../api/apiBase";

// The login/signup + MFA flow (LoginSignupPage/MfaVerifyPage) - see
// AccountAuthController's signup/login/login-mfa/* actions (and
// AuthController.Callback/GoogleAuthController.Callback, which route
// through this exact same MFA-pending mechanism for the GitHub/Google
// buttons on the same page). Separate from settingsService.js's
// saveMyGitHubSettings/previewGitHubToken, which back the ALREADY-
// authenticated Settings > Credentials > GitHub reconnect flow, a
// different use case with different semantics.
export const signUp = async (email, password, displayName) => {
    const response = await authApi.post("/signup", { email, password, displayName });
    if (response.data?.token) setAuthToken(response.data.token);
    return response.data;
};

export const logIn = async (email, password) => {
    const response = await authApi.post("/login", { email, password });
    if (response.data?.token) setAuthToken(response.data.token);
    return response.data;
};

export const getMfaPendingStatus = async () => {
    const response = await authApi.get("/login-mfa/pending");
    return response.data;
};

// payload is { code } or { recoveryCode }.
export const verifyLoginMfa = async (payload) => {
    const response = await authApi.post("/login-mfa/verify", payload);
    if (response.data?.token) setAuthToken(response.data.token);
    return response.data;
};

export const cancelLoginMfa = async () => {
    const response = await authApi.post("/login-mfa/cancel");
    return response.data;
};
