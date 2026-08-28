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
import BlockersSummaryCard from "../components/dashboard/BlockersSummaryCard";
import ErrorsSummaryCard from "../components/dashboard/ErrorsSummaryCard";

// One screen, no page scroll - a dense CSS grid (.dashboard-grid, see
// global.css) instead of the long single-column stack this page used to
// be. Every card below is completely unchanged internally; only WHERE
// each one sits and how tall its own slot is changed. Each grid cell's
// .card scrolls its own overflow (global.css's `.dashboard-grid .card`
// rule) instead of the page growing past the viewport - a long table or
// list inside one panel gets its own small scrollbar, same as any real
// ops dashboard, rather than pushing everything below it further down
// the page.
//
// Column spans below sum to 12 per row on purpose (CSS grid's default
// auto-flow wraps to a new row the moment a row's tracks fill up, so the
// explicit `grid-template-rows` in global.css lines up with this order
// without any manual grid-row assignment):
//   Row 1 (auto height)  - OverviewStats                              (12)
//   Row 2 (tallest)       - Connections / Runs / Blockers            (4+5+3)
//   Row 3                 - Monitoring / Errors / Domain / Cloud      (3×4)
//   Row 4 (compact)       - 6 smaller integration summaries           (2×6)
//   Row 5                 - Applications table / Repositories table   (6+6)
// "Connections" = SystemHealthCard (every integration's live status),
// "Runs" = DeploymentActivityCard, "Blockers" = pending approvals,
// "Domain" = EnvironmentsCard (each environment's own deployed URL) -
// the closest existing concept to "domain" this app tracks.
//
// Below ~1100px width (global.css) the grid reverts to a normal
// full-width scrolling stack - a 12-column dense layout stops being
// legible once panels get that narrow, so tablet/mobile gets the old
// straightforward-scroll behavior back instead of illegible slivers.
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

            <div className="dashboard-grid">

                <div style={{ gridColumn: "span 12" }}>
                    <OverviewStats />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <SystemHealthCard />
                </div>

                <div style={{ gridColumn: "span 5" }}>
                    <DeploymentActivityCard />
                </div>

                <div style={{ gridColumn: "span 3" }}>
                    <BlockersSummaryCard />
                </div>

                <div style={{ gridColumn: "span 3" }}>
                    <ObservabilitySummaryCard />
                </div>

                <div style={{ gridColumn: "span 3" }}>
                    <ErrorsSummaryCard />
                </div>

                <div style={{ gridColumn: "span 3" }}>
                    <EnvironmentsCard />
                </div>

                <div style={{ gridColumn: "span 3" }}>
                    <CloudServicesCard />
                </div>

                <div style={{ gridColumn: "span 2" }}>
                    <IntegrationFlowCard />
                </div>

                <div style={{ gridColumn: "span 2" }}>
                    <SourceControlSummaryCard />
                </div>

                <div style={{ gridColumn: "span 2" }}>
                    <PaasSummaryCard />
                </div>

                <div style={{ gridColumn: "span 2" }}>
                    <ContainerRegistrySummaryCard />
                </div>

                <div style={{ gridColumn: "span 2" }}>
                    <CodeQualitySummaryCard />
                </div>

                <div style={{ gridColumn: "span 2" }}>
                    <QuickAccessCard />
                </div>

                <div style={{ gridColumn: "span 6" }}>
                    <AllApplicationsTable />
                </div>

                <div style={{ gridColumn: "span 6" }}>
                    <AllRepositoriesCard repository={repository}>
                        <AzureDevOpsCard />
                    </AllRepositoriesCard>
                </div>

            </div>

        </PageLayout>

    );

}
