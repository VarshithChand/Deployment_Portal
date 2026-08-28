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

// A dense 12-column CSS grid (.dashboard-grid, see global.css) instead of
// the long single-column stack this page used to be. Every card below is
// completely unchanged internally; only WHERE each one sits, how wide its
// slot is, and how tall it's ALLOWED to grow changed.
//
// Round 3 of this layout. Round 1 crammed 6 summary cards into span-2
// slivers (unreadable). Round 2 fixed that but forced the whole grid to a
// fixed viewport-height split into fixed-fraction rows, which assumed
// every panel always has something to show - a screenshot caught
// DeploymentActivityCard (Runs) and BlockersSummaryCard both rendering
// nothing (no runs yet, no pending approvals) and their WHOLE row still
// claiming its full height share as blank space, which squeezed every
// row after it. Rows now size to their own content instead
// (grid-auto-rows:min-content in global.css) - an empty panel just takes
// the small height its empty-state message needs, freeing that space for
// whatever comes next rather than permanently reserving it. Each .card
// still caps its own height and scrolls internally, so one panel with a
// lot of real content can't dominate the page - see .dash-card-lg below
// for the few panels (System Health, Applications, Repositories) that get
// a taller cap than the rest since they carry genuinely more content.
//
// This trades a hard guarantee of zero page scroll (Round 2's promise,
// which broke down the moment a panel's content varied) for a layout
// that never shows a dead-space band regardless of which integrations
// happen to be connected in a given environment - in practice, on an
// account with most things configured, everything still fits in view;
// on a sparser one, whatever's genuinely missing just takes less room
// instead of a placeholder that looks broken.
//
// Column spans below sum to 12 per row on purpose (CSS grid's default
// auto-flow wraps to a new row once a row's tracks fill up):
//   OverviewStats                                                  (12)
//   Connections (SystemHealthCard), full width - its 5 stat tiles
//     need real width to lay out in one line instead of stacking     (12)
//   Runs / Blockers                                                (8+4)
//   Monitoring / Errors / Domain                                  (4×3)
//   Cloud Services / Source Control / Integration Flow           (5+4+3)
//   Quick Access / Applications table / Repositories table         (4×3)
// "Domain" = EnvironmentsCard (each environment's own deployed URL) -
// the closest existing concept to "domain" this app tracks.
//
// PaasSummaryCard/ContainerRegistrySummaryCard/CodeQualitySummaryCard are
// deliberately NOT here - SystemHealthCard's own status table already
// lists every one of those same integrations by category, so they were
// duplicate information taking up a whole slot each. Still reachable
// from the Sidebar like every other page, just not doubled up here.
//
// Below ~1100px width (global.css) the grid drops to one column and
// every panel goes full-width - a 12-column dense layout stops being
// legible once panels get that narrow.
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

                <div className="dash-card-lg" style={{ gridColumn: "span 12" }}>
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

                <div className="dash-card-lg" style={{ gridColumn: "span 4" }}>
                    <AllApplicationsTable />
                </div>

                <div className="dash-card-lg" style={{ gridColumn: "span 4" }}>
                    <AllRepositoriesCard repository={repository}>
                        <AzureDevOpsCard />
                    </AllRepositoriesCard>
                </div>

            </div>

        </PageLayout>

    );

}
