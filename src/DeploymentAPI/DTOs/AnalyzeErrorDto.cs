namespace DeploymentAPI.DTOs;

public class AnalyzeErrorRequestDto
{
    public string JobName { get; set; } = string.Empty;

    public string? FailedStep { get; set; }

    public List<string> Messages { get; set; } = new();
}

public class AnalyzeErrorResponseDto
{
    public string Explanation { get; set; } = string.Empty;

    // "ai" when GitHub Models produced the explanation, "heuristic" when
    // it fell back to the built-in pattern library - shown in the UI so
    // nobody mistakes a canned explanation for a model's reasoning.
    public string Source { get; set; } = string.Empty;
}
