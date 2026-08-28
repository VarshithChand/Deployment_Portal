namespace DeploymentAPI.Helpers;

// Strips control characters (CR/LF above all) from any value that's about
// to be interpolated into a plain log message and originated outside this
// process - a request path, a deploy request's own free-typed fields, etc.
// Without this, that value could plant a fake-looking log line (a
// fabricated [ERROR]/[INFO] entry, or content that spoofs a different
// request) inside what's otherwise a genuine one - the same class of risk
// as SQL/HTML injection, just against whoever reads the log instead of a
// database or a browser. Not needed for values passed as a structured
// logging PARAMETER on their own (ILogger's {Placeholder} args are stored
// as data, not concatenated into text, by any provider that respects the
// structured API) - only for values that end up inside a literal string,
// which is what both call sites using this actually do.
public static class LogSanitizer
{
    public static string ForLog(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;

        var builder = new System.Text.StringBuilder(value.Length);

        foreach (var c in value)
            builder.Append(char.IsControl(c) ? '_' : c);

        return builder.ToString();
    }
}
