using System.Text;
using DeploymentAPI.DTOs;
using Newtonsoft.Json.Linq;
using YamlDotNet.Serialization;

namespace DeploymentAPI.Services;

// Turns a workflow's raw YAML into a plain-English "here's what this
// pipeline actually does" summary for the Deploy page — same two-tier
// approach as ErrorAnalysisService: GitHub Models first (reasons about the
// real file, catches nuance a fixed template can't), falling back to
// reading the YAML's own structure (triggers/jobs/steps) into a summary
// whenever the AI call isn't available. Either path always returns
// something useful before someone commits to running a pipeline blind.
public class PipelineExplanationService
{
    private const string ModelsEndpoint = "https://models.github.ai/inference/chat/completions";
    private const string Model = "openai/gpt-4o-mini";

    private readonly GitHubAuthService _auth;

    public PipelineExplanationService(GitHubAuthService auth)
    {
        _auth = auth;
    }

    public async Task<PipelineExplanationDto> ExplainAsync(string workflowName, string yamlText)
    {
        var aiExplanation = await TryAiExplainAsync(workflowName, yamlText);

        if (aiExplanation != null)
            return new PipelineExplanationDto { Explanation = aiExplanation, Source = "ai" };

        return new PipelineExplanationDto { Explanation = HeuristicExplain(workflowName, yamlText), Source = "heuristic" };
    }

    private async Task<string?> TryAiExplainAsync(string workflowName, string yamlText)
    {
        if (!_auth.HasToken)
            return null;

        try
        {
            using var client = _auth.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(20);

            var prompt =
                $"Here is the full YAML for a GitHub Actions workflow named \"{workflowName}\":\n\n{yamlText}\n\n" +
                "In 4-6 sentences, explain in plain English what this pipeline actually does: what triggers it, " +
                "what its main jobs/steps do (build, test, deploy, etc.), and what it produces or where it " +
                "deploys to, if anything. Write for someone about to run it who wants to know what will happen.";

            var body = new JObject
            {
                ["model"] = Model,
                ["messages"] = new JArray
                {
                    new JObject { ["role"] = "system", ["content"] = "You are a concise CI/CD pipeline explainer." },
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

    private static string HeuristicExplain(string workflowName, string yamlText)
    {
        try
        {
            var deserializer = new DeserializerBuilder().Build();
            var root = deserializer.Deserialize<Dictionary<object, object>>(yamlText);

            var triggers = DescribeTriggers(root);
            var (jobNames, stepLabels) = DescribeJobs(root);

            var sentences = new List<string>
            {
                $"\"{workflowName}\" triggers on: {(triggers.Count > 0 ? string.Join(", ", triggers) : "no recognizable trigger")}."
            };

            sentences.Add(jobNames.Count switch
            {
                0 => "It doesn't declare any jobs.",
                1 => $"It runs one job: {jobNames[0]}.",
                _ => $"It runs {jobNames.Count} jobs: {string.Join(", ", jobNames)}."
            });

            if (stepLabels.Count > 0)
                sentences.Add($"Notable steps include: {string.Join(", ", stepLabels.Take(8))}.");

            return string.Join(" ", sentences);
        }
        catch
        {
            return "This workflow's YAML couldn't be parsed into a structured summary — use \"View YAML\" to read " +
                   "it directly.";
        }
    }

    private static List<string> DescribeTriggers(Dictionary<object, object>? root)
    {
        var result = new List<string>();

        if (root == null)
            return result;

        // YAML 1.1 (YamlDotNet's default) treats a bare "on" key as the
        // boolean `true` — same quirk TryGetDispatchInputsMap already
        // works around elsewhere in this codebase.
        object? onValue = root.TryGetValue("on", out var onByString)
            ? onByString
            : root.TryGetValue(true, out var onByBool) ? onByBool : null;

        switch (onValue)
        {
            case string single:
                result.Add(single);
                break;

            case IList<object> list:
                result.AddRange(list.Select(x => x?.ToString() ?? string.Empty).Where(x => x.Length > 0));
                break;

            case IDictionary<object, object> map:
                result.AddRange(map.Keys.Select(k => k?.ToString() ?? string.Empty).Where(x => x.Length > 0));
                break;
        }

        return result;
    }

    private static (List<string> JobNames, List<string> StepLabels) DescribeJobs(Dictionary<object, object>? root)
    {
        var jobNames = new List<string>();
        var stepLabels = new List<string>();

        if (root == null || !root.TryGetValue("jobs", out var jobsObj) || jobsObj is not IDictionary<object, object> jobs)
            return (jobNames, stepLabels);

        foreach (var jobEntry in jobs)
            DescribeJob(jobEntry, jobNames, stepLabels);

        return (jobNames, stepLabels);
    }

    private static void DescribeJob(KeyValuePair<object, object> jobEntry, List<string> jobNames, List<string> stepLabels)
    {
        var jobKey = jobEntry.Key?.ToString() ?? string.Empty;

        if (jobEntry.Value is not IDictionary<object, object> job)
        {
            if (jobKey.Length > 0) jobNames.Add(jobKey);
            return;
        }

        var displayName = job.TryGetValue("name", out var n) ? n?.ToString() : jobKey;
        if (!string.IsNullOrWhiteSpace(displayName)) jobNames.Add(displayName);

        if (job.TryGetValue("steps", out var stepsObj) && stepsObj is IEnumerable<object> steps)
            CollectStepLabels(steps, stepLabels);
    }

    private static void CollectStepLabels(IEnumerable<object> steps, List<string> stepLabels)
    {
        foreach (var stepObj in steps)
        {
            if (stepObj is not IDictionary<object, object> step)
                continue;

            var label = DescribeStep(step);

            if (!string.IsNullOrWhiteSpace(label) && !stepLabels.Contains(label))
                stepLabels.Add(label);
        }
    }

    private static string? DescribeStep(IDictionary<object, object> step)
    {
        if (step.TryGetValue("name", out var name) && !string.IsNullOrWhiteSpace(name?.ToString()))
            return name!.ToString();

        if (step.TryGetValue("uses", out var uses) && uses is string usesText)
        {
            // "aws-actions/amazon-ecs-deploy-task-definition@v2" -> "amazon-ecs-deploy-task-definition"
            var withoutVersion = usesText.Split('@')[0];
            return withoutVersion.Contains('/') ? withoutVersion[(withoutVersion.LastIndexOf('/') + 1)..] : withoutVersion;
        }

        if (step.TryGetValue("run", out var run) && run is string runText)
        {
            var firstLine = runText.Split('\n', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()?.Trim();
            return string.IsNullOrWhiteSpace(firstLine) ? null : firstLine;
        }

        return null;
    }
}
