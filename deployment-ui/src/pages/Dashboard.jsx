import { useGithubResources } from "../hooks/useGithubResources";

import PageLayout from "../components/layout/PageLayout";

import OverviewStats from "../components/dashboard/OverviewStats";
import DeploymentActivityCard from "../components/dashboard/DeploymentActivityCard";
import AllApplicationsTable from "../components/dashboard/AllApplicationsTable";
import AllRepositoriesCard from "../components/dashboard/AllRepositoriesCard";
import AzureDevOpsCard from "../components/dashboard/AzureDevOpsCard";
import CloudServicesCard from "../components/dashboard/CloudServicesCard";
import PaasSummaryCard from "../components/dashboard/PaasSummaryCard";
import ContainerRegistrySummaryCard from "../components/dashboard/ContainerRegistrySummaryCard";
import ObservabilitySummaryCard from "../components/dashboard/ObservabilitySummaryCard";
import EnvironmentsCard from "../components/dashboard/EnvironmentsCard";
import QuickAccessCard from "../components/dashboard/QuickAccessCard";

// "At a glance, then drill in" ordering (see security_findings.txt's own
// Round entry for this redesign): a real top-line stat row, real
// deployment activity, a real cross-provider application table, THEN
// the per-area cards (Source Control, Cloud Services, PaaS, Container
// Registry, Observability, Environments) for anyone who wants the detail
// behind any one of those numbers, and Quick Access last as a standing
// navigation aid. Every section still owns its own fetch/hide-if-
// unconfigured logic - Dashboard itself stays a plain composition, same
// as before.
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
    // own loading/empty state independently (AllRepositoriesCard,
    // AwsServicesCard, EnvironmentsCard all gate their own fetch on
    // githubTokenConfigured themselves) - none of them actually needed this
    // page-level gate to behave correctly, only to paint later than they
    // had to.
    const { repository, error } = useGithubResources({ includeRepository: true });

    return (

        <PageLayout title="Overview">

            {

                error &&

                <div className="error-message">

                    {error}

                </div>

            }

            <OverviewStats />

            <br />

            <DeploymentActivityCard />

            <br />

            <AllApplicationsTable />

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

            <ObservabilitySummaryCard />

            <br />

            <EnvironmentsCard />

            <br />

            <QuickAccessCard />

        </PageLayout>

    );

}
