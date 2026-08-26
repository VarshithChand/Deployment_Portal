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
    public record Result(bool Show, bool Mandatory, int SkipsUsed, bool Blocked);

    public static async Task<Result> EvaluateAsync(SettingsService settings, string userId)
    {
        var githubCreds = await settings.GetUserGitHubCredentialsAsync(userId);

        // TokenConfigured, not IsConfigured - see BootstrapController's own
        // long-standing comment on this exact distinction (Round 27: using
        // IsConfigured meant the whole nudge/mandatory/block system never
        // activated until a repo was also picked from the Dashboard).
        if (!githubCreds.TokenConfigured)
            return new Result(false, false, 0, false);

        var mfaEnabled = await settings.IsMfaEnabledAsync(userId);
        var show = !mfaEnabled;

        if (!show)
            return new Result(false, false, 0, false);

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

        return new Result(show, mandatory, skipsUsed, mandatory && skipsUsed >= 2);
    }
}
