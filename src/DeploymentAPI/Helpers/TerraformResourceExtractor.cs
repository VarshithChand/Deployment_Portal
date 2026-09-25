using System.Text.RegularExpressions;
using DeploymentAPI.DTOs;

namespace DeploymentAPI.Helpers;

// Powers the "fake plan" preview (TerraformController.Preview) - a
// deliberately simple, regex-based scan for `resource "TYPE" "local_name"
// { ... }` blocks, NOT a real HCL parser and NOT terraform itself. Good
// enough to answer "what resource types and names does this describe" for
// a quick, no-Azure-calls preview; anything genuinely ambiguous (an
// interpolated or variable-referenced name) is surfaced as the raw
// expression text rather than silently guessing at its resolved value,
// since this app never actually evaluates Terraform expressions.
//
// One important exception: for_each/count. A single `resource` BLOCK with
// `for_each = var.web_apps` creates one ACTUAL resource per entry in that
// map - reporting "1" for it (as an earlier version of this extractor did)
// is actively misleading for exactly the shape real Terraform code uses to
// create "N web apps from a list". TryResolveInstances below makes a
// best-effort attempt to resolve that count from an uploaded .tfvars file
// (or a variable's own default), using a small HCL-lite value scanner
// (ParseTopLevelAssignments/SplitTopLevelElements) - still not a real HCL
// parser, and still honest about failing (HasForEachOrCount stays true,
// InstanceCount stays null) whenever the referenced value isn't a literal
// this app can read.
public static class TerraformResourceExtractor
{
    private static readonly Regex ResourceHeaderPattern = new(
        @"resource\s+""([A-Za-z0-9_]+)""\s+""([A-Za-z0-9_-]+)""\s*\{",
        RegexOptions.Compiled);

    private static readonly Regex VariableBlockPattern = new(
        @"variable\s+""([A-Za-z0-9_-]+)""\s*\{", RegexOptions.Compiled);

    // Matches the resource's own top-level `name = "..."` attribute -
    // whatever text sits inside the quotes is shown verbatim, whether it's
    // a plain literal ("my-app") or an interpolation ("${var.prefix}-app"),
    // rather than this app pretending to resolve variable values it never
    // evaluates.
    private static readonly Regex NameAttributePattern = new(
        @"(?<![\w.])name\s*=\s*""([^""]*)""",
        RegexOptions.Compiled);

    private static readonly Regex ForEachPattern = new(
        @"(?<![\w.])for_each\s*=\s*([^\r\n]+)", RegexOptions.Compiled);

    private static readonly Regex CountPattern = new(
        @"(?<![\w.])count\s*=\s*([^\r\n]+)", RegexOptions.Compiled);

    // A for_each/count expression that references exactly one input
    // variable, optionally wrapped in toset()/tolist()/length() - the
    // handful of wrapper functions real Terraform code actually uses
    // around a for_each/count source. Anything else (a local value, a
    // ternary, string concatenation) is left unresolved.
    private static readonly Regex VariableReferencePattern = new(
        @"^(?:toset|tolist|length)?\(?\s*var\.([A-Za-z0-9_-]+)\s*\)?$", RegexOptions.Compiled);

