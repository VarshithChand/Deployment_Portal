using System.Text.RegularExpressions;

namespace DeploymentAPI.Helpers;

// Shared by TerraformFileService (org-scoped, Postgres-backed) and
// SettingsService's personal Terraform file storage (JSONB-blob-backed) -
// same flat-filename, no-traversal validation either way, so this lives in
// one place instead of being copy-pasted per storage backend.
public static class TerraformFileNaming
{
    // Plain filename only (no directories) - a flat per-owner list, not a
    // real filesystem tree. Letters/digits/dot/dash/underscore only, must
    // end in .tf or .tf.json (Terraform's own two recognized config
    // extensions) - rejects anything that looks like a path traversal
    // attempt (no '/', no '..') even though neither backend touches a real
    // filesystem, on the same "defend the invariant now, not only once
    // it's load-bearing" reasoning as everywhere else secrets/paths are
    // validated in this codebase.
    private static readonly Regex ValidFileNamePattern = new(
        @"^[A-Za-z0-9._-]+\.tf(\.json)?$", RegexOptions.Compiled);

    public static (bool Valid, string? Error) ValidateFileName(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return (false, "A file name is required.");

        var trimmed = fileName.Trim();

        if (trimmed.Length > 200)
            return (false, "File name is too long.");

        if (!ValidFileNamePattern.IsMatch(trimmed))
            return (false, "File name must contain only letters, numbers, dots, dashes, or underscores, and end in .tf or .tf.json.");

        return (true, null);
    }
}
