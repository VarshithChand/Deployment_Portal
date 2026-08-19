import PageLayout from "../components/layout/PageLayout";
import ObservabilityHostView from "../components/observability/ObservabilityHostView";

export default function FluentBit() {

    return (
        <PageLayout title="Fluent Bit">
            <ObservabilityHostView provider="fluentbit" label="Fluent Bit" />
        </PageLayout>
    );

}
