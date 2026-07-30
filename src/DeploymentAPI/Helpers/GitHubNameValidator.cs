using System.Text.RegularExpressions;

namespace DeploymentAPI.Helpers;

// GitHub owner/repository names end up interpolated into dozens of
// api.github.com URL paths across GitHubApiService/DeploymentService, most
// of that data outliving any single request (saved settings, not a
// one-off request parameter) - too many call sites to reliably escape one
// by one and keep escaped forever as the file grows. Validating the shape
// at every point one of these values is ever SAVED closes all of them at
// once: a value that never contains "/", "..", or other URL-path-breaking
// characters can't redirect a request built from it onto an unintended
// API path no matter how many places it's later used unescaped.
public static class GitHubNameValidator
{
    // GitHub's real rules (alphanumeric, hyphens, underscores, periods -
    // never "/") are more permissive on repository names than this
    // requires; this is intentionally a safe subset rather than an exact
    // match; genuine GitHub names always satisfy it.
    private static readonly Regex Pattern = new(@"^[A-Za-z0-9._-]{1,100}$", RegexOptions.Compiled, TimeSpan.FromMilliseconds(500));

    public static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value) && Pattern.IsMatch(value);

    // For a repo-relative file path (e.g. ".github/workflows/deploy.yml"),
    // not a single name — Pattern alone isn't enough here since "." and ".."
    // both satisfy it on their own, and either one as a whole path segment
    // is exactly what lets a crafted path traverse outside the intended
    // /contents/ prefix once .NET's Uri collapses "/../" per RFC 3986.
    public static bool IsValidRepoPath(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.StartsWith('/') || value.EndsWith('/'))
            return false;

        foreach (var segment in value.Split('/'))
        {
            if (segment == "." || segment == ".." || !Pattern.IsMatch(segment))
                return false;
        }

        return true;
    }
}
