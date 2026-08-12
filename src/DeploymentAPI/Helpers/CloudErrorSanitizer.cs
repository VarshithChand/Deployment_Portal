using Amazon.Runtime;

namespace DeploymentAPI.Helpers;

// Every AWS/Azure lookup in CloudStatusService, CloudServiceManagementService,
// and AwsSsoService runs against whatever credentials the calling user typed
// into their own session (see UserAwsCredentials/UserAzureCredentials in
// SettingsService) - a wrong key, an over-scoped IAM policy, or a stale MFA
// session all surface as real provider SDK exceptions. The SDK's own
// exception text is often useful (which is exactly why it used to be echoed
// back verbatim) but can also carry an IAM ARN, an AWS account ID, a resource
// ID, or a raw request ID - infrastructure detail that shouldn't leave the
// server even back to the account's own owner. This maps known AWS error
// codes to an equally useful but identifier-free message, and always logs
// the original exception to stderr (which Render's own log aggregation
// captures - see Program.cs's bootstrap-mode warning for the same pattern)
// so a real investigation can still see exactly what the provider said.
public static class CloudErrorSanitizer
{
    public static string Describe(Exception ex, string provider, string context)
    {
        Console.Error.WriteLine($"[{provider}:{context}] {ex}");

        if (ex is AmazonServiceException aws)
        {
            return aws.ErrorCode switch
            {
                "AccessDenied" or "AccessDeniedException" or "UnauthorizedOperation" =>
                    $"Access denied - this {provider} credential doesn't have permission for that action.",
                "InvalidClientTokenId" or "SignatureDoesNotMatch" or "InvalidAccessKeyId" or "AuthFailure" =>
                    $"These {provider} credentials aren't valid.",
                "ExpiredToken" or "TokenRefreshRequired" or "RequestExpired" =>
                    $"This {provider} session has expired - please sign in again.",
                "Throttling" or "RequestLimitExceeded" =>
                    $"{provider} is rate-limiting these requests right now - try again shortly.",
                _ => $"Unable to reach {provider} for {context}."
            };
        }

        return $"Unable to reach {provider} for {context}.";
    }
}
