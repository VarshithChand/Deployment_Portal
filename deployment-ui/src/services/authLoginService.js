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

// payload is { code, recoveryCode, isEmailOtp } - isEmailOtp true when code
// came from sendMfaEmailOtp below rather than an authenticator app.
export const verifyLoginMfa = async (payload) => {
    const response = await authApi.post("/login-mfa/verify", payload);
    if (response.data?.token) setAuthToken(response.data.token);
    return response.data;
};

export const cancelLoginMfa = async () => {
    const response = await authApi.post("/login-mfa/cancel");
    return response.data;
};

// The MFA challenge screen's alternate "Send OTP to Email" option -
// requires an already-pending login (see AccountAuthController.
// SendMfaOtp), so there's no email argument here; the backend already
// knows who this is for. Unlike requestPasswordReset below, failure here
// IS distinguishable (cooldown/rate-limit/send failure) since there's no
// enumeration concern - this session already proved a password.
export const sendMfaEmailOtp = async () => {
    const response = await authApi.post("/login-mfa/send-otp");
    return response.data;
};

// Always resolves the same shape whether or not the email actually has an
// account with a password to reset - see AccountAuthController.
// ForgotPassword. There's no failure branch to handle here on purpose.
export const requestPasswordReset = async (email) => {
    const response = await authApi.post("/forgot-password", { email });
    return response.data;
};

// Step 2 of the OTP-based reset flow - on success returns a short-lived
// resetToken (NOT the OTP itself, which is already fully consumed) for
// the frontend to hold and submit with resetPassword below.
export const verifyPasswordResetOtp = async (email, otp) => {
    const response = await authApi.post("/forgot-password/verify", { email, otp });
    return response.data;
};

// token comes from verifyPasswordResetOtp's response, held in the
// component's own state (not a URL param anymore - see
// LoginSignupPage.jsx). Same response shape as signup/login (routes
// through the same FinishPrimaryFactorAsync tail server-side) -
// mfaRequired/token/success all mean the same thing here as they do there.
export const resetPassword = async (token, newPassword) => {
    const response = await authApi.post("/reset-password", { token, newPassword });
    if (response.data?.token) setAuthToken(response.data.token);
    return response.data;
};

// Backs Settings > Credentials > Account's "Set Password" section - see
// AccountAuthController.GetAccount/SetPassword. Both require an existing
// authenticated session (unlike everything else in this file, which runs
// BEFORE one exists), so authApi's own token/cookie handling covers them
// the same way any other post-login settings call already works.
export const getMyAccount = async () => {
    const response = await authApi.get("/account");
    return response.data;
};

// Only succeeds for an account with no password yet (Google/GitHub-only) -
// see AccountAuthService.SetPasswordAsync. Doesn't touch the current
// session/token at all - adding a password doesn't change who's logged in
// or how, just adds a second way to log in as them next time.
export const setPassword = async (newPassword) => {
    const response = await authApi.post("/set-password", { newPassword });
    return response.data;
};

// Backs Settings > Account's Profile "Edit Profile" save - each field left
// undefined/null keeps its current value server-side (see
// AccountAuthController.UpdateProfile).
export const updateMyProfile = async ({ displayName, username, phoneNumber }) => {
    const response = await authApi.put("/account", { displayName, username, phoneNumber });
    return response.data;
};

// base64 is already client-resized (<=256px, see AccountView.jsx's canvas
// step) - no data: prefix, just the raw base64 payload.
export const uploadMyAvatar = async (base64) => {
    const response = await authApi.post("/account/avatar", { base64 });
    return response.data;
};

export const removeMyAvatar = async () => {
    const response = await authApi.delete("/account/avatar");
    return response.data;
};

// Unlike setPassword above, this is for an account that ALREADY has one -
// see AccountAuthService.ChangePasswordAsync, which re-verifies
// currentPassword before replacing it.
export const changeMyPassword = async (currentPassword, newPassword) => {
    const response = await authApi.post("/change-password", { currentPassword, newPassword });
    return response.data;
};

// Settings > Account's Active Sessions list - see AccountAuthController.
// GetSessions, which flags the request's own jti as isCurrent.
export const getMySessions = async () => {
    const response = await authApi.get("/sessions");
    return response.data;
};

// "Sign out this device" - see SettingsService.RevokeSessionAsync/
// Program.cs's OnTokenValidated, which is what makes this take effect on
// that device's very next request.
export const revokeMySession = async (jti) => {
    const response = await authApi.post(`/sessions/${encodeURIComponent(jti)}/revoke`);
    return response.data;
};

export const getMyLoginHistory = async () => {
    const response = await authApi.get("/login-history");
    return response.data;
};

// Settings > Account's Danger Zone "Delete Account" - exactly one of
// currentPassword/confirmPhrase is actually checked server-side depending
// on whether the account has a password (see AccountAuthController.
// DeleteAccount).
export const deleteMyAccount = async ({ currentPassword, confirmPhrase }) => {
    const response = await authApi.delete("/account", { data: { currentPassword, confirmPhrase } });
    return response.data;
};
