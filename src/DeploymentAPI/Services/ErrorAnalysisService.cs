using System.Text;
using DeploymentAPI.DTOs;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// Turns a failed job's raw GitHub annotation text into a plain-English
// explanation. Tries GitHub Models first (models.github.ai — an
// OpenAI-compatible chat completions API GitHub exposes against the same
// PAT already configured for this visitor, provided it carries the
// "models: read" scope), since it can reason about error text it's never
// seen before. Falls back to a small hand-written pattern library —
// covering the failure signatures this portal's own CI has actually hit
// (SonarCloud's Automatic Analysis conflict, GitHub runner "Service
// Unavailable" outages, generic npm/exit-code failures) — whenever the AI
// call isn't available: no token, the token lacks the models scope, the
// account is out of free-tier quota, or any other failure. Either path
// always returns something useful; this is a "nice to have" explanation
// layered on top of the raw message, never a blocker.
public class ErrorAnalysisService
{
    private const string ModelsEndpoint = "https://models.github.ai/inference/chat/completions";
    private const string Model = "openai/gpt-4o-mini";

    private readonly GitHubAuthService _auth;

    public ErrorAnalysisService(GitHubAuthService auth)
    {
        _auth = auth;
    }

    public async Task<AnalyzeErrorResponseDto> AnalyzeAsync(AnalyzeErrorRequestDto request)
    {
        var aiExplanation = await TryAiAnalyzeAsync(request);

        if (aiExplanation != null)
            return new AnalyzeErrorResponseDto { Explanation = aiExplanation, Source = "ai" };

        return new AnalyzeErrorResponseDto { Explanation = HeuristicAnalyze(request), Source = "heuristic" };
    }

    private async Task<string?> TryAiAnalyzeAsync(AnalyzeErrorRequestDto request)
    {
        if (!_auth.HasToken)
            return null;

        try
        {
            using var client = _auth.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(20);

            var rawText = string.Join("\n\n", request.Messages ?? new List<string>());

            var prompt =
                $"A CI/CD pipeline job named \"{request.JobName}\" failed" +
                (string.IsNullOrWhiteSpace(request.FailedStep) ? "" : $" on the step \"{request.FailedStep}\"") +
                ".\n\nRaw error output from GitHub Actions:\n" +
                (string.IsNullOrWhiteSpace(rawText) ? "(no detailed message was attached)" : rawText) +
                "\n\nIn 2-4 sentences, explain in plain English what likely went wrong and what to check first. " +
                "Do not repeat the raw text back verbatim.";

            var body = new JObject
            {
                ["model"] = Model,
                ["messages"] = new JArray
                {
                    new JObject { ["role"] = "system", ["content"] = "You are a concise CI/CD failure triage assistant." },
                    new JObject { ["role"] = "user", ["content"] = prompt }
                },
                ["temperature"] = 0.2
            };

            using var content = new StringContent(body.ToString(), Encoding.UTF8, "application/json");
            var response = await client.PostAsync(ModelsEndpoint, content);

            if (!response.IsSuccessStatusCode)
                return null;

            var json = await response.Content.ReadAsStringAsync();
            var parsed = JObject.Parse(json);

            var text = parsed["choices"]?[0]?["message"]?["content"]?.ToString();

            return string.IsNullOrWhiteSpace(text) ? null : text.Trim();
        }
        catch
        {
            return null;
        }
    }

    private static string HeuristicAnalyze(AnalyzeErrorRequestDto request)
    {
        var text = string.Join("\n", request.Messages ?? new List<string>()).ToLowerInvariant();

        if (text.Contains("service unavailable") || text.Contains("internal server error occurred while resolving"))
            return "This looks like a temporary GitHub Actions infrastructure outage (GitHub's own runners failing to " +
                   "download standard actions), not a problem with your code or pipeline. Re-running the job once " +
                   "GitHub's runners recover should fix it.";

        if (text.Contains("automatic analysis is enabled"))
            return "SonarCloud's \"Automatic Analysis\" is enabled at the same time as this repo's CI-based analysis, " +
                   "and SonarCloud refuses to run both. Disable Automatic Analysis in SonarCloud under " +
                   "Administration > Analysis Method.";

        if (text.Contains("sonar-project.properties"))
            return "A sonar-project.properties file exists somewhere in the repo, which the .NET SonarScanner rejects " +
                   "outright. Remove the file — the .NET scanner reads its configuration from the dotnet-sonarscanner " +
                   "command arguments instead.";

        if (text.Contains("npm err"))
            return "An npm command failed. Check the referenced package or script name in the raw message above — " +
                   "this is usually a missing dependency, a bad script name, or a lockfile mismatch.";

        if (text.Contains("permission denied") || text.Contains("403"))
            return "The job hit a permissions error — either the workflow's GITHUB_TOKEN doesn't have the scope the " +
                   "step needs, or a secret/PAT it depends on has expired or lacks access.";

        if (text.Contains("enoent") || text.Contains("no such file or directory"))
            return "A file or path the step expected wasn't there. Check that any path referenced in the failed step " +
                   "actually exists at that point in the job — a prior step may not have produced it, or the working " +
                   "directory changed.";

        if (text.Contains("exit code"))
            return "A command in this step exited with a non-zero status. The raw message above is the exact output " +
                   "GitHub captured for it — it's the most specific information available for this failure.";

        return "No specific failure pattern was recognized here. The raw message above is exactly what GitHub " +
               "attached to this step — it's the most complete information available without opening the full log.";
    }
}
