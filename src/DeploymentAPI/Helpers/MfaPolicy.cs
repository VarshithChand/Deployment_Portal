using DeploymentAPI.Services;

namespace DeploymentAPI.Helpers;

// Single source of truth for "is MFA mandatory / blocked for this session,"
// shared by BootstrapController (which reports it to the frontend so
// MfaEnforcementGate.jsx can render the nudge/block UI) and Program.cs's
// MFA-enforcement middleware (which actually stops the request server-side
// - see that middleware's own comment for why the UI-only gate wasn't
// enough by itself). Computing this in exactly one place means the two can
// never quietly drift apart the way "Bootstrap says blocked, but every
// other endpoint still answers 200" did before this existed.
//
// Takes one identifier now, not two - userId is both "whose credentials to
// check" and "whose Mfa[login] entry to check," now that every login
// method resolves to the same canonical account id (see RequireAuth). The
// two used to be resolved differently by each caller (BootstrapController
// via a live GitHubApiService.GetTokenOwnerAsync() call it already needed
// for the avatar/name display; the middleware via GitHubAuthService's
// cached PAT-owner lookup) precisely because a connected PAT's owner and
// "who is actually logged in" could genuinely differ - they can't anymore,
// so both callers now just pass the authenticated account's own id.
public static class MfaPolicy
{
    // MustSetUp - blocked because this account was just created (password
    // signup that just verified its email, or a first-time Google login)
    // and has never had a chance to enroll yet (see PortalUserAccount.
    // MustSetUpMfa). Unlike the other two reasons, this one blocks the
    // very first time Show is true - there's no 2-skip grace period, since
    // "finish registering" was never something to nudge and defer, only
    // to complete. MfaEnforcementGate.jsx reads this to show the right
    // copy (and no Skip button) instead of the cloud-credential/admin
    // wording used for the other two reasons.
    public enum BlockReason { None, MustSetUp, CloudCredential, AdminRequired }

    public record Result(bool Show, bool Mandatory, int SkipsUsed, bool Blocked, BlockReason Reason);

    public static async Task<Result> EvaluateAsync(SettingsService settings, string userId)
    {
        // No longer gated on a connected GitHub PAT (used to check
        // TokenConfigured here) - that made sense back when a PAT WAS the
        // login, so "no PAT connected" meant "not really using the app."
        // Login is a real account now, independent of any GitHub PAT (see
        // AccountAuthService) - most accounts never connect one at all,
        // which made this gate silently swallow the admin's "Require MFA"
        // flag (Services > Users) for every one of them, even though that
        // flag has nothing to do with GitHub. Evaluated purely off the
        // account's own state now.
        var mfaEnabled = await settings.IsMfaEnabledAsync(userId);
        var show = !mfaEnabled;

        if (!show)
            return new Result(false, false, 0, false, BlockReason.None);

        var mustSetUpMfa = await settings.MustSetUpMfaAsync(userId);

        if (mustSetUpMfa)
            return new Result(true, true, 0, true, BlockReason.MustSetUp);

        var mfaRequiredByAdmin = await settings.IsMfaRequiredByAdminAsync(userId);

        var awsCredsTask = settings.GetUserAwsCredentialsAsync(userId);
        var azureCredsTask = settings.GetUserAzureCredentialsAsync(userId);
        var gcpCredsTask = settings.GetUserGcpCredentialsAsync(userId);

        await Task.WhenAll(awsCredsTask, azureCredsTask, gcpCredsTask);

        var hasCloudCredential = awsCredsTask.Result.IsConfigured
            || azureCredsTask.Result.IsConfigured
            || gcpCredsTask.Result.IsConfigured;

        var mandatory = hasCloudCredential || mfaRequiredByAdmin;
        var skipsUsed = await settings.GetMfaNudgeSkipCountAsync(userId);
        var blocked = mandatory && skipsUsed >= 2;
        var reason = !blocked ? BlockReason.None : mfaRequiredByAdmin ? BlockReason.AdminRequired : BlockReason.CloudCredential;

        return new Result(show, mandatory, skipsUsed, blocked, reason);
    }
}
