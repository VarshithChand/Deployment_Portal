using System.Text.RegularExpressions;

namespace DeploymentAPI.Helpers;

// Used by SecurityTestingScanService on every piece of response text
// (header values, body snippets, extracted title) BEFORE it's ever placed
// into a finding, persisted scan record, or log line. A security scanner
// that observes a real secret in someone's response and then displays,
// stores, or logs that value verbatim would itself be creating a new
// secret-exposure incident - the whole point of this class is that no
// caller ever sees the actual matched text, only "a potential secret was
// here." Patterns are deliberately broad/best-effort (a scanner's job is
// to flag "go check this," not to definitively fingerprint every possible
// credential format) - a false positive just means one extra manual
// check, a false negative means a real secret displayed in plain text,
// so this errs toward over-matching.
public static class SecretRedactor
{
    private const string Placeholder = "[REDACTED: potential secret]";

    private static readonly (string Label, Regex Pattern)[] Patterns =
    {
        ("AWS access key", new Regex(@"AKIA[0-9A-Z]{16}", RegexOptions.Compiled, TimeSpan.FromSeconds(1))),
        ("GitHub token", new Regex(@"gh[pousr]_[A-Za-z0-9]{20,}", RegexOptions.Compiled, TimeSpan.FromSeconds(1))),
        ("Private key", new Regex(@"-----BEGIN[ A-Z]*PRIVATE KEY-----", RegexOptions.Compiled, TimeSpan.FromSeconds(1))),
        ("JWT", new Regex(@"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", RegexOptions.Compiled, TimeSpan.FromSeconds(1))),
        ("Credential-shaped assignment", new Regex(
            @"(?i)\b(api[_-]?key|secret|token|password|passwd|access[_-]?key)\b\s*[:=]\s*['""]?[A-Za-z0-9/+_\-\.]{8,}",
            RegexOptions.Compiled, TimeSpan.FromSeconds(1)))
    };

    public record RedactionResult(string Text, int MatchCount);

    public static RedactionResult Redact(string? text)
    {
        if (string.IsNullOrEmpty(text))
            return new RedactionResult(text ?? string.Empty, 0);

        var matchCount = 0;
        var result = text;

        foreach (var (_, pattern) in Patterns)
        {
            result = pattern.Replace(result, _ =>
            {
                matchCount++;
                return Placeholder;
            });
        }

        return new RedactionResult(result, matchCount);
    }

    // Same matching, without doing the (unneeded, in this call path)
    // replacement work - used where the caller only needs to know
    // "was there anything secret-shaped here," e.g. deciding whether to
    // add a CRITICAL finding, not the redacted text itself.
    public static bool ContainsPotentialSecret(string? text)
    {
        if (string.IsNullOrEmpty(text))
            return false;

        return Patterns.Any(p => p.Pattern.IsMatch(text));
    }
}
