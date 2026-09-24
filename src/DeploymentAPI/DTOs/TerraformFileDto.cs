namespace DeploymentAPI.DTOs;

// List view - no content, so listing a directory of files never pulls
// potentially-large HCL text over the wire just to render a file browser.
public class TerraformFileSummaryDto
{
    public Guid Id { get; set; }

    public string FileName { get; set; } = string.Empty;

    public int ContentLength { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime UpdatedAtUtc { get; set; }

    public string UpdatedByUserId { get; set; } = string.Empty;
}

// Single-file detail view - includes the actual content, fetched only
// when a specific file is opened for editing.
public class TerraformFileDetailDto : TerraformFileSummaryDto
{
    public string Content { get; set; } = string.Empty;
}

public class CreateTerraformFileRequestDto
{
    public string? FileName { get; set; }

    public string? Content { get; set; }
}

public class UpdateTerraformFileRequestDto
{
    public string? Content { get; set; }
}
