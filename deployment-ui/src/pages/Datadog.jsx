import PageLayout from "../components/layout/PageLayout";
import ObservabilityHostView from "../components/observability/ObservabilityHostView";

export default function Datadog() {

    return (
        <PageLayout title="Datadog">
            <ObservabilityHostView provider="datadog" label="Datadog" />
        </PageLayout>
    );

}
