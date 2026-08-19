import PageLayout from "../components/layout/PageLayout";
import ObservabilityHostView from "../components/observability/ObservabilityHostView";

export default function OpenSearch() {

    return (
        <PageLayout title="OpenSearch">
            <ObservabilityHostView provider="opensearch" label="OpenSearch" />
        </PageLayout>
    );

}
