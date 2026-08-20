import { useGithubResources } from "../hooks/useGithubResources";

import PageLayout from "../components/layout/PageLayout";

import SystemHealthCard from "../components/dashboard/SystemHealthCard";
import IntegrationFlowCard from "../components/dashboard/IntegrationFlowCard";
import OverviewStats from "../components/dashboard/OverviewStats";
import DeploymentActivityCard from "../components/dashboard/DeploymentActivityCard";
import AllApplicationsTable from "../components/dashboard/AllApplicationsTable";
import SourceControlSummaryCard from "../components/dashboard/SourceControlSummaryCard";
import AllRepositoriesCard from "../components/dashboard/AllRepositoriesCard";
import AzureDevOpsCard from "../components/dashboard/AzureDevOpsCard";
import CloudServicesCard from "../components/dashboard/CloudServicesCard";
import PaasSummaryCard from "../components/dashboard/PaasSummaryCard";
import ContainerRegistrySummaryCard from "../components/dashboard/ContainerRegistrySummaryCard";
import CodeQualitySummaryCard from "../components/dashboard/CodeQualitySummaryCard";
import ObservabilitySummaryCard from "../components/dashboard/ObservabilitySummaryCard";
import EnvironmentsCard from "../components/dashboard/EnvironmentsCard";
import QuickAccessCard from "../components/dashboard/QuickAccessCard";

// "One container, then drill in" ordering (see security_findings.txt's
// Round 94 entry): SystemHealthCard is the single place every connected
// integration's real status/response-time lives - what used to require
// scanning 6+ separate summary cards to answer "is everything OK right
// now." IntegrationFlowCard answers "how does it all connect" right
// below it. Everything after that is unchanged in spirit from the prior
// redesign - resource counts, activity, applications, then the per-area
// detail cards (Source Control gets the same compact-glance-then-full-
// browser split every other area already has), Quick Access last as a
// standing navigation aid.
//
// Every card still fetches through its OWN hook call, but almost all of
// those hooks are now the shared ones in src/hooks/ (useCloudProviderStatus,
// useSharedCloudInventories, usePaasApplications, useGithubDeploymentActivity,
// useContainerRegistryStatus, useSonarStatus, useObservabilityStatus,
// useAzureDevOpsStatus) - the same underlying data is deduped across
// however many cards ask for it, instead of each card firing its own
// request the way this Dashboard used to. Dashboard.jsx itself is still
// a plain composition with no data of its own beyond `repository`.
export default function Dashboard() {

    // Only `repository` is still needed here - it tells AllRepositoriesCard
    // which card to mark "Current". branches/artifacts/workflows backed the
    // removed Repository Statistics card; still fetched by the shared hook
    // (Deploy needs them too) but no longer read on this page.
    //
    // Deliberately NOT blocking the page on `loading` here anymore - this
    // hook's loading starts true and only clears once AuthContext's own
    // bootstrap check resolves, so gating the whole Dashboard behind it
    // meant the page title and every card's own shell sat behind a blank
    // spinner for a full network round trip. Each card already manages its
    // own loading/empty state independently - none of them actually needed
    // this page-level gate to behave correctly, only to paint later than
    // they had to.
    const { repository, error } = useGithubResources({ includeRepository: true });

    return (

        <PageLayout title="Overview">

            {

                error &&

                <div className="error-message">

                    {error}

                </div>

            }

            <SystemHealthCard />

            <br />

            <IntegrationFlowCard />

            <br />

            <OverviewStats />

            <br />

            <DeploymentActivityCard />

            <br />

            <AllApplicationsTable />

            <br />

            <SourceControlSummaryCard />

            <br />

            <AllRepositoriesCard repository={repository}>
                <AzureDevOpsCard />
            </AllRepositoriesCard>

            <br />

            <CloudServicesCard />

            <br />

            <PaasSummaryCard />

            <br />

            <ContainerRegistrySummaryCard />

            <br />

            <CodeQualitySummaryCard />

            <br />

            <ObservabilitySummaryCard />

            <br />

            <EnvironmentsCard />

            <br />

            <QuickAccessCard />

        </PageLayout>

    );

}
