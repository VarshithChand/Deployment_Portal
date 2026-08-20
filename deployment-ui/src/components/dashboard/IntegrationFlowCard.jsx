import useAuth from "../../hooks/useAuth";
import useNavigation from "../../hooks/useNavigation";
import useAzureDevOpsStatus from "../../hooks/useAzureDevOpsStatus";
import { useAwsResourceInventory, useAzureResourceInventory, useGcpResources } from "../../hooks/useSharedCloudInventories";
import useContainerRegistryStatus from "../../hooks/useContainerRegistryStatus";
import useSonarStatus from "../../hooks/useSonarStatus";
import useObservabilityStatus from "../../hooks/useObservabilityStatus";

function Chip({ label, connected, onClick }) {

    const className = `badge ${connected ? "badge-success" : "badge-secondary"}`;

    if (!onClick) {
        return <span className={className}>{label}</span>;
    }

    return (
        <button type="button" className={className} style={{ cursor: "pointer", border: "none" }} onClick={onClick}>
            {label}
        </button>
    );

}

function FlowStep({ title, chips, isLast }) {

    return (

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>

            <div style={{ minWidth: "150px" }}>

                <p className="field-hint" style={{ margin: "0 0 8px", fontWeight: 600 }}>{title}</p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {chips}
                </div>

            </div>

            {!isLast && <span aria-hidden="true" className="field-hint" style={{ fontSize: "20px", margin: 0 }}>→</span>}

        </div>

    );

}

// "How the integration flow is going" - a horizontal Source Control ->
// Build & Registry -> Deploy -> Observe & Quality chain, purely derived
// from data every shared Dashboard hook already carries (see
// useSharedCloudInventories.js/useContainerRegistryStatus.js/
// useSonarStatus.js/useObservabilityStatus.js/useAzureDevOpsStatus.js) -
// this component makes zero fetches of its own, so adding it costs
// nothing beyond re-deriving a few booleans other cards already
// computed. Not a graph library (RelationshipDiagram.jsx's own comment
// covers why - one linear chain doesn't need one); this is the same
// plain-flexbox spirit, just horizontal and multi-provider-per-step
// instead of RelationshipDiagram's single vertical chain of one
// resource's own parents.
export default function IntegrationFlowCard() {

    const { githubTokenConfigured } = useAuth();
    const { setTab } = useNavigation();

    const azureDevOps = useAzureDevOpsStatus();
    const aws = useAwsResourceInventory();
    const azure = useAzureResourceInventory();
    const gcp = useGcpResources();
    const registries = useContainerRegistryStatus();
    const sonar = useSonarStatus();
    const observability = useObservabilityStatus();

    const gcpVms = gcp.data?.vms;
    const registryCount = registries.status ? Object.values(registries.status).filter(Boolean).length : 0;
    const sonarConfigured = sonar.status ? Object.values(sonar.status).some(Boolean) : false;
    const observabilityConfigured = observability.status ? Object.values(observability.status).some(Boolean) : false;

    const anyConfigured = githubTokenConfigured || azureDevOps.configured || !!aws.data?.configured
        || !!azure.data?.configured || !!gcpVms?.configured || registryCount > 0 || sonarConfigured || observabilityConfigured;

    if (!anyConfigured) {
        return null;
    }

    const steps = [
        {
            title: "Source Control",
            chips: [
                <Chip key="github" label="GitHub" connected={githubTokenConfigured}
                    onClick={githubTokenConfigured ? () => setTab("deploy") : undefined} />,
                <Chip key="ado" label="Azure DevOps" connected={azureDevOps.configured}
                    onClick={azureDevOps.configured ? () => setTab("azureDevOpsPipelines") : undefined} />
            ]
        },
        {
            title: "Build & Registry",
            chips: [
                <Chip key="registry" label={registryCount > 0 ? `${registryCount} Registries Connected` : "No Registries"}
                    connected={registryCount > 0} />
            ]
        },
        {
            title: "Deploy",
            chips: [
                <Chip key="aws" label="AWS" connected={!!aws.data?.configured}
                    onClick={aws.data?.configured ? () => setTab("cloudServicesAws") : undefined} />,
                <Chip key="azure" label="Azure" connected={!!azure.data?.configured}
                    onClick={azure.data?.configured ? () => setTab("cloudServicesAzure") : undefined} />,
                <Chip key="gcp" label="GCP" connected={!!gcpVms?.configured}
                    onClick={gcpVms?.configured ? () => setTab("cloudServicesGcp") : undefined} />
            ]
        },
        {
            title: "Observe & Quality",
            chips: [
                <Chip key="obs" label="Observability" connected={observabilityConfigured} />,
                <Chip key="quality" label="Code Quality" connected={sonarConfigured}
                    onClick={sonarConfigured ? () => setTab("codeQuality") : undefined} />
            ]
        }
    ];

    return (

        <div className="card">

            <h2 className="card-title">Integration Flow</h2>

            <p className="field-hint" style={{ margin: "0 0 16px" }}>
                How your pipeline connects end to end - green means connected, grey means not set up yet.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px" }}>
                {steps.map((step, index) => (
                    <FlowStep key={step.title} title={step.title} chips={step.chips} isLast={index === steps.length - 1} />
                ))}
            </div>

        </div>

    );

}
