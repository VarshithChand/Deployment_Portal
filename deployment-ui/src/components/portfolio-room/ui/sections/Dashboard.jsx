import { DASHBOARD } from "../../data/dashboard";
import { PROJECTS } from "../../data/projects";
import { ALL_SKILLS } from "../../data/skills";

export default function Dashboard() {

    return (

        <div className="proom-dashboard mono">

            <table className="proom-dashboard-table">
                <thead>
                    <tr><th>SERVICES</th><th>STATUS</th></tr>
                </thead>
                <tbody>
                    {DASHBOARD.services.map((s) => (
                        <tr key={s.name}>
                            <td>{s.name}</td>
                            <td><span className={`proom-status-dot ${s.status}`} /> {s.status.toUpperCase()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="proom-dashboard-metrics">
                <div><span className="proom-metric-num">{DASHBOARD.illustrativeDeployments}</span><span>DEPLOYMENTS</span></div>
                <div><span className="proom-metric-num">{String(PROJECTS.length).padStart(2, "0")}</span><span>PROJECTS</span></div>
                <div><span className="proom-metric-num">{ALL_SKILLS.length}</span><span>TECHNOLOGIES</span></div>
            </div>

            <p className="proom-dashboard-note">
                Illustrative portfolio counters, not a live production monitoring feed.
            </p>

        </div>

    );

}
