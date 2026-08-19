import PageLayout from "../components/layout/PageLayout";
import ObservabilityHostView from "../components/observability/ObservabilityHostView";

export default function Elk() {

    return (
        <PageLayout title="ELK">
            <ObservabilityHostView provider="elk" label="ELK" />
        </PageLayout>
    );

}
