using System.Diagnostics;

namespace DeploymentAPI.Services;

// Resolves this running backend instance's real git commit/environment -
// never a fabricated/incrementing version number (section 21 of the
// Application Support spec: "never allow the AI to invent a version").
// Resolved once at process startup (Singleton) since none of this changes
// while the process is alive.
public class ApplicationBuildInfoService
{
    public string Commit { get; }

    // A real semantic version ONLY if an admin has actually set one via
    // the APP_VERSION environment variable on the hosting platform - never
    // invented when unset (section 5/21: "prefer a configuration/build
    // metadata approach... where available").
    public string? Version { get; }

    public string Environment { get; }

    public DateTime StartedAtUtc { get; }

    public ApplicationBuildInfoService(IHostEnvironment env)
    {
        StartedAtUtc = DateTime.UtcNow;
        Environment = env.EnvironmentName;
        Version = System.Environment.GetEnvironmentVariable("APP_VERSION");
        Commit = ResolveCommit();
    }

    // Render sets RENDER_GIT_COMMIT automatically for every deploy of a
    // service built from a git repo - the most reliable source when
    // actually running on Render (this app's backend host). Falls back to
    // asking git directly (works for local dev, or any other host) and
    // finally to an honest "unknown" rather than a guess.
    private static string ResolveCommit()
    {
        var renderCommit = System.Environment.GetEnvironmentVariable("RENDER_GIT_COMMIT");

        if (!string.IsNullOrWhiteSpace(renderCommit))
            return Shorten(renderCommit);

        try
        {
            var startInfo = new ProcessStartInfo("git", "rev-parse HEAD")
            {
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(startInfo);

            if (process == null)
                return "unknown";

            var output = process.StandardOutput.ReadToEnd().Trim();

            if (!process.WaitForExit(2000))
                return "unknown";

            return string.IsNullOrWhiteSpace(output) ? "unknown" : Shorten(output);
        }
        catch
        {
            return "unknown";
        }
    }

    private static string Shorten(string sha) => sha.Length > 7 ? sha[..7] : sha;
}
