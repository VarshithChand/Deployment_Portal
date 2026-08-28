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

// Round 4 - a real rework, not another span/order shuffle on the same
// skeleton. Two things drove it:
//
// 1. A production DB swap wiped every saved credential mid-session, and
//    the round-3 layout responded to "nothing connected" with a wall of
//    separate "Not Connected"/"0" cards - technically correct, but reads
//    as broken rather than empty. DashboardOverviewStrip now owns that
//    decision once, centrally: zero integrations connected swaps the
//    entire hero row for one onboarding banner with a single next action,
//    instead of a dozen panels each saying the same "nothing here" thing
//    their own way.
// 2. System Health's own 5 summary tiles (Overall Status/Connected/
//    Healthy/etc) used to sit stacked directly above its own Connections
//    table, both fighting for the same "how's everything doing" job. The
//    tiles moved into the hero strip (SystemHealthTiles, reading the same
//    useSystemHealthSummary the table reads - see that hook and
//    SystemHealthCard) so the table further down is free to just be the
//    table, and the hero strip is one place that answers "is anything
//    wrong" before scrolling to a single row of it.
//
// Everything below the hero keeps round 3's content-adaptive grid
// (grid-auto-rows:min-content, per-card max-height + internal scroll -
// see .dashboard-grid in global.css) since that part was working: no
// panel's empty state can starve another panel's height anymore. What
// changed is the grouping itself:
//   Hero strip (resource counts + health tiles, or the onboarding banner)  (12)
//   Connections (the detailed per-integration table)                      (12)
//   Runs                              /  Errors + Blockers stacked        (8+4)
//   Monitoring / Domain / Cloud Services                                (4×3)
//   Source Control / Integration Flow / Quick Access                    (4×3)
//   Applications table          /  Repositories table                     (6+6)
// "Domain" = EnvironmentsCard (each environment's own deployed URL) - the
// closest existing concept to "domain" this app tracks. Applications and
// Repositories each get half the page's width now instead of sharing a
// row with Quick Access - both are real data tables and benefit more from
// width than the summary cards around them do.
//
// Below ~1100px width (global.css) the grid drops to one column and every
// panel goes full-width.
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

            <div className="dashboard-grid">

                <div style={{ gridColumn: "span 12" }}>
                    <DashboardOverviewStrip />
                </div>

                <div className="dash-card-lg" style={{ gridColumn: "span 12" }}>
                    <SystemHealthCard />
                </div>

                <div style={{ gridColumn: "span 8" }}>
                    <DeploymentActivityCard />
                </div>

                <div style={{ gridColumn: "span 4", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <ErrorsSummaryCard />
                    <BlockersSummaryCard />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <ObservabilitySummaryCard />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <EnvironmentsCard />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <CloudServicesCard />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <SourceControlSummaryCard />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <IntegrationFlowCard />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <QuickAccessCard />
                </div>

                <div className="dash-card-lg" style={{ gridColumn: "span 6" }}>
                    <AllApplicationsTable />
                </div>

                <div className="dash-card-lg" style={{ gridColumn: "span 6" }}>
                    <AllRepositoriesCard repository={repository}>
                        <AzureDevOpsCard />
                    </AllRepositoriesCard>
                </div>

            </div>

        </PageLayout>

    );

}
