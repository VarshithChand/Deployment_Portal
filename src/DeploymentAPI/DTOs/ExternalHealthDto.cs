namespace DeploymentAPI.DTOs;

public class ExternalHealthEndpointsUpdateDto
{
    public string EndpointsText { get; set; } = string.Empty;
}

public class ExternalHealthCheckRequestDto
{
    public List<string> Urls { get; set; } = new();
}

public class ExternalHealthResultDto
{
    public string Url { get; set; } = string.Empty;

    public bool Ok { get; set; }

    public int? StatusCode { get; set; }

    public double? ResponseTimeMs { get; set; }

    // Truncated to a sane length - these are health endpoints, not large
    // payload APIs, but nothing stops one from returning something huge.
    public string? Body { get; set; }

    public string? Error { get; set; }
}
