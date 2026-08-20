import useNavigation from "../../hooks/useNavigation";
import useCloudProviderStatus from "../../hooks/useCloudProviderStatus";
import useObservabilityStatus from "../../hooks/useObservabilityStatus";
import {
    CloudWatchIcon, XRayIcon, AzureMonitorIcon, CloudMonitoringIcon,
    PrometheusIcon, DatadogIcon, ElkIcon, OpenSearchIcon, LokiIcon, FluentBitIcon,
    FluentdIcon, OpenTelemetryIcon, JaegerIcon, ZipkinIcon
} from "../layout/SidebarIcons";

// The 4 CSP-native tools have no separate "connect" step - they're
// available the instant the underlying cloud credential is configured
// (see pages/CloudWatch.jsx etc.'s own "no separate connection step"
// convention) - so their availability here is read straight off the
// same AWS/Azure/GCP configured checks every other summary card already
// makes, not a real overview fetch (CloudWatch's own overview call
// returns alarms/log groups, real work this glance card has no reason
// to pay for).
const CSP_TOOLS = [
    { key: "cloudwatch", label: "CloudWatch", tab: "cloudwatch", Icon: CloudWatchIcon, providerKey: "aws" },
    { key: "xray", label: "X-Ray", tab: "xray", Icon: XRayIcon, providerKey: "aws" },
    { key: "azuremonitor", label: "Azure Monitor", tab: "azuremonitor", Icon: AzureMonitorIcon, providerKey: "azure" },
    { key: "cloudmonitoring", label: "Cloud Monitoring", tab: "cloudmonitoring", Icon: CloudMonitoringIcon, providerKey: "gcp" }
];

const STANDALONE_TOOLS = [
    { key: "prometheus", label: "Prometheus", tab: "prometheus", Icon: PrometheusIcon },
    { key: "datadog", label: "Datadog", tab: "datadog", Icon: DatadogIcon },
    { key: "elk", label: "ELK", tab: "elk", Icon: ElkIcon },
    { key: "opensearch", label: "OpenSearch", tab: "opensearch", Icon: OpenSearchIcon },
    { key: "loki", label: "Loki", tab: "loki", Icon: LokiIcon },
    { key: "fluentbit", label: "Fluent Bit", tab: "fluentbit", Icon: FluentBitIcon },
    { key: "fluentd", label: "Fluentd", tab: "fluentd", Icon: FluentdIcon },
    { key: "opentelemetry", label: "OpenTelemetry", tab: "opentelemetry", Icon: OpenTelemetryIcon },
    { key: "jaeger", label: "Jaeger", tab: "jaeger", Icon: JaegerIcon },
    { key: "zipkin", label: "Zipkin", tab: "zipkin", Icon: ZipkinIcon }
];

// Observability's own slice of the Dashboard - same "hide if nothing
// configured" convention as Cloud Services/Container Registry/PaaS.
// CSP-native tool availability comes from the shared, deduped
// useCloudProviderStatus hook; standalone tools come from
// useObservabilityStatus - both shared with SystemHealthCard, which
// used to mean this data would otherwise be fetched twice.
export default function ObservabilitySummaryCard() {

    const { setTab } = useNavigation();
    const { awsConfigured, azureConfigured, gcpConfigured, loading: cloudLoading } = useCloudProviderStatus();
    const { status: standaloneConfigured, loading } = useObservabilityStatus();

    if (loading || cloudLoading) {
        return null;
    }

    const providerConfigured = { aws: awsConfigured, azure: azureConfigured, gcp: gcpConfigured };
    const visibleCsp = CSP_TOOLS.filter((tool) => providerConfigured[tool.providerKey]);
    const visibleStandalone = STANDALONE_TOOLS.filter((tool) => standaloneConfigured[tool.key]);
    const visible = [...visibleCsp, ...visibleStandalone];

    if (visible.length === 0) {
        return null;
    }

    return (

        <div className="card">

            <h2 className="card-title">Observability</h2>

            <div className="quick-access-grid">

                {visible.map((tool) => (

                    <button key={tool.tab} type="button" className="quick-access-tile" onClick={() => setTab(tool.tab)}>
                        <span className="quick-access-tile-icon"><tool.Icon /></span>
                        <span className="quick-access-tile-label">{tool.label}</span>
                    </button>

                ))}

            </div>

        </div>

    );

}
