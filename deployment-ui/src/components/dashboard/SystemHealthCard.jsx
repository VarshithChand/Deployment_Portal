import useNavigation from "../../hooks/useNavigation";
import useSystemHealthSummary from "../../hooks/useSystemHealthSummary";

function StatusPill({ configured, healthy }) {

    if (!configured) {
        return <span className="badge badge-secondary">Not Connected</span>;
    }

    return healthy
        ? <span className="badge badge-success">Healthy</span>
        : <span className="badge badge-danger">Needs Attention</span>;

}

// The Dashboard's own "every connection, one table" view - every row here
// is a real read of an already-connected integration (or a real "Not
// Connected" if it isn't), never a placeholder. The summary tiles that
// used to sit above this table (Overall Status/Connected/Healthy/etc)
// moved up into DashboardOverviewStrip's hero row - both read the exact
// same computation via useSystemHealthSummary, so nothing here changed
// except no longer duplicating those 5 numbers a second time further down
// the page.
export default function SystemHealthCard() {

    const { setTab } = useNavigation();
    const { rows } = useSystemHealthSummary();

    return (

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Connections</h2>
                <span className="field-hint" style={{ margin: 0 }}>Live status of every connected integration</span>
            </div>

            <div className="table-scroll" style={{ marginTop: "16px" }}>

                <table className="table">

                    <thead>
                        <tr>
                            <th>Integration</th>
                            <th>Category</th>
                            <th>Status</th>
                            <th>Response Time</th>
                        </tr>
                    </thead>

                    <tbody>

                        {rows.map((row) => (

                            <tr
                                key={row.key}
                                className={row.tab && row.configured ? "table-row-clickable" : ""}
                                onClick={row.tab && row.configured ? () => setTab(row.tab) : undefined}
                            >
                                <td>{row.label}</td>
                                <td><span className="field-hint" style={{ margin: 0 }}>{row.category}</span></td>
                                <td><StatusPill configured={row.configured} healthy={row.healthy} /></td>
                                <td className="smoke-test-metric-mono">
                                    {row.configured && row.tookMs != null ? `${row.tookMs}ms` : "—"}
                                </td>
                            </tr>

                        ))}

                    </tbody>

                </table>

            </div>

        </div>

    );

}
