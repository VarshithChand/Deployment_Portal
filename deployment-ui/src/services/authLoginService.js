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

// identifier is an email or a username - see AccountAuthController.Login's
// PasswordLoginRequestDto.EmailOrUsername, resolved server-side by
// whichever this looks like.
export const logIn = async (identifier, password) => {
    const response = await authApi.post("/login", { emailOrUsername: identifier, password });
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

// Always resolves the same shape whether or not the email actually has an
// account with a password to reset - see AccountAuthController.
// ForgotPassword. There's no failure branch to handle here on purpose.
export const requestPasswordReset = async (email) => {
    const response = await authApi.post("/forgot-password", { email });
    return response.data;
};

// token comes from the resetToken query param on the emailed link. Same
// response shape as signup/login (routes through the same
// FinishPrimaryFactorAsync tail server-side) - mfaRequired/token/success
// all mean the same thing here as they do there.
export const resetPassword = async (token, newPassword) => {
    const response = await authApi.post("/reset-password", { token, newPassword });
    if (response.data?.token) setAuthToken(response.data.token);
    return response.data;
};
