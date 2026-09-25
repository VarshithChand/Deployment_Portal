using System.Text.RegularExpressions;

namespace DeploymentAPI.Helpers;

// Edits an existing tfvars variable's value - the write-side counterpart
// to TerraformResourceExtractor's read-only scanning. InsertEntry is a
// deliberately self-contained, simple position-based splice (finding ONE
// specific, already-known variable name and inserting right after its
// opening bracket needs none of the extractor's own parsing machinery).
// RenameEntry instead REUSES the extractor's own already-hardened
// ParseTopLevelAssignments/SplitTopLevelElements (see its own comment for
// why) rather than re-implementing that same scanning a second time.
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

    // Renames one existing map key or list element within a variable's
    // value. Unlike InsertEntry (a pure position-based splice), this REUSES
    // TerraformResourceExtractor's own already-hardened top-level scanner
    // (ParseTopLevelAssignments/SplitTopLevelElements - the same one that
    // needed real fixes for quoted keys, comments, and comma-vs-newline
    // separators after testing against a real project's own tfvars) rather
    // than re-implementing that same scanning a second time here: parse the
    // variable's value into its individual entries, rename the matching
    // one, and rebuild the value's inner text from those entries. This
    // reformats that ONE variable's inner spacing to one-entry-per-line
    // (a deliberate, accepted trade-off - reformatting text you already
    // asked to edit is a small price for reusing tested parsing logic
    // instead of duplicating its own hard-won edge cases), but every
    // entry's own value text is preserved byte-for-byte from the original.
    public static (bool Success, string? Error, string? UpdatedContent) RenameEntry(
        string tfvarsContent, string variableName, string shape, string oldKey, string newKey)
    {
        var valueStart = FindVariableValueStart(tfvarsContent, variableName);

        if (valueStart == null)
            return (false, $"Variable \"{variableName}\" wasn't found in this file.", null);

        if (valueStart.Value >= tfvarsContent.Length)
            return (false, $"\"{variableName}\" has no value to rename within.", null);

        var openBracket = tfvarsContent[valueStart.Value];

        if (openBracket != '{' && openBracket != '[')
            return (false, $"\"{variableName}\" isn't a map or list this app can edit.", null);

        var valueEnd = FindMatchingBracket(tfvarsContent, valueStart.Value);

        if (valueEnd < 0)
            return (false, $"\"{variableName}\"'s value looks malformed.", null);

        var inner = tfvarsContent[(valueStart.Value + 1)..valueEnd];
        string rebuiltInner;

        if (shape == "Map")
        {
            var entries = TerraformResourceExtractor.ParseTopLevelAssignments(inner);

            if (!entries.ContainsKey(oldKey))
                return (false, $"\"{oldKey}\" wasn't found in \"{variableName}\".", null);

            if (newKey != oldKey && entries.ContainsKey(newKey))
                return (false, $"\"{newKey}\" already exists in \"{variableName}\".", null);

            rebuiltInner = string.Concat(entries.Select(e =>
                $"\n  \"{(e.Key == oldKey ? newKey : e.Key)}\" = {e.Value}")) + "\n";
        }
        else
        {
            var elements = TerraformResourceExtractor.SplitTopLevelElements(inner);
            var index = elements.FindIndex(el => StripQuotesIfPresent(el) == oldKey);

            if (index < 0)
                return (false, $"\"{oldKey}\" wasn't found in \"{variableName}\".", null);

            if (newKey != oldKey && elements.Any(el => StripQuotesIfPresent(el) == newKey))
                return (false, $"\"{newKey}\" already exists in \"{variableName}\".", null);

            elements[index] = $"\"{newKey}\"";
            rebuiltInner = string.Concat(elements.Select(el => $"\n  {el}")) + "\n";
        }

        var updated = tfvarsContent[..(valueStart.Value + 1)] + rebuiltInner + tfvarsContent[valueEnd..];

        return (true, null, updated);
    }

    // Deletes one existing map key or list element from a variable's value -
    // the "already exists, I don't want it anymore" counterpart to
    // RenameEntry, reusing the same hardened parsing helpers for the same
    // reason. This is a tfvars edit only: it never calls Azure, so an
    // existing resource isn't actually destroyed until Plan/Apply runs
    // against the now-shorter list - the caller is expected to make that
    // clear before calling this.
    public static (bool Success, string? Error, string? UpdatedContent) RemoveEntry(
        string tfvarsContent, string variableName, string shape, string key)
    {
        var valueStart = FindVariableValueStart(tfvarsContent, variableName);

        if (valueStart == null)
            return (false, $"Variable \"{variableName}\" wasn't found in this file.", null);

        if (valueStart.Value >= tfvarsContent.Length)
            return (false, $"\"{variableName}\" has no value to remove from.", null);

        var openBracket = tfvarsContent[valueStart.Value];

        if (openBracket != '{' && openBracket != '[')
            return (false, $"\"{variableName}\" isn't a map or list this app can edit.", null);

        var valueEnd = FindMatchingBracket(tfvarsContent, valueStart.Value);

        if (valueEnd < 0)
            return (false, $"\"{variableName}\"'s value looks malformed.", null);

        var inner = tfvarsContent[(valueStart.Value + 1)..valueEnd];
        string rebuiltInner;

        if (shape == "Map")
        {
            var entries = TerraformResourceExtractor.ParseTopLevelAssignments(inner);

            if (!entries.ContainsKey(key))
                return (false, $"\"{key}\" wasn't found in \"{variableName}\".", null);

            rebuiltInner = string.Concat(entries.Where(e => e.Key != key).Select(e =>
                $"\n  \"{e.Key}\" = {e.Value}"));
        }
        else
        {
            var elements = TerraformResourceExtractor.SplitTopLevelElements(inner);
            var index = elements.FindIndex(el => StripQuotesIfPresent(el) == key);

            if (index < 0)
                return (false, $"\"{key}\" wasn't found in \"{variableName}\".", null);

            elements.RemoveAt(index);
            rebuiltInner = string.Concat(elements.Select(el => $"\n  {el}"));
        }

        // Formatting only, terraform reads either the same: keep the closing
        // bracket on its own line (matching InsertEntry/RenameEntry) even
        // when removing the last entry leaves the map/list empty.
        rebuiltInner += "\n";

        var updated = tfvarsContent[..(valueStart.Value + 1)] + rebuiltInner + tfvarsContent[valueEnd..];

        return (true, null, updated);
    }

    private static string StripQuotesIfPresent(string text)
    {
        var trimmed = text.Trim();
        return trimmed.Length >= 2 && trimmed[0] == '"' && trimmed[^1] == '"' ? trimmed[1..^1] : trimmed;
    }

    // Matches EITHER bracket type from its own opening character - unlike
    // TerraformResourceExtractor's own FindMatchingBrace (curly braces
    // only, since it's only ever pointed at resource/module/variable
    // blocks), a top-level tfvars variable's value can open with either
    // '{' (a map) or '[' (a list), and correctly finding its end still
    // needs to track BOTH bracket types together (a map can nest a list,
    // and vice versa).
    private static int FindMatchingBracket(string text, int openIndex)
    {
        var depth = 0;
        var inString = false;

        for (var i = openIndex; i < text.Length; i++)
        {
            var c = text[i];

            if (inString)
            {
                if (c == '\\') { i++; continue; }
                if (c == '"') inString = false;
                continue;
            }

            if (c == '"') { inString = true; continue; }
            if (c == '{' || c == '[') depth++;
            else if (c == '}' || c == ']')
            {
                depth--;
                if (depth == 0) return i;
            }
        }

        return -1;
    }
}
