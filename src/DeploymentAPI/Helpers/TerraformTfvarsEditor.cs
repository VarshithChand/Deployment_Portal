using System.Text.RegularExpressions;

namespace DeploymentAPI.Helpers;

// Textually inserts a new entry into an existing tfvars variable's value -
// the write-side counterpart to TerraformResourceExtractor's read-only
// scanning (a deliberately separate, simpler pass rather than reusing its
// internals - editing text correctly is a different risk than only reading
// it, and this only ever needs to find ONE specific, already-known
// top-level variable name, never enumerate every assignment in the file).
// Always inserts right after the value's own opening bracket, on its own
// new line - HCL doesn't require a trailing comma on newline-separated
// entries, so this never has to reason about whether the LAST existing
// entry already has one.
public static class TerraformTfvarsEditor
{
    // A top-level tfvars assignment ("name = ..." or "\"name\" = ..."),
    // same shape TerraformResourceExtractor's own scanning uses - top-level
    // tfvars variables are, in practice, always their own line (unlike a
    // map's inner entries, which real files do sometimes comma-separate),
    // so a plain ^-anchored match is enough here.
    private static readonly Regex AssignmentPattern = new(
        @"^[ \t]*""?([A-Za-z_][A-Za-z0-9_-]*)""?[ \t]*=[ \t]*", RegexOptions.Compiled | RegexOptions.Multiline);

    public static (bool Success, string? Error, string? UpdatedContent) InsertEntry(
        string tfvarsContent, string variableName, string entryText)
    {
        var valueStart = FindVariableValueStart(tfvarsContent, variableName);

        if (valueStart == null)
            return (false, $"Variable \"{variableName}\" wasn't found in this file.", null);

        if (valueStart.Value >= tfvarsContent.Length)
            return (false, $"\"{variableName}\" has no value to add to.", null);

        var openBracket = tfvarsContent[valueStart.Value];

        if (openBracket != '{' && openBracket != '[')
            return (false, $"\"{variableName}\" isn't a map or list this app can edit.", null);

        var insertAt = valueStart.Value + 1;
        var updated = tfvarsContent[..insertAt] + "\n  " + entryText + tfvarsContent[insertAt..];

        return (true, null, updated);
    }

    private static int? FindVariableValueStart(string text, string variableName)
    {
        foreach (Match m in AssignmentPattern.Matches(text))
        {
            if (m.Groups[1].Value != variableName) continue;

            return m.Index + m.Length;
        }

        return null;
    }
}
