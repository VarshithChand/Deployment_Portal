namespace DeploymentAPI.DTOs;

// Personal (non-org) Terraform credentials - a dedicated service principal
// for infrastructure work, deliberately stored separately from
// UserAzureCredentials (Settings > Credentials > Azure), which is scoped to
// read-only status checks. Reusing that same read-only principal for
// Terraform would either under-permission it (can't actually manage
// resources) or silently over-permission the status-check credential if
// someone widened it later - two different trust levels stay two different
// stored credentials, same shape as each other by coincidence, not by
// sharing storage.
public record UserTerraformCredentials(string? TenantId, string? ClientId, string? ClientSecret, string? SubscriptionId)
{
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(TenantId)
        && !string.IsNullOrWhiteSpace(ClientId)
        && !string.IsNullOrWhiteSpace(ClientSecret);
}

public class TerraformCredentialsUpdateDto
{
    public string TenantId { get; set; } = string.Empty;

    public string ClientId { get; set; } = string.Empty;

    public string ClientSecret { get; set; } = string.Empty;

    public string SubscriptionId { get; set; } = string.Empty;
}

// List view - no content, matches TerraformFileSummaryDto's own reasoning
// (don't pull potentially-large HCL text over the wire just to render a
// file browser).
public class PersonalTerraformFileSummaryDto
{
    public string FileName { get; set; } = string.Empty;

    public int ContentLength { get; set; }

    public DateTime UpdatedAtUtc { get; set; }
}

public class PersonalTerraformFileDetailDto : PersonalTerraformFileSummaryDto
{
    public string Content { get; set; } = string.Empty;
}

// One entry in a bulk upload (the "pick multiple files from my local
// Terraform folder" flow) - upload is upsert-by-filename, unlike the org
// panel's strict create-only + separate edit, since re-uploading the same
// folder after local edits is the expected everyday use of this picker.
public class TerraformFileUploadEntryDto
{
    public string? FileName { get; set; }

    public string? Content { get; set; }
}

public class UploadTerraformFilesRequestDto
{
    public List<TerraformFileUploadEntryDto> Files { get; set; } = new();
}

public class UpdateTerraformFileContentDto
{
    public string? Content { get; set; }
}

// confirmationText must exactly match the plan's own summary line (e.g.
// "Plan: 3 to add, 0 to change, 1 to destroy.") - see
// TerraformExecutionService.ApplyAsync's own comment for why a generic
// "yes" wouldn't actually prove the plan was read.
public class TerraformApplyRequestDto
{
    public string? PlanId { get; set; }

    public string? ConfirmationText { get; set; }
}

// A project is one uploaded folder (or a from-scratch set of files) - its
// own file tree, its own Explain/Preview/Plan/Apply, its own page. Replaces
// the earlier single-flat-list-per-user model once a user has uploaded more
// than one real project (e.g. "terraform_full web app creation" and
// "cluster creation infra" from two different local folders) - keeping
// them in one shared list meant same-named files (every project's own
// main.tf) silently overwrote each other.
public class TerraformProjectSummaryDto
{
    public Guid ProjectId { get; set; }

    public string Name { get; set; } = string.Empty;

    public int FileCount { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime UpdatedAtUtc { get; set; }
}

public class TerraformProjectDetailDto : TerraformProjectSummaryDto
{
    public List<PersonalTerraformFileSummaryDto> Files { get; set; } = new();
}

public class CreateTerraformProjectRequestDto
{
    public string? Name { get; set; }

