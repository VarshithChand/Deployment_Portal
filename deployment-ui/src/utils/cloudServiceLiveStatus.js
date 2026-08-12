// A handful of catalog ids don't match the ARN service namespace the
// Resource Groups Tagging API actually reports resources under (see the
// backend's CloudStatusService.ServiceLabels) - this bridges the gap for
// those so the account-wide inventory's generic "Other" bucket can still
// be matched by catalog id.
const OTHER_KEY_OVERRIDES = {
    "elb": "elasticloadbalancing",
    "step-functions": "states",
    "eventbridge": "events",
    "auto-scaling": "autoscaling",
    "efs": "elasticfilesystem",
    "opensearch": "es",
    "secrets-manager": "secretsmanager"
};

// ec2 is included for the "is this in use at all" signal (the overview
// grid, and the badge on its own catalog card) - it's still worth knowing
// even though its count here only reflects running instances (see the
// backend's DescribeEc2InstancesAsync). The full running-vs-stopped
// breakdown a click into its detail modal shows comes from a separate,
// richer call (getMyAwsEc2Detail) - same story for "ecs" below, which the
// inventory only ever sees through its generic tag-based "Other" scan.
const DIRECT_INVENTORY_FIELDS = {
    ec2: "ec2",
    ecr: "ecr",
    vpc: "vpc",
    s3: "s3",
    lambda: "lambda",
    route53: "route53",
    sns: "sns"
};

// Best-effort live {count, items} for a catalog service from the
// account-wide inventory (see settingsService.getMyAwsResources) -
// undefined if this particular service isn't one the inventory happens to
// cover (its 6 fixed fields, or whatever the generic tag-based scan
// turned up). Not every one of the catalog's ~100 services will have live
// data behind it; that's an honest limitation of a generic tag scan, not
// a bug to chase down per service.
export function getLiveStatusForService(service, inventory) {

    if (!inventory || !inventory.configured) {
        return undefined;
    }

    const directField = DIRECT_INVENTORY_FIELDS[service.id];

    if (directField) {
        return inventory[directField];
    }

    const otherKey = (OTHER_KEY_OVERRIDES[service.id] || service.id).toLowerCase();

    return (inventory.other || []).find((g) => (g.key || "").toLowerCase() === otherKey);

}
