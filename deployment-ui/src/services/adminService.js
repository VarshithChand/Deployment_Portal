import api from "../api/adminApi";

// Real PAT users (same data Settings > Sidebar Access shows) - see
// AdminUsersController for why there's no create/update here.
export const getUsers = async () => await api.get("/users");

// Ends that one session immediately - see GlobalLogoutMonitor's
// mySessionForceLogoutEpoch handling for how it takes effect.
export const forceLogoutUser = async (key) => await api.post(`/users/${encodeURIComponent(key)}/logout`);

// Rejected outright on every request from then on, even with a still-
// valid token - see the block-check middleware in Program.cs.
export const blockUser = async (key) => await api.post(`/users/${encodeURIComponent(key)}/block`);

export const unblockUser = async (key) => await api.post(`/users/${encodeURIComponent(key)}/unblock`);

// Real delete, not the soft sign-out above - removes every credential
// and restriction tied to this key. Irreversible.
export const deleteUser = async (key) => await api.delete(`/users/${encodeURIComponent(key)}`);

// Recovers an account whose authenticator device is lost - a full MFA
// removal for that PAT's resolved GitHub login (not just this row's
// session), same effect as the user disabling it themselves. They must
// fully re-enroll afterward.
export const resetUserMfa = async (key) => await api.post(`/users/${encodeURIComponent(key)}/reset-mfa`);

// Issues a single-use recovery code for a user locked out of their
// authenticator device, without fully resetting their enrollment - the
// caller relays the returned code (response.data.code) to that person
// out-of-band. Super-admin-only server-side (AdminGate.
// DenyUnlessSuperAdminAsync) - a step up from the general-admin-gated
// reset above. 400s if that user hasn't enabled MFA at all yet.
export const generateMfaRecoveryCode = async (key) =>
    await api.post(`/users/${encodeURIComponent(key)}/mfa/recovery-code`);

// Flags this user as required to set up MFA - doesn't enroll them (only
// their own phone can scan a QR code), just makes MfaEnforcementGate's
// nudge mandatory for them next time they load the app, same escalation
// an AWS/Azure/GCP credential already triggers on its own.
export const requireUserMfa = async (key) =>
    await api.post(`/users/${encodeURIComponent(key)}/mfa/require`);

// Lifts a requirement set by requireUserMfa above - never disables MFA
// that's already enabled, only stops the nudge from being mandatory for
// someone who hasn't enrolled yet.
export const unrequireUserMfa = async (key) =>
    await api.post(`/users/${encodeURIComponent(key)}/mfa/unrequire`);

// Merges rows that resolve to the same real GitHub account, keeping
// whichever was active most recently - a one-time cleanup for rows that
// predate the one-session-per-PAT check saving now enforces.
export const removeDuplicateUsers = async () => await api.post("/users/dedupe");

// Full export/import of this portal's own persisted state - see
// BackupController/SettingsService.ExportBackupAsync's own comments for
// why the response is exactly as sensitive as every stored credential in
// plaintext (it carries both the encrypted settings AND the only key
// ring that can decrypt them). Never logged, never cached - the caller
// is responsible for what happens to it once it leaves this response.
//
// Export is now a two-step, OTP-gated flow (OtpPurpose.BackupExport) -
// sendExportOtp emails a code to the caller's own address, exportBackup
// then requires it. Mirrors the login-mfa/send-otp + verify pair this app
// already uses elsewhere, not a new pattern.
export const sendExportOtp = async () => await api.post("/backup/export/otp");

export const exportBackup = async (otp) => await api.post("/backup/export", { otp });

export const importBackup = async (backup) => await api.post("/backup/import", backup);

// Admin Access's "Delete All Data" - wipes portal_settings back to empty
// after emailing a full safety-net backup to the caller first (see
// BackupController.Wipe). confirmPhrase must be exactly "DELETE ALL DATA",
// checked server-side too, not just this dialog's own typed-confirmation UI.
export const wipeDatabase = async (confirmPhrase) => await api.post("/backup/wipe", { confirmPhrase });
