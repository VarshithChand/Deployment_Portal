namespace DeploymentAPI.Helpers;

// Shared secret-redaction logic - originally built inline in
// CloudServiceManagementService.cs for ECS container environment
// variables/logs, promoted here so Elastic Beanstalk (and later Azure
// App Service) reuse the exact same check instead of a third copy.
// Best-effort pattern matching, not exhaustive - stated plainly, same
// posture as every other "can't be perfectly certain" piece in this app.
public static class SecretRedaction
{
    private static readonly HashSet<string> SecretKeyMarkers = new(StringComparer.OrdinalIgnoreCase)
    {
        "SECRET", "PASSWORD", "PASSWD", "PWD", "TOKEN", "KEY", "CREDENTIAL", "CONNSTR", "CONNECTIONSTRING"
    };

    public static bool LooksLikeSecretKey(string key) =>
        SecretKeyMarkers.Any(marker => key.Contains(marker, StringComparison.OrdinalIgnoreCase));

    private static readonly System.Text.RegularExpressions.Regex[] SecretLinePatterns =
    {
        new(@"AKIA[0-9A-Z]{16}", System.Text.RegularExpressions.RegexOptions.Compiled),
        new(@"(?i)(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+", System.Text.RegularExpressions.RegexOptions.Compiled)
    };

    public static string RedactLogLine(string line)
    {
        foreach (var pattern in SecretLinePatterns)
            line = pattern.Replace(line, "***redacted***");

        return line;
    }
}
