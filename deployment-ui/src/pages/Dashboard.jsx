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
import ObservabilitySummaryCard from "../components/dashboard/ObservabilitySummaryCard";
import EnvironmentsCard from "../components/dashboard/EnvironmentsCard";
import QuickAccessCard from "../components/dashboard/QuickAccessCard";
import BlockersSummaryCard from "../components/dashboard/BlockersSummaryCard";
import ErrorsSummaryCard from "../components/dashboard/ErrorsSummaryCard";

// One screen, no page scroll - a dense CSS grid (.dashboard-grid, see
// global.css). Every card below is completely unchanged internally; only
// WHERE each one sits and how tall its own slot is changed. Each grid
// cell's .card scrolls its own overflow internally instead of the page
// growing past the viewport.
//
// Round 2 of this layout (first pass crammed 6 summary cards into
// span-2 slivers - unreadable, see the truncated "Azur...", "DevC..."
// labels that prompted this rework). Two real fixes this time, not just
// narrower columns:
//   - SystemHealthCard ("Connections") gets its OWN full-width row. Its
//     5 stat tiles use a `minmax(260px,1fr)` auto-fit grid internally -
//     squeezed into a shared 4-of-12-column slot, they had nowhere to go
//     but stack into 5 separate rows, pushing its own status table out
//     of view and forcing a stray horizontal scrollbar. Full width lets
//     them lay out in one row like they're meant to.
//   - PaasSummaryCard/ContainerRegistrySummaryCard/CodeQualitySummaryCard
//     are dropped from this page entirely - SystemHealthCard's own
//     status table already lists every one of those same integrations
//     by category (see the screenshot that prompted this: "Container
//     Registries / Container Registry / Healthy" is already a row
//     there). They were duplicate information taking up a whole slot
//     each, not information this page was missing - still reachable
//     from the Sidebar like every other page, just not doubled up here.
//
// Column spans below sum to 12 per row on purpose (CSS grid's default
// auto-flow wraps to a new row once a row's tracks fill up, so the
// explicit `grid-template-rows` in global.css lines up with this order
// without any manual grid-row assignment):
//   Row 1 (auto)     - OverviewStats                                (12)
//   Row 2             - Connections (SystemHealthCard), full width   (12)
//   Row 3 (tallest)   - Runs / Blockers                             (8+4)
//   Row 4             - Monitoring / Errors / Domain               (4×3)
//   Row 5             - Cloud Services / Source Control / Flow    (5+4+3)
//   Row 6 (shortest)  - Quick Access / Applications / Repositories  (4×3)
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

                <div style={{ gridColumn: "span 12" }}>
                    <SystemHealthCard />
                </div>

                <div style={{ gridColumn: "span 8" }}>
                    <DeploymentActivityCard />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <BlockersSummaryCard />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <ObservabilitySummaryCard />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <ErrorsSummaryCard />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <EnvironmentsCard />
                </div>

                <div style={{ gridColumn: "span 5" }}>
                    <CloudServicesCard />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <SourceControlSummaryCard />
                </div>

                <div style={{ gridColumn: "span 3" }}>
                    <IntegrationFlowCard />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <QuickAccessCard />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <AllApplicationsTable />
                </div>

                <div style={{ gridColumn: "span 4" }}>
                    <AllRepositoriesCard repository={repository}>
                        <AzureDevOpsCard />
                    </AllRepositoriesCard>
                </div>

            </div>

        </PageLayout>

    );

}
