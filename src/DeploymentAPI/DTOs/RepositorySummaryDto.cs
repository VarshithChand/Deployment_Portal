namespace DeploymentAPI.DTOs;

// The minimal repository summary deployment-ui's Dashboard actually reads
// (see AllRepositoriesCard.jsx: repository.owner.login / repository.name) -
// deliberately not GitHub's full repository object, which also carries
// permissions, visibility settings, contributor/subscriber counts, and other
// account-level detail the UI never uses and shouldn't need to receive.
public class RepositorySummaryDto
{
    public string FullName { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public RepositoryOwnerDto Owner { get; set; } = new();
}

public class RepositoryOwnerDto
{
    public string Login { get; set; } = string.Empty;
}
