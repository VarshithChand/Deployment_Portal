import useSystemHealthSummary from "../../hooks/useSystemHealthSummary";
import StatTile from "../charts/StatTile";

// The 5 "at a glance" health numbers (Overall Status/Connected/Healthy/
// Needs Attention/Avg Response Time), split out of SystemHealthCard so
// they can sit in DashboardOverviewStrip's hero row instead of stacked on
// top of the Connections table further down the page - see
// useSystemHealthSummary for where the numbers actually come from.
export default function SystemHealthTiles() {

    const { tiles } = useSystemHealthSummary();

    return (

        <div className="stat-grid">
            {tiles.map((tile) => (
                <StatTile key={tile.key} label={tile.label} value={tile.value} tone={tile.tone} sublabel={tile.sublabel} />
            ))}
        </div>

    );

}
