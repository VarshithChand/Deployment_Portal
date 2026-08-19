namespace DeploymentAPI.DTOs;

// Cloud Services' Azure sub-page real VM management (start/stop/restart/
// delete/create) - the Azure equivalent of the AWS EC2 management
// surface (see AwsEc2DetailDto/Ec2ManagementPage.jsx), but built on ARM's
// own compute API directly rather than an AWS-style SDK client.

public class AzureVmDto
{
    public string Name { get; set; } = string.Empty;

    public string ResourceGroup { get; set; } = string.Empty;

    public string Location { get; set; } = string.Empty;

    public string Size { get; set; } = string.Empty;

    public string OsType { get; set; } = string.Empty;

    // Azure's own vocabulary (running/deallocated/stopped/starting/
    // stopping/...) - not normalized to AWS's running/stopped/pending set,
    // since the frontend's own StateBadge already handles an open-ended
    // string, same as it already does for AWS states.
    public string PowerState { get; set; } = string.Empty;

    public string? PrivateIp { get; set; }

    public string? PublicIp { get; set; }
}

public class AzureVmListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<AzureVmDto> Vms { get; set; } = new();
}

// What "Create VM" actually needs from the caller - deliberately a small,
// curated set (Image/Size are catalog keys resolved server-side against
// AzureVmCatalog, not free text) rather than exposing ARM's full
// hardwareProfile/storageProfile/osProfile surface area, matching this
// portal's own "curated, not exhaustive" convention (see data/awsRegions.js).
// Everything else CreateAzureVmAsync needs (VNet/Subnet/NSG/NIC/Public IP)
// is auto-created with sensible defaults - see that method's own comment
// for why, and what it names each dependent resource.
public class AzureCreateVmRequestDto
{
    public string ResourceGroup { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Location { get; set; } = string.Empty;

    // A key into AzureVmCatalog.Sizes, e.g. "Standard_B1s" - validated
    // server-side against that list rather than trusted as a raw ARM SKU
    // name.
    public string Size { get; set; } = string.Empty;

    // A key into AzureVmCatalog.Images, e.g. "ubuntu-24-04".
    public string Image { get; set; } = string.Empty;

    public string AdminUsername { get; set; } = string.Empty;

    // Exactly one of these is required - a Linux image accepts either
    // (password auth is disabled by default on most Linux marketplace
    // images unless a password is explicitly supplied, same as `az vm
    // create`'s own --admin-password/--ssh-key-values split), a Windows
    // image only ever accepts a password.
    public string? AdminPassword { get; set; }

    public string? SshPublicKey { get; set; }
}

// Cloud Services' generic "view/read" detail panel for every resource
// type that ISN'T a VM (which gets its own real management page instead)
// - the Azure equivalent of what AWS's GenericServiceManagementPage
// already shows, but one level deeper: ARM's own full property bag for
// this ONE resource, not just the name+location the account-wide
// inventory list already carries. Properties is intentionally a loose
// dictionary (ARM's own property shape is different for every resource
// type - there is no shared schema to model here) rather than a typed
// DTO per resource type, mirroring AwsResourceItemDto's own "two loose
// strings cover every AWS resource" reasoning one level up.
public class AzureResourceDetailDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Type { get; set; } = string.Empty;

    public string Location { get; set; } = string.Empty;

    public string? ResourceGroup { get; set; }

    public Dictionary<string, object?> Properties { get; set; } = new();

    public Dictionary<string, string>? Tags { get; set; }

    public string? PortalUrl { get; set; }
}