    public static List<ProjectResourceSummaryDto> Extract(IEnumerable<PersonalTerraformFileDetailDto> files)
    {
        var fileList = files as IReadOnlyCollection<PersonalTerraformFileDetailDto> ?? files.ToList();
        var variableValues = BuildVariableValueIndex(fileList);

        var results = new List<ProjectResourceSummaryDto>();

        foreach (var file in fileList)
        {
            if (!file.FileName.EndsWith(".tf", StringComparison.OrdinalIgnoreCase)
                && !file.FileName.EndsWith(".tf.json", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            foreach (Match header in ResourceHeaderPattern.Matches(file.Content))
            {
                var blockStart = header.Index + header.Length - 1; // the opening '{'
                var blockEnd = FindMatchingBrace(file.Content, blockStart);

                var block = blockEnd > blockStart
                    ? file.Content.Substring(blockStart, blockEnd - blockStart + 1)
                    : string.Empty;

                var nameMatch = NameAttributePattern.Match(block);
                var forEachMatch = ForEachPattern.Match(block);
                var countMatch = CountPattern.Match(block);

                int? instanceCount = null;
                List<string>? instanceNames = null;

                if (forEachMatch.Success)
                    (instanceCount, instanceNames) = TryResolveForEach(forEachMatch.Groups[1].Value.Trim(), variableValues);
                else if (countMatch.Success)
                    instanceCount = TryResolveCount(countMatch.Groups[1].Value.Trim(), variableValues);

                results.Add(new ProjectResourceSummaryDto
                {
                    FileName = file.FileName,
                    ResourceType = header.Groups[1].Value,
                    LocalName = header.Groups[2].Value,
                    DeclaredName = nameMatch.Success ? nameMatch.Groups[1].Value : null,
                    HasForEachOrCount = forEachMatch.Success || countMatch.Success,
                    InstanceCount = instanceCount,
                    InstanceNames = instanceNames
                });
            }
        }

        return results;
    }

    // var name -> its raw literal value text (still HCL syntax, unparsed
    // beyond finding where it starts/ends). variable "X" { default = ... }
    // blocks are read first (lowest precedence); .tfvars/.tfvars.json
    // assignments are read after and win on conflict, matching Terraform's
    // own real precedence (a tfvars value overrides a variable's default).
    private static Dictionary<string, string> BuildVariableValueIndex(IReadOnlyCollection<PersonalTerraformFileDetailDto> files)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var file in files.Where(f => f.FileName.EndsWith(".tf", StringComparison.OrdinalIgnoreCase)))
        {
            foreach (Match m in VariableBlockPattern.Matches(file.Content))
            {
                var blockStart = m.Index + m.Length - 1;
                var blockEnd = FindMatchingBrace(file.Content, blockStart);
                if (blockEnd <= blockStart) continue;

                var block = file.Content.Substring(blockStart, blockEnd - blockStart + 1);
                var assignments = ParseTopLevelAssignments(block);

                if (assignments.TryGetValue("default", out var defaultValue))
                    values[m.Groups[1].Value] = defaultValue;
            }
        }

        foreach (var file in files.Where(f =>
            f.FileName.EndsWith(".tfvars", StringComparison.OrdinalIgnoreCase)
            || f.FileName.EndsWith(".tfvars.json", StringComparison.OrdinalIgnoreCase)))
        {
            foreach (var (name, value) in ParseTopLevelAssignments(file.Content))
                values[name] = value;
        }

        return values;
    }

    private static (int? Count, List<string>? Names) TryResolveForEach(string expression, Dictionary<string, string> variableValues)
    {
        var varMatch = VariableReferencePattern.Match(expression);

        if (!varMatch.Success || !variableValues.TryGetValue(varMatch.Groups[1].Value, out var rawValue))
            return (null, null);

        var trimmed = rawValue.Trim();

        if (trimmed.StartsWith('{'))
        {
            var entries = ParseTopLevelAssignments(StripOuterBracket(trimmed));
            var names = entries.Select(e => ExtractNameOrFallback(e.Value, e.Key)).ToList();
            return (names.Count, names);
        }

        if (trimmed.StartsWith('['))
        {
            var elements = SplitTopLevelElements(StripOuterBracket(trimmed));
            var names = elements.Select(ExtractNameOrLiteral).ToList();
            return (names.Count, names);
        }

        return (null, null);
    }

    // count doesn't key its instances by name the way for_each does (they're
    // just indices 0..N-1), so this only ever resolves a number - never a
    // per-instance name list.
    private static int? TryResolveCount(string expression, Dictionary<string, string> variableValues)
    {
        if (int.TryParse(expression, out var literal))
            return literal;

        var lengthMatch = Regex.Match(expression, @"^length\(\s*var\.([A-Za-z0-9_-]+)\s*\)$");
        var target = lengthMatch.Success ? lengthMatch.Groups[1].Value : null;

        if (target == null)
        {
            var varMatch = VariableReferencePattern.Match(expression);
            if (!varMatch.Success) return null;
            target = varMatch.Groups[1].Value;
        }

        if (!variableValues.TryGetValue(target, out var rawValue))
            return null;

        var trimmed = rawValue.Trim();

        if (int.TryParse(trimmed, out var asNumber))
            return asNumber;

        if (trimmed.StartsWith('{'))
            return ParseTopLevelAssignments(StripOuterBracket(trimmed)).Count;

        if (trimmed.StartsWith('['))
            return SplitTopLevelElements(StripOuterBracket(trimmed)).Count;

        return null;
    }

    // Prefers a `name = "..."` attribute inside the entry's own value (the
    // common "map of objects, each with its own name" shape); falls back to
    // the map key itself (the common "map keyed by the app's own name"
    // shape) when there's no nested name attribute.
    private static string ExtractNameOrFallback(string entryValue, string key)
    {
        var nameMatch = NameAttributePattern.Match(entryValue);
        return nameMatch.Success ? nameMatch.Groups[1].Value : key;
    }

