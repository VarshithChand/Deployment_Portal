using DeploymentAPI.DTOs;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// Talks to SonarCloud/SonarQube's own Web API server-side, using the token
// configured in Settings — never sent to the frontend, same principle as
// every GitHub credential in this app. The Code Quality page only ever sees
// the processed SonarOverviewDto below.
public class SonarApiService
{
    private readonly SettingsService _settings;

    public SonarApiService(SettingsService settings)
    {
        _settings = settings;
    }

    private static readonly string[] MetricKeys =
    {
        "bugs", "vulnerabilities", "code_smells", "coverage",
        "duplicated_lines_density", "reliability_rating", "security_rating",
        "sqale_rating", "ncloc"
    };

    public async Task<SonarOverviewDto> GetOverviewAsync(string provider)
    {
        var creds = await _settings.GetSonarCredentialsAsync(provider);

        if (!creds.IsConfigured)
            return new SonarOverviewDto { Configured = false };

        using var client = CreateClient(creds.Token!);

        var dashboardUrl = $"{creds.HostUrl}/dashboard?id={Uri.EscapeDataString(creds.ProjectKey)}";

        try
        {
            var measuresUrl =
                $"{creds.HostUrl}/api/measures/component?component={Uri.EscapeDataString(creds.ProjectKey)}" +
                $"&metricKeys={string.Join(",", MetricKeys)}";

            var measuresJson = JObject.Parse(await GetStringAsync(client, measuresUrl));
            var measures = (measuresJson["component"]?["measures"] as JArray) ?? new JArray();

            string Value(string key) =>
                measures.FirstOrDefault(m => (string?)m["metric"] == key)?["value"]?.ToString() ?? "";

            double DoubleValue(string key) => double.TryParse(Value(key), out var d) ? d : 0;
            int IntValue(string key) => int.TryParse(Value(key), out var i) ? i : 0;

            string RatingLetter(string key)
            {
                // Sonar reports ratings as "1.0".."5.0" (1 = A, 5 = E).
                return DoubleValue(key) switch
                {
                    <= 1.5 => "A",
                    <= 2.5 => "B",
                    <= 3.5 => "C",
                    <= 4.5 => "D",
                    > 4.5 => "E",
                    _ => "?"
                };
            }

            var gateUrl =
                $"{creds.HostUrl}/api/qualitygates/project_status?projectKey={Uri.EscapeDataString(creds.ProjectKey)}";

            var gateJson = JObject.Parse(await GetStringAsync(client, gateUrl));
            var gateStatus = gateJson["projectStatus"]?["status"]?.ToString() ?? "NONE";

            return new SonarOverviewDto
            {
                Configured = true,
                DashboardUrl = dashboardUrl,
                QualityGateStatus = gateStatus,
                Bugs = IntValue("bugs"),
                Vulnerabilities = IntValue("vulnerabilities"),
                CodeSmells = IntValue("code_smells"),
                CoveragePercent = DoubleValue("coverage"),
                DuplicatedLinesPercent = DoubleValue("duplicated_lines_density"),
                ReliabilityRating = RatingLetter("reliability_rating"),
                SecurityRating = RatingLetter("security_rating"),
                MaintainabilityRating = RatingLetter("sqale_rating"),
                LinesOfCode = IntValue("ncloc")
            };
        }
        catch (Exception ex)
        {
            // A project that hasn't been scanned yet (no analysis exists)
            // 404s on both calls above — surfaced as a normal, expected
            // state rather than a raw error, since it's the first thing
            // anyone configuring this will see before CI has run once.
            Console.Error.WriteLine($"[{provider}] {ex}");

            return new SonarOverviewDto
            {
                Configured = true,
                DashboardUrl = dashboardUrl,
                Error = "No analysis found yet for this project — run the Code Quality workflow at least once, " +
                    "or check the organization/project key."
            };
        }
    }

    private static HttpClient CreateClient(string token)
    {
        var client = new HttpClient();

        // Sonar's Web API uses HTTP Basic auth with the token as the
        // username and an empty password — there's no bearer-token mode.
        var basic = Convert.ToBase64String(System.Text.Encoding.ASCII.GetBytes($"{token}:"));
        client.DefaultRequestHeaders.Add("Authorization", $"Basic {basic}");

        return client;
    }

    private static async Task<string> GetStringAsync(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync();
    }
}
