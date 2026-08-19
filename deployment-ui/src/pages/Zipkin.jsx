import PageLayout from "../components/layout/PageLayout";
import ObservabilityHostView from "../components/observability/ObservabilityHostView";

export default function Zipkin() {

    return (
        <PageLayout title="Zipkin">
            <ObservabilityHostView provider="zipkin" label="Zipkin" />
        </PageLayout>
    );

}
