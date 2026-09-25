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

    // Directory-segment names (no extension requirement) - same character
    // class as a leaf filename minus the ".tf" requirement.
    private static readonly Regex ValidPathSegmentPattern = new(
        @"^[A-Za-z0-9._-]+$", RegexOptions.Compiled);

    // A second, deliberately separate validator - ONLY for the personal
    // Terraform page's file storage (see SettingsService's
    // UploadUserTerraformFilesAsync), which preserves folder structure so
    // local module references (source = "./modules/x") keep resolving when
    // real terraform execution writes these files back out to disk.
    // ValidateFileName above stays exactly as it was (flat-only) for the
    // org-scoped TerraformFileService, which has its own existing tests
    // asserting "sub/dir/main.tf" is rejected - this is a genuinely
    // separate invariant, not a relaxation of that one.
    public static (bool Valid, string? Error, string? Normalized) ValidateRelativePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return (false, "A file path is required.", null);

        var trimmed = path.Trim().Replace('\\', '/');

        if (trimmed.Length > 300)
            return (false, "File path is too long.", null);

        if (trimmed.StartsWith('/') || trimmed.EndsWith('/'))
            return (false, "File path can't start or end with a slash.", null);

        var segments = trimmed.Split('/');

        if (segments.Length > 12)
            return (false, "File path is nested too deeply.", null);

        for (var i = 0; i < segments.Length; i++)
        {
            var segment = segments[i];
            var isLast = i == segments.Length - 1;

            if (segment.Length == 0 || segment == "." || segment == "..")
                return (false, "File path contains an invalid segment.", null);

            if (isLast)
            {
                if (!ValidFileNamePattern.IsMatch(segment))
                    return (false, "The file itself must contain only letters, numbers, dots, dashes, or underscores, and end in .tf or .tf.json.", null);
            }
            else if (!ValidPathSegmentPattern.IsMatch(segment))
            {
                return (false, "Folder names must contain only letters, numbers, dots, dashes, or underscores.", null);
            }
        }

        return (true, null, trimmed);
    }
}
