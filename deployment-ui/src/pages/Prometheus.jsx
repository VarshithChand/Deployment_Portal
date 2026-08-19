import PageLayout from "../components/layout/PageLayout";
import ObservabilityHostView from "../components/observability/ObservabilityHostView";

export default function Prometheus() {

    return (
        <PageLayout title="Prometheus">
            <ObservabilityHostView provider="prometheus" label="Prometheus" />
        </PageLayout>
    );

}
