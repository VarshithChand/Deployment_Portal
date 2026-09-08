namespace DeploymentAPI.DTOs;

// One entry in a directory listing - GitHubApiService.GetRepoContentsAsync
// returns a list of these when the requested path is a folder.
public class RepoContentEntryDto
{
    public string Name { get; set; } = string.Empty;

    public string Path { get; set; } = string.Empty;

    // "dir" | "file" - GitHub's own contents API vocabulary, passed through
    // as-is rather than translated to a bool, since the frontend needs the
    // string to pick an icon anyway.
    public string Type { get; set; } = "file";

    public long Size { get; set; }
}

// Overview dashboard's file browser - GitHubApiService.GetRepoContentsAsync's
// return shape for EITHER a directory listing or a single file's content,
// since GitHub's own /contents endpoint answers both from the same URL
// depending on whether the path is a folder or a file.
public class RepoContentsResultDto
{
    public bool Found { get; set; } = true;

    public string? Error { get; set; }

    public string Path { get; set; } = string.Empty;

    public bool IsDirectory { get; set; }

    // Populated only when IsDirectory is true.
    public List<RepoContentEntryDto> Entries { get; set; } = new();

    // Populated only when IsDirectory is false.
    public string Name { get; set; } = string.Empty;

    public long Size { get; set; }

    // Null when the file is binary or too large to preview - IsBinary/
    // TooLarge say which, rather than the frontend having to guess from a
    // null Content why nothing showed up.
    public string? Content { get; set; }

    public bool IsBinary { get; set; }

    public bool TooLarge { get; set; }
}
