// Shared by the Dashboard's Environments card and the Environments page's
// own table (previously two copies of the same PROVIDER_LABEL map/badge
// JSX that had already drifted - this one gets both new provider values at
// once instead of needing the same edit twice).
export const PROVIDER_LABEL = {
    aws: "AWS",
    azure: "Azure",
    render: "Render",
    cloudflare: "Cloudflare",
    none: "Not configured"
};

// autoDetected marks a target DeploymentTargetDetector found by reading the
// workflow's own YAML rather than one an admin explicitly saved (see
// EnvironmentsController.BuildSummaryAsync) - called out so it doesn't read
// as a manually-confirmed setting.
export default function CloudProviderBadge({ provider, autoDetected }) {

    return (

        <span className={`badge ${provider === "none" ? "badge-secondary" : "badge-info"}`}>
            {PROVIDER_LABEL[provider] || provider}
            {autoDetected && provider !== "none" && " (detected)"}
        </span>

    );

}
