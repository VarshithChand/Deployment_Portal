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

// Round 5 - the previous three rounds all used a single 12-column CSS
// Grid (.dashboard-grid) and kept hitting the same underlying bug in
// different shapes: every card placed in the same grid ROW is forced to
// the height of the tallest card in that row, whatever the others
// actually contain. Rounds 1-3 fixed the cases that bug showed up as
// (a fixed-fraction row claiming full height for an empty panel, then an
// auto-packed row doing the same) but a fourth screenshot caught it again
// in a new spot: AllApplicationsTable renders nothing when no PaaS apps
// are configured, and it shared a grid row with AllRepositoriesCard - the
// empty cell couldn't shrink below the row height Repositories set, so it
// sat there as a blank rectangle the width of half the page. Grid cannot
// avoid this without a masonry mode most browsers don't support, so this
// round replaces the grid itself: three independent flex columns
// (.dashboard-columns/.dashboard-column in global.css), each stacking its
// own cards top-to-bottom with its OWN height, never synced to what the
// columns beside it contain. A card that renders nothing just contributes
// nothing to its column's height - it can no longer leave blank space
// behind, because there's no shared row forcing a taller neighbor's
// height onto it.
//
// Layout, top to bottom:
//   Hero strip (resource counts + health tiles, or the onboarding banner) - full width
//   Connections (the detailed per-integration table)                      - full width
//   Three columns:
//     Runs, Errors, Blockers                              (wider column)
//     Monitoring, Domain (Environments), Cloud Services
//     Source Control, Integration Flow, Quick Access
//   Two columns:
//     Applications table   /   Repositories table
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
                    </div>

                    <div className="dashboard-column">
                        <SourceControlSummaryCard />
                        <IntegrationFlowCard />
                        <QuickAccessCard />
                    </div>

                </div>

                <div className="dashboard-columns">

                    <div className="dashboard-column dash-card-lg">
                        <AllApplicationsTable />
                    </div>

                    <div className="dashboard-column dash-card-lg">
                        <AllRepositoriesCard repository={repository}>
                            <AzureDevOpsCard />
                        </AllRepositoriesCard>
                    </div>

                </div>

            </div>

        </PageLayout>

    );

}