    // A list element is either a bare quoted string (the value itself is
    // the name) or an object with its own `name = "..."` attribute.
    private static string ExtractNameOrLiteral(string element)
    {
        var trimmed = element.Trim();

        if (trimmed.StartsWith('"') && trimmed.EndsWith('"') && trimmed.Length >= 2)
            return trimmed[1..^1];

        var nameMatch = NameAttributePattern.Match(trimmed);
        return nameMatch.Success ? nameMatch.Groups[1].Value : trimmed;
    }

    private static string StripOuterBracket(string text) =>
        text.Length >= 2 ? text[1..^1] : string.Empty;

    // A deliberately loose HCL-lite scanner: finds every top-level
    // "identifier = <value>" assignment in a block of text and returns each
    // one's raw, untouched value text (still HCL syntax - a quoted string, a
    // [...] list, or a {...} object) - NOT a real HCL/JSON parser, just
    // enough bracket/quote-depth awareness to find where one value ends and
    // the next assignment begins, since a real value can span multiple
    // lines and contain nested brackets.
    private static readonly Regex AssignmentPattern = new(
        @"^[ \t]*([A-Za-z_][A-Za-z0-9_-]*)[ \t]*=[ \t]*", RegexOptions.Compiled | RegexOptions.Multiline);

    // A sequential, non-overlapping scan - NOT Regex.Matches(text) over the
    // whole string, which would also match "name ="/"sku =" etc. sitting
    // INSIDE a nested object value (Multiline mode's ^ matches every line
    // start, nested or not). After each assignment's value is found, the
    // scan resumes right after that value ends, so anything nested inside
    // it is never independently re-matched as its own top-level assignment.
    private static Dictionary<string, string> ParseTopLevelAssignments(string text)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        var position = 0;

        while (position < text.Length)
        {
            var m = AssignmentPattern.Match(text, position);
            if (!m.Success) break;

            var name = m.Groups[1].Value;
            var valueStart = m.Index + m.Length;
            var valueEnd = FindAssignmentValueEnd(text, valueStart);

            if (!result.ContainsKey(name))
                result[name] = text.Substring(valueStart, valueEnd - valueStart).Trim();

            position = Math.Max(valueEnd, valueStart) + 1;
        }

        return result;
    }

    // Comma-or-newline-separated top-level elements inside a [...] list's
    // inner text - same bracket/quote-depth reasoning as
    // FindAssignmentValueEnd, just splitting on "," in addition to "\n".
    private static List<string> SplitTopLevelElements(string text)
    {
        var elements = new List<string>();
        var depth = 0;
        var inString = false;
        var start = 0;

        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];

            if (inString)
            {
                if (c == '\\') { i++; continue; }
                if (c == '"') inString = false;
                continue;
            }

            if (c == '"') { inString = true; continue; }
            if (c == '[' || c == '{') depth++;
            else if (c == ']' || c == '}') depth--;
            else if ((c == ',' || c == '\n') && depth == 0)
            {
                var piece = text[start..i].Trim();
                if (piece.Length > 0) elements.Add(piece);
                start = i + 1;
            }
        }

        var last = text[start..].Trim();
        if (last.Length > 0) elements.Add(last);

        return elements;
    }

    private static int FindAssignmentValueEnd(string text, int start)
    {
        var depth = 0;
        var inString = false;

        for (var i = start; i < text.Length; i++)
        {
            var c = text[i];

            if (inString)
            {
                if (c == '\\') { i++; continue; }
                if (c == '"') inString = false;
                continue;
            }

            if (c == '"') { inString = true; continue; }
            if (c == '[' || c == '{') depth++;
            else if (c == ']' || c == '}')
            {
                depth--;
                if (depth < 0) return i; // hit the enclosing block's own closing brace
            }
            else if (c == '\n' && depth <= 0)
            {
                return i;
            }
        }

        return text.Length;
    }

    // Plain brace-depth counting from the opening '{' at startIndex -
    // sufficient for finding a resource/variable block's own boundaries
    // (this never needs to understand HCL syntax beyond matching braces,
    // and doesn't try to skip braces inside string literals/comments - a
    // rare false match there just means the search covers a slightly wrong
    // span, never a crash or a wrong ResourceType/LocalName).
    private static int FindMatchingBrace(string text, int startIndex)
    {
        var depth = 0;

        for (var i = startIndex; i < text.Length; i++)
        {
            if (text[i] == '{') depth++;
            else if (text[i] == '}')
            {
                depth--;
                if (depth == 0) return i;
            }
        }

        return -1;
    }
}
