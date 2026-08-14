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
// resolvedLogin is passed in rather than resolved here because the two
// callers already have it two different ways: BootstrapController already
// paid for a live GitHubApiService.GetTokenOwnerAsync() call (it needs the
// rest of that DTO for the avatar/name display anyway), while the
// middleware only needs the identity for this check and reaches for
// GitHubAuthService.GetAuthenticatedLoginAsync() instead - cached for 60s
// per token, so a session sitting on the block screen doesn't burn a live
// GitHub call on every single request it makes while stuck there.
public static class MfaPolicy
{
    public record Result(bool Show, bool Mandatory, int SkipsUsed, bool Blocked);

    public static async Task<Result> EvaluateAsync(SettingsService settings, string sessionKey, string? resolvedLogin)
    {
        var githubCreds = await settings.GetUserGitHubCredentialsAsync(sessionKey);

        // TokenConfigured, not IsConfigured - see BootstrapController's own
        // long-standing comment on this exact distinction (Round 27: using
        // IsConfigured meant the whole nudge/mandatory/block system never
        // activated until a repo was also picked from the Dashboard).
        if (!githubCreds.TokenConfigured)
            return new Result(false, false, 0, false);

        var mfaEnabled = resolvedLogin != null && await settings.IsMfaEnabledAsync(resolvedLogin);
        var show = !mfaEnabled;

        if (!show)
            return new Result(false, false, 0, false);

        var mfaRequiredByAdmin = resolvedLogin != null && await settings.IsMfaRequiredByAdminAsync(resolvedLogin);

        var awsCredsTask = settings.GetUserAwsCredentialsAsync(sessionKey);
        var azureCredsTask = settings.GetUserAzureCredentialsAsync(sessionKey);
        var gcpCredsTask = settings.GetUserGcpCredentialsAsync(sessionKey);

        await Task.WhenAll(awsCredsTask, azureCredsTask, gcpCredsTask);

        var hasCloudCredential = awsCredsTask.Result.IsConfigured
            || azureCredsTask.Result.IsConfigured
            || gcpCredsTask.Result.IsConfigured;

        var mandatory = hasCloudCredential || mfaRequiredByAdmin;
        var skipsUsed = await settings.GetMfaNudgeSkipCountAsync(sessionKey);

        return new Result(show, mandatory, skipsUsed, mandatory && skipsUsed >= 2);
    }
}
