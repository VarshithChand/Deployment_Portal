import PageLayout from "../components/layout/PageLayout";
import ObservabilityHostView from "../components/observability/ObservabilityHostView";

export default function Jaeger() {

    return (
        <PageLayout title="Jaeger">
            <ObservabilityHostView provider="jaeger" label="Jaeger" />
        </PageLayout>
    );

}
