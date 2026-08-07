namespace DeploymentAPI.DTOs;

public class PipelineExplanationDto
{
    public string Explanation { get; set; } = string.Empty;

    // "ai" when GitHub Models produced it, "heuristic" when it fell back
    // to reading the workflow's own structure (triggers/jobs/steps) —
    // same distinction ErrorAnalysisService already surfaces for History.
    public string Source { get; set; } = string.Empty;
}
