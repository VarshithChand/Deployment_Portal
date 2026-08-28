import useSystemHealthSummary from "../../hooks/useSystemHealthSummary";
import OverviewStats from "./OverviewStats";
import SystemHealthTiles from "./SystemHealthTiles";
import DashboardGetStartedBanner from "./DashboardGetStartedBanner";

// The Dashboard's hero row. When at least one integration is connected,
// this is the resource-count tiles (OverviewStats) and the health-summary
// tiles (SystemHealthTiles) stacked as one continuous strip - two
// .stat-grid rows read together, not two separate cards. When NOTHING is
// connected, both of those would just be a wall of zeros and "Not
// Connected" pills, which is exactly what read as "broken" rather than
// "empty" - so a single clear onboarding banner replaces them instead.
export default function DashboardOverviewStrip() {

    const { configuredCount } = useSystemHealthSummary();

    if (configuredCount === 0) {
        return <DashboardGetStartedBanner />;
    }

    return (
        <>
            <OverviewStats />
            <SystemHealthTiles />
        </>
    );

}
