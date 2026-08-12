namespace DeploymentAPI.DTOs;

// A workflow FILE definition (GitHub's "list repository workflows" API) -
// distinct from WorkflowDto, which represents a workflow RUN. Only the
// fields the Deploy page's workflow picker actually reads (see
// DeploymentForm.jsx's classifyWorkflow/modeWorkflows) - not GitHub's full
// object, which also includes badge_url, node_id, and internal API/HTML
// URLs the frontend never uses.
public class WorkflowDefinitionDto
{
    public long Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Path { get; set; } = string.Empty;
}