    public List<TerraformFileUploadEntryDto> Files { get; set; } = new();
}

// The "fake plan" - a static, deterministic extraction (regex over the
// stored HCL text, not a real parse and definitely not real terraform) of
// every `resource "TYPE" "local_name" { ... }` block, plus that block's own
// `name = "..."` attribute when it's a literal string (left null when it's
// an expression/variable reference like var.app_name, rather than
// pretending to resolve something this app never evaluates). Pairs with an
// AI-written narrative for "what would this actually mean" - see
// TerraformProjectPreviewDto below.
//
// One HCL `resource` BLOCK is not the same as one actual Azure resource
// when it declares for_each/count - a single block with
// `for_each = var.web_apps` creates one resource per entry in that map.
// InstanceCount/InstanceNames are populated when this app can resolve that
// variable's literal value from an uploaded .tfvars file (see
// TerraformResourceExtractor.TryResolveInstances) - null when it can't
// (the variable isn't in any uploaded .tfvars, or its value isn't a plain
// literal list/map this app can read), in which case HasForEachOrCount
// alone tells the caller "more than one may be created, but this app can't
// say how many."
public class ProjectResourceSummaryDto
{
    public string FileName { get; set; } = string.Empty;

    public string ResourceType { get; set; } = string.Empty;

    public string LocalName { get; set; } = string.Empty;

    public string? DeclaredName { get; set; }

    public bool HasForEachOrCount { get; set; }

    public int? InstanceCount { get; set; }

    public List<string>? InstanceNames { get; set; }
}

public class TerraformProjectPreviewDto
{
    public List<ProjectResourceSummaryDto> Resources { get; set; } = new();

    public string? Narrative { get; set; }
}

// One way to add a new instance of something this project already creates
// in bulk (a new web app, function app, or service bus queue) without
// hand-editing HCL - see TerraformResourceExtractor.BuildAddTargets for how
// this is discovered (a module's own for_each, or - for something like
// service bus, where the multiplying for_each sits on a resource INSIDE a
// non-for_each'd module - one hop through that module's own argument
// passing). VariableName/FileName/Shape describe exactly where a new entry
// would be inserted (TerraformTfvarsEditor.InsertEntry); ExistingCount is
// shown so the picker reads as e.g. "api_web_apps (16 existing)".
public class AddResourceTargetDto
{
    public string ResourceType { get; set; } = string.Empty;

    public string ModuleLocalName { get; set; } = string.Empty;

    public string VariableName { get; set; } = string.Empty;

    public string FileName { get; set; } = string.Empty;

    // "Map" (a for_each over a map of objects - each new entry needs a
    // unique key, e.g. "new-app-name" = {}) or "List" (a for_each/count
    // over a plain list of strings - each new entry is just another quoted
    // string, e.g. "new-app-name",).
    public string Shape { get; set; } = string.Empty;

    public int ExistingCount { get; set; }
}

public class AddResourceInstanceRequestDto
{
    public string? VariableName { get; set; }

    public string? Name { get; set; }

    // Web-app-only, optional - when either is given, the new map entry gets
    // those attributes set (e.g. `"new-app" = { appsettings_file = "..." }`)
    // instead of the plain `"new-app" = {}` every other kind still gets.
    public string? AppsettingsFile { get; set; }

    public string? ConnectionstringsFile { get; set; }
}

// One individual instance (one web app, one queue, ...) - the "Resources"
// tab's own row. Key is the exact map key/list element TerraformTfvarsEditor.
// RenameEntry matches against to rename it; DisplayName is what's shown/
// edited (falls back to Key when there's no nested "name" attribute to
// prefer).
public class ResourceInstanceDto
{
    public string ResourceType { get; set; } = string.Empty;

    public string VariableName { get; set; } = string.Empty;

    public string FileName { get; set; } = string.Empty;

    public string Shape { get; set; } = string.Empty;

    public string Key { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;
}

public class RenameResourceInstanceRequestDto
{
    public string? VariableName { get; set; }

    public string? OldKey { get; set; }

    public string? NewKey { get; set; }
}

// The "no existing target fits" path - generates a starter HCL block
// (not fully auto-wired - see TerraformController.GenerateTemplate's own
// comment) appended to main.tf/variables.tf/terraform.tfvars for the
// requested kind, as a starting point to review and connect.
public class GenerateNewTemplateRequestDto
{
    public string? Kind { get; set; } // "webApp" | "functionApp" | "serviceBusQueue"

    public string? Name { get; set; }
}
