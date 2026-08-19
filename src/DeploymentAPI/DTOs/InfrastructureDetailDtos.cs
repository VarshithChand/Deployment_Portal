namespace DeploymentAPI.DTOs;

// Phase 1 of the multi-cloud infrastructure console (EC2 / Azure VM / GCP
// Compute Engine detail pages - see security_findings.txt's own Round
// entry for the full plan). SecurityRuleDto/MetricSeriesDto are
// deliberately provider-agnostic so the frontend's FirewallRulesCard and
// LineChart render identically for all three providers rather than
// needing a per-provider shape.

public class MetricPointDto
{
    public DateTime Timestamp { get; set; }

    public double Value { get; set; }
}

public class MetricSeriesDto
{
    public string Label { get; set; } = string.Empty;

    public string Unit { get; set; } = string.Empty;

    public List<MetricPointDto> Points { get; set; } = new();
}

public class ResourceMetricsDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<MetricSeriesDto> Series { get; set; } = new();
}

// One firewall/security-group/NSG rule. AWS security-group rules have no
// opaque ID - they're identified by their full tuple (protocol/port range/
// CIDR) - Azure NSG rules and GCP firewall rules both have names. Id is
// populated wherever the provider actually has one; null for AWS, where
// Direction/Protocol/FromPort/ToPort/Cidr together are what identifies
// the rule to remove.
public class SecurityRuleDto
{
    public string? Id { get; set; }

    public string Direction { get; set; } = string.Empty;

    public string Protocol { get; set; } = string.Empty;

    public int? FromPort { get; set; }

    public int? ToPort { get; set; }

    public string Cidr { get; set; } = string.Empty;

    public string? Description { get; set; }
}

public class SecurityRuleListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    // "instance" = rules attached to this one resource (AWS security
    // group, Azure NSG). "network" = GCP's VPC-global firewall - these
    // rules apply to the whole network, not just the VM they were looked
    // up from; the frontend surfaces this honestly rather than pretending
    // GCP's model matches AWS/Azure's.
    public string Scope { get; set; } = "instance";

    public List<SecurityRuleDto> Inbound { get; set; } = new();

    public List<SecurityRuleDto> Outbound { get; set; } = new();
}

public class AddSecurityRuleRequestDto
{
    public string Direction { get; set; } = "Inbound";

    public string Protocol { get; set; } = "tcp";

    public int FromPort { get; set; }

    public int ToPort { get; set; }

    public string Cidr { get; set; } = string.Empty;

    public string? Description { get; set; }
}

// AWS security-group rules have no ID - removing one means resubmitting
// the exact tuple that was authorized, which is what AWS's own
// RevokeSecurityGroupIngress/Egress calls require.
public class RemoveSecurityRuleRequestDto
{
    public string? Id { get; set; }

    public string Direction { get; set; } = "Inbound";

    public string Protocol { get; set; } = "tcp";

    public int FromPort { get; set; }

    public int ToPort { get; set; }

    public string Cidr { get; set; } = string.Empty;
}

// ================= AWS EC2 detail =================

public class Ec2InstanceDetailDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public string Name { get; set; } = string.Empty;

    public string InstanceId { get; set; } = string.Empty;

    public string Region { get; set; } = string.Empty;

    public string? AvailabilityZone { get; set; }

    public string InstanceType { get; set; } = string.Empty;

    public string? Os { get; set; }

    public string State { get; set; } = string.Empty;

    public DateTime? LaunchTime { get; set; }

    public string? PublicIp { get; set; }

    public string? PrivateIp { get; set; }

    public string? PublicIpv6 { get; set; }

    public string? VpcId { get; set; }

    public string? SubnetId { get; set; }

    public List<string> SecurityGroupIds { get; set; } = new();

    public Dictionary<string, string> Tags { get; set; } = new();
}

// ================= Azure VM detail =================

public class AzureVmDetailDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public string Name { get; set; } = string.Empty;

    public string ResourceGroup { get; set; } = string.Empty;

    public string Location { get; set; } = string.Empty;

    public string Size { get; set; } = string.Empty;

    public string? OsType { get; set; }

    public string PowerState { get; set; } = string.Empty;

    public string? PublicIp { get; set; }

    public string? PrivateIp { get; set; }

    public string? VNetId { get; set; }

    public string? SubnetId { get; set; }

    // Null when this VM's NIC has no NSG attached - the frontend's
    // FirewallRulesCard shows a "no NSG attached" message rather than an
    // empty rule table in that case.
    public string? NsgId { get; set; }

    public Dictionary<string, string> Tags { get; set; } = new();
}

// ================= GCP Compute Engine =================

public class GcpVmInstanceDto
{
    public string Name { get; set; } = string.Empty;

    public string Zone { get; set; } = string.Empty;

    public string MachineType { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public string? PublicIp { get; set; }

    public string? PrivateIp { get; set; }

    // GCP's numeric instance ID (distinct from Name) - Cloud Monitoring's
    // gce_instance resource type filters on this, not the human-readable
    // name, so metrics calls need it passed back.
    public string? InstanceId { get; set; }

    public Dictionary<string, string> Labels { get; set; } = new();
}

public class GcpVmListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<GcpVmInstanceDto> Instances { get; set; } = new();
}
