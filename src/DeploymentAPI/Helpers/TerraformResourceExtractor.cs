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
public static class TerraformResourceExtractor
{
    private static readonly Regex ResourceHeaderPattern = new(
        @"resource\s+""([A-Za-z0-9_]+)""\s+""([A-Za-z0-9_-]+)""\s*\{",
        RegexOptions.Compiled);

    // Matches the resource's own top-level `name = "..."` attribute -
    // whatever text sits inside the quotes is shown verbatim, whether it's
    // a plain literal ("my-app") or an interpolation ("${var.prefix}-app"),
    // rather than this app pretending to resolve variable values it never
    // evaluates.
    private static readonly Regex NameAttributePattern = new(
        @"(?<![\w.])name\s*=\s*""([^""]*)""",
        RegexOptions.Compiled);

    public static List<ProjectResourceSummaryDto> Extract(IEnumerable<PersonalTerraformFileDetailDto> files)
    {
        var results = new List<ProjectResourceSummaryDto>();

        foreach (var file in files)
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

                results.Add(new ProjectResourceSummaryDto
                {
                    FileName = file.FileName,
                    ResourceType = header.Groups[1].Value,
                    LocalName = header.Groups[2].Value,
                    DeclaredName = nameMatch.Success ? nameMatch.Groups[1].Value : null
                });
            }
        }

        return results;
    }

    // Plain brace-depth counting from the opening '{' at startIndex -
    // sufficient for finding a resource block's own boundaries (this never
    // needs to understand HCL syntax beyond matching braces, and doesn't
    // try to skip braces inside string literals/comments - a rare false
    // match there just means DeclaredName search covers a slightly wrong
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
