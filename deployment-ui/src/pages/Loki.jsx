import PageLayout from "../components/layout/PageLayout";
import ObservabilityHostView from "../components/observability/ObservabilityHostView";

export default function Loki() {

    return (
        <PageLayout title="Loki">
            <ObservabilityHostView provider="loki" label="Loki" />
        </PageLayout>
    );

}
