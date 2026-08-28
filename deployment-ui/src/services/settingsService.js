import settingsApi from "../api/settingsApi";

export const getSettings = async () => {
    const response = await settingsApi.get("/");
    return response.data;
};

// Every logged-in user has their own GitHub repo + token — not shared
// portal-wide settings like the rest of this file.
export const getMyGitHubSettings = async () => {
    const response = await settingsApi.get("/me/github");
    return response.data;
};

export const saveMyGitHubSettings = async (payload) => {
    const response = await settingsApi.post("/me/github", payload);
    return response.data;
};

export const clearMyGitHubToken = async () => {
    const response = await settingsApi.delete("/me/github");
    return response.data;
};

// Soft sign-out (see SoftSignOutPatUserAsync) - the token/repo/AWS/Azure/
// GCP credentials are left exactly as they are, only marked "not
// connected." Typing the same token back in undoes it. Distinct from
// clearMySettings()/clearSettings("all") below, which actually delete data.
export const signOutMyGitHub = async () => {
    const response = await settingsApi.post("/me/github/signout");
    return response.data;
};

// "Skip" on MfaEnforcementGate's nudge - see BootstrapController's
// MfaNudge block for how the returned count feeds back into whether the
// nudge escalates to a full-screen block.
export const skipMfaNudge = async () => {
    const response = await settingsApi.post("/me/mfa/skip-nudge");
    return response.data;
};

// Read-only confirmation of whose token is actually configured — a real
// GitHub API call, so this is only fetched when actually shown (right
// after connecting), not on every page load the way getMyGitHubSettings is.
export const getMyGitHubUsername = async () => {

    try {

        const response = await settingsApi.get("/me/github/username");
        return response.data.username;

    }
    catch (error) {

        console.error("Unable to fetch GitHub username:", error);
        return null;

    }

};

// Step 1 of RequireGitHubSetup's "Connect your repository" flow — previews
// a token before it's saved anywhere, returning whose it is and every repo
// it can see, so step 2 can offer "pick a repo" instead of requiring an
// exact URL already known.
export const previewGitHubToken = async (personalAccessToken) => {
    const response = await settingsApi.post("/me/github/preview", { personalAccessToken });
    return response.data;
};

// Session-scoped AWS/Azure credentials for the Environments detail view's
// live cloud lookups — same per-visitor isolation as GitHub above.
export const getMyAwsSettings = async () => {
    const response = await settingsApi.get("/me/aws");
    return response.data;
};

export const saveMyAwsSettings = async (payload) => {
    const response = await settingsApi.post("/me/aws", payload);
    return response.data;
};

export const clearMyAwsCredentials = async () => {
    const response = await settingsApi.delete("/me/aws");
    return response.data;
};

// Dashboard's "AWS Services" container — EC2/VPC/S3/Lambda/Route53/SNS
// across the whole account these credentials can see, not just the one
// cluster/service an Environment happens to be wired to (that narrower
// view is getEnvironmentCloudStatus, in environmentsService.js).
//
// `region` is an optional per-request override (see CloudStatusService on
// the backend, which already falls back to the saved credential's own
// region whenever this is omitted) — lets Cloud Services / this card look
// at a different region without re-saving the AWS credential itself.
export const getMyAwsResources = async (region) => {
    const response = await settingsApi.get("/me/aws/resources", { params: region ? { region } : undefined });
    return response.data;
};

// Cloud Services page's per-service detail click-through — richer than
// getMyAwsResources above (running vs. stopped instance/task counts),
// so each is its own call rather than folded into the account-wide scan.
export const getMyAwsEc2Detail = async (region) => {
    const response = await settingsApi.get("/me/aws/ec2-detail", { params: region ? { region } : undefined });
    return response.data;
};

export const getMyAwsEcsDetail = async (region) => {
    const response = await settingsApi.get("/me/aws/ecs-detail", { params: region ? { region } : undefined });
    return response.data;
};

export const getMyAzureSettings = async () => {
    const response = await settingsApi.get("/me/azure");
    return response.data;
};

