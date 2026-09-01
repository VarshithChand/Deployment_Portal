import { useGithubResources } from "../hooks/useGithubResources";

import PageLayout from "../components/layout/PageLayout";

import DashboardOverviewStrip from "../components/dashboard/DashboardOverviewStrip";
import SystemHealthCard from "../components/dashboard/SystemHealthCard";
import IntegrationFlowCard from "../components/dashboard/IntegrationFlowCard";
import DeploymentActivityCard from "../components/dashboard/DeploymentActivityCard";
import AllApplicationsTable from "../components/dashboard/AllApplicationsTable";
import SourceControlSummaryCard from "../components/dashboard/SourceControlSummaryCard";
import AllRepositoriesCard from "../components/dashboard/AllRepositoriesCard";
import AzureDevOpsCard from "../components/dashboard/AzureDevOpsCard";
import CloudServicesCard from "../components/dashboard/CloudServicesCard";
import ObservabilitySummaryCard from "../components/dashboard/ObservabilitySummaryCard";
import EnvironmentsCard from "../components/dashboard/EnvironmentsCard";
import QuickAccessCard from "../components/dashboard/QuickAccessCard";
import BlockersSummaryCard from "../components/dashboard/BlockersSummaryCard";
import ErrorsSummaryCard from "../components/dashboard/ErrorsSummaryCard";

// Round 6 - rounds 1-3 used CSS Grid and kept hitting the same bug in
// different shapes: every card in the same grid ROW is forced to the
// height of that row's tallest card. Round 5 replaced the grid with
// three independent flex columns to kill that - but then split the page
// into TWO separate column groups (a 3-column row of summary cards,
// followed by a separate 2-column row for the Applications/Repositories
// tables). That reintroduced the exact same problem one level up: the
// "Environments" column is short (one card), its neighbors aren't, and
// the second group couldn't start until the FIRST group's tallest column
// finished - so a visible gap sat under "Environments" while the row
// above it was still "in progress" height-wise. A screenshot caught it.
//
// Fix: there is only ONE column group now. Applications and Repositories
// are just two more cards appended to the end of the Monitoring/Domain/
// Cloud-Services column and the Source-Control/Integration-Flow/Quick-
// Access column respectively (marked .dash-card-lg for their taller
// height cap), instead of a second row that has to wait for the first to
// finish. A short column just keeps flowing into whatever's assigned
// next - there is no row boundary left for a height mismatch to stall on.
//
// Layout, top to bottom:
//   Hero strip (resource counts + health tiles, or the onboarding banner) - full width
//   Connections (the detailed per-integration table)                      - full width
//   Three persistent columns:
//     Runs, Errors, Blockers                                        (wider column)
//     Monitoring, Domain (Environments), Cloud Services, Applications table
//     Source Control, Integration Flow, Quick Access, Repositories table
// "Domain" = EnvironmentsCard (each environment's own deployed URL) - the
// closest existing concept to "domain" this app tracks. Runs/Errors/
// Blockers share a column because they're causally linked (what's
// running, what just failed, what's waiting on a human) - reading them
// top-to-bottom in one place tells one story instead of three scattered
// ones.
//
// Below ~1100px width (global.css) every column collapses into one
// full-width stack.
export default function Dashboard() {

    // Only `repository` is still needed here - it tells AllRepositoriesCard
    // which card to mark "Current". branches/artifacts/workflows backed a
    // removed Repository Statistics card; still fetched by the shared hook
    // (Deploy needs them too) but no longer read on this page.
    //
    // Deliberately NOT blocking the page on `loading` here - this hook's
    // loading starts true and only clears once AuthContext's own bootstrap
    // check resolves, so gating the whole Dashboard behind it meant the
    // page title and every card's own shell sat behind a blank spinner for
    // a full network round trip. Each card already manages its own
    // loading/empty state independently.
    const { repository, error } = useGithubResources({ includeRepository: true });

    return (

        <PageLayout title="Overview">

            {

                error &&

                <div className="error-message">

                    {error}

                </div>

            }

            <div className="dashboard-page">

                <DashboardOverviewStrip />

                <div className="dash-card-lg">
                    <SystemHealthCard />
                </div>

                <div className="dashboard-columns">

                    <div className="dashboard-column dashboard-column-wide">
                        <DeploymentActivityCard />
                        <ErrorsSummaryCard />
                        <BlockersSummaryCard />
                    </div>

                    <div className="dashboard-column">
                        <ObservabilitySummaryCard />
                        <EnvironmentsCard />
                        <CloudServicesCard />
                        <div className="dash-card-lg">
                            <AllApplicationsTable />
                        </div>
                    </div>

                    <div className="dashboard-column">
                        <SourceControlSummaryCard />
                        <IntegrationFlowCard />
                        <QuickAccessCard />
                        <div className="dash-card-lg">
                            <AllRepositoriesCard repository={repository}>
                                <AzureDevOpsCard />
                            </AllRepositoriesCard>
                        </div>
                    </div>

                </div>

            </div>

        </PageLayout>

    );

}
