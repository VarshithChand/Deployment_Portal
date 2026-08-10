namespace DeploymentAPI.Helpers;

// Turns a raw User-Agent header into a short "OS · Browser" label for the
// Services page's Users tab (e.g. "Windows · Chrome", "Android · Chrome",
// "macOS · Safari") - deliberately simple substring sniffing rather than a
// full UA-parsing library, since this is a display label, not something
// anything else in the app makes decisions based on. Order matters: every
// Chromium-based browser's real UA also contains "Safari/" (and Edge/Opera
// also contain "Chrome/") for legacy compatibility, so the more specific
// tokens must be checked first or they'd all misreport as Chrome/Safari.
public static class DeviceInfo
{
    public static string Describe(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent))
            return "Unknown device";

        var os = userAgent switch
        {
            var ua when ua.Contains("Android") => "Android",
            var ua when ua.Contains("iPhone") || ua.Contains("iPad") => "iOS",
            var ua when ua.Contains("Windows") => "Windows",
            var ua when ua.Contains("Mac OS X") || ua.Contains("Macintosh") => "macOS",
            var ua when ua.Contains("Linux") => "Linux",
            _ => "Unknown OS"
        };

        var browser = userAgent switch
        {
            var ua when ua.Contains("Edg/") => "Edge",
            var ua when ua.Contains("OPR/") || ua.Contains("Opera") => "Opera",
            var ua when ua.Contains("Chrome/") => "Chrome",
            var ua when ua.Contains("CriOS/") => "Chrome",
            var ua when ua.Contains("Firefox/") || ua.Contains("FxiOS/") => "Firefox",
            var ua when ua.Contains("Safari/") => "Safari",
            _ => "Unknown browser"
        };

        return $"{os} · {browser}";
    }
}
