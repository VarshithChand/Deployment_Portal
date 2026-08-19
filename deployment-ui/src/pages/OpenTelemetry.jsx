import PageLayout from "../components/layout/PageLayout";
import ObservabilityHostView from "../components/observability/ObservabilityHostView";

export default function OpenTelemetry() {

    return (
        <PageLayout title="OpenTelemetry">
            <ObservabilityHostView provider="opentelemetry" label="OpenTelemetry" />
        </PageLayout>
    );

}