export const saveMyAzureSettings = async (payload) => {
    const response = await settingsApi.post("/me/azure", payload);
    return response.data;
};

export const clearMyAzureCredentials = async () => {
    const response = await settingsApi.delete("/me/azure");
    return response.data;
};

// Cloud Services page's Azure sub-page - the Azure equivalent of
// getMyAwsResources above. No region param - ARM's own generic resource
// list is already subscription-wide (see the backend's
// GetAzureResourceInventoryAsync).
export const getMyAzureResources = async () => {
    const response = await settingsApi.get("/me/azure/resources");
    return response.data;
};

// Same per-visitor isolation, for GCP — stored for future use, no feature
// in this portal reads it yet.
export const getMyGcpSettings = async () => {
    const response = await settingsApi.get("/me/gcp");
    return response.data;
};

export const saveMyGcpSettings = async (payload) => {
    const response = await settingsApi.post("/me/gcp", payload);
    return response.data;
};

export const clearMyGcpCredentials = async () => {
    const response = await settingsApi.delete("/me/gcp");
    return response.data;
};

// Screen-lock PIN — self-service, session-scoped like GitHub/AWS/Azure/GCP
// above. Backs PeriodicSignOutMonitor's lock screen (see PinLockScreen).
export const getMyPinStatus = async () => {
    const response = await settingsApi.get("/me/pin");
    return response.data;
};

// code is only actually required when this session's GitHub identity has
// MFA enabled (see MfaGate.DenyUnlessCodeVerifiedAsync on the backend) -
// omit it on the first attempt; a 403 with code "MFA_REQUIRED" means try
// again with one. No recovery-code fallback here by design - see
// SecurityPinSection.jsx.
export const saveMyPin = async (pin, code) => {
    const response = await settingsApi.post("/me/pin", { pin, code });
    return response.data;
};

export const clearMyPin = async (code) => {
    const response = await settingsApi.delete("/me/pin", { data: { code } });
    return response.data;
};

export const verifyMyPin = async (pin) => {
    const response = await settingsApi.post("/me/pin/verify", { pin });
    return response.data;
};

// Per-credential unlock (see CredentialPinGate) — verifying the SAME
// screen-lock PIN here grants a short-lived pass to manage exactly one
// provider's credential (github/aws/azure/gcp/apikey/sonar/docker/
// github-oauth/ai), not the whole portal. { valid, locked } — a `valid:
// true` response with no PIN configured at all is the normal, expected
// no-op case (see UnlockMyCredential on the backend).
export const unlockMyCredential = async (provider, pin) => {
    const response = await settingsApi.post(`/me/credentials/${provider}/unlock`, { pin });
    return response.data;
};

export const saveDockerSettings = async (payload) => {
    const response = await settingsApi.post("/docker", payload);
    return response.data;
};

export const saveGitHubOAuthSettings = async (payload) => {
    const response = await settingsApi.post("/github-oauth", payload);
    return response.data;
};

export const saveAdminUsernames = async (payload) => {
    const response = await settingsApi.post("/admins", payload);
    return response.data;
};

// Email equivalent of saveAdminUsernames above - the actual source of
// truth for Admin/Viewer role going forward, since it's the one
// identifier every login method (email/password, Google, GitHub) can
// resolve (see AccountAuthService.ResolveRoleSync/AuthService.
// ExchangeCodeForUserAsync). viewerEmails is always sent empty - nothing
// in this app currently reads that list back (every non-admin login
// already gets Viewer by default), so there's no UI for it to manage.
export const saveAdminEmails = async (adminEmails) => {
    const response = await settingsApi.post("/admin-emails", { adminEmails, viewerEmails: [] });
    return response.data;
};

// Suspends/unsuspends one admin in place (stays on the allowlist, just
// treated as a Viewer until unsuspended) - distinct from re-saving the
// allowlist without them, which is what Remove does instead.
export const suspendAdmin = async (username) => {
    const response = await settingsApi.post(`/admins/${encodeURIComponent(username)}/suspend`);
    return response.data;
};

