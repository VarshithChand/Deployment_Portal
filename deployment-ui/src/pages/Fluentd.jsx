import PageLayout from "../components/layout/PageLayout";
import ObservabilityHostView from "../components/observability/ObservabilityHostView";

export default function Fluentd() {

    return (
        <PageLayout title="Fluentd">
            <ObservabilityHostView provider="fluentd" label="Fluentd" />
        </PageLayout>
    );

}