export const unsuspendAdmin = async (username) => {
    const response = await settingsApi.post(`/admins/${encodeURIComponent(username)}/unsuspend`);
    return response.data;
};

// SonarQube/SonarCloud saves live on sonarService.js now (api/sonar/
// {provider}) - each an independent credential since the split.

// Deployment Copilot's Gemini API key/model - the saved settings view
// (getSettings) never echoes the key back, only aiApiKeyConfigured/aiModel.
export const saveAiSettings = async (payload) => {
    const response = await settingsApi.post("/ai", payload);
    return response.data;
};

// Tests whatever's currently SAVED (see SettingsController.TestAi) - not
// anything unsaved sitting in the form, since the backend never accepts an
// API key over this endpoint.
export const testAiConnection = async () => {
    const response = await settingsApi.post("/ai/test");
    return response.data;
};

// Resend login-notification email - same shared/admin-only shape as AI
// Assistant above. The saved settings view never echoes the API key back,
// only notificationsApiKeyConfigured/notificationsFromEmail/notificationsFromName.
export const saveNotificationSettings = async (payload) => {
    const response = await settingsApi.post("/notifications", payload);
    return response.data;
};

// Sends a real test email to whatever address is passed in, using whatever
// Resend config is currently SAVED (see SettingsController.TestNotifications)
// - not anything unsaved sitting in the form.
export const testNotificationEmail = async (toEmail) => {
    const response = await settingsApi.post("/notifications/test", { toEmail });
    return response.data;
};

export const clearSettings = async (section) => {
    const response = await settingsApi.delete(`/${section}`);
    return response.data;
};

// "Clear All Data" for a non-admin — resets only the caller's own
// GitHub/AWS/Azure/GCP credentials, no admin required. The shared,
// portal-wide sections (Docker/OAuth/Sonar) are what clearSettings("all")
// additionally wipes, which stays admin-only.
export const clearMySettings = async () => {
    const response = await settingsApi.delete("/me/all");
    return response.data;
};

// The caller's own restrictions — used by Sidebar/App's route guard, safe
// for anyone to read since it can only ever resolve to their own session.
export const getSidebarAccess = async () => {
    const response = await settingsApi.get("/sidebar");
    return response.data;
};

// Admin-only: every PAT user the admin can pick from in Settings > Sidebar
// Access, then that one user's own restrictions to load into the editor.
export const getPatUsers = async () => {
    const response = await settingsApi.get("/sidebar/users");
    return response.data;
};

export const getUserSidebarAccess = async (key) => {
    const response = await settingsApi.get("/sidebar/user", { params: { key } });
    return response.data;
};

export const saveUserSidebarAccess = async (key, states) => {
    const response = await settingsApi.post("/sidebar/user", { states }, { params: { key } });
    return response.data;
};

export const clearUserSidebarAccess = async (key) => {
    const response = await settingsApi.delete("/sidebar/user", { params: { key } });
    return response.data;
};

export const previewGitHubRepository = async (owner, repository) => {
    const response = await settingsApi.get("/github/preview", {
        params: { owner, repository }
    });
    return response.data;
};

export const previewGitHubUserRepositories = async (username) => {
    const response = await settingsApi.get("/github/preview-user", {
        params: { username }
    });
    return response.data;
};

// Scoped admin access — a GitHub login granted admin authority for just one
// page (see AdminGate's pageKey param / SettingsService.PageAdminGrants)
// instead of the full allowlist. Full-admin only to manage, same as the
// allowlist itself.
export const getPageAdminGrants = async () => {
    const response = await settingsApi.get("/page-admin-grants");
    return response.data;
};

export const grantPageAdmin = async (pageKey, login) => {
    const response = await settingsApi.post(`/page-admin-grants/${pageKey}`, { login });
    return response.data;
};

export const revokePageAdmin = async (pageKey, login) => {
    const response = await settingsApi.delete(`/page-admin-grants/${pageKey}/${encodeURIComponent(login)}`);
    return response.data;
};
