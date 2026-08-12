import { useEffect, useState } from "react";

import { getRdsInstances } from "../../services/cloudServicesService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import StateBadge from "./StateBadge";

const PAGE_SIZE = 10;

// Read-only for now (section 34) - Start/Stop/Modify/Delete all need
// careful, well-tested implementations given a database is usually the
// single most consequential resource to get wrong. Open AWS Console
// covers those until they're built.
export default function RdsManagementPage({ refreshToken }) {

    const [list, setList] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    async function load() {

        setLoading(true);

        try {
            setList(await getRdsInstances());
        }
        catch (err) {
            console.error(err);
            setList({ configured: false, error: "Unable to reach the Deployment API." });
        }
        finally {
            setLoading(false);
        }

    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshToken]);

    const instances = list?.instances || [];

    const filtered = instances.filter((d) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return d.identifier.toLowerCase().includes(q) || d.engine.toLowerCase().includes(q);
    });

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(filtered, PAGE_SIZE);

    useEffect(() => {
        setPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    if (loading) {
        return <div className="card"><p className="empty-state">Loading AWS resources...</p></div>;
    }

    if (!list?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Enter your AWS credentials in Settings → Credentials → AWS to see RDS databases.
                </p>
            </div>
        );

    }

    if (list.error) {

        return (
            <div className="card">
                <p className="error-message">Unable to load RDS resources.</p>
                <p className="field-hint">{list.error}</p>
                <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>
            </div>
        );

    }

    const available = instances.filter((d) => d.status === "available").length;
    const stopped = instances.filter((d) => d.status === "stopped").length;

    return (

        <>

            <div className="cloud-service-stat-grid">
                <div className="cloud-service-stat-tile"><span>Databases</span><strong>{instances.length}</strong></div>
                <div className="cloud-service-stat-tile"><span>Available</span><strong>{available}</strong></div>
                <div className="cloud-service-stat-tile"><span>Stopped</span><strong>{stopped}</strong></div>
            </div>

            <div className="card">

                <h2 className="card-title">Databases</h2>

                <SearchBox placeholder="Search identifier or engine..." value={search} onChange={setSearch} />

                {filtered.length === 0 ? (

                    <p className="empty-state">No RDS databases found.</p>

                ) : (

                    <>

                        <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>DB Identifier</th>
                                        <th>Engine</th>
                                        <th>Version</th>
                                        <th>Status</th>
                                        <th>Instance Class</th>
                                        <th className="num">Storage (GB)</th>
                                        <th>Availability Zone</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {pageItems.map((d) => (

                                        <tr key={d.identifier}>
                                            <td>{d.identifier}</td>
                                            <td>{d.engine}</td>
                                            <td className="smoke-test-metric-mono">{d.engineVersion}</td>
                                            <td><StateBadge state={d.status} /></td>
                                            <td>{d.instanceClass}</td>
                                            <td className="num">{d.storageGb}</td>
                                            <td>{d.availabilityZone || "—"}</td>
                                        </tr>

                                    ))}

                                </tbody>

                            </table>

                        </div>

                        <Pagination
                            page={page}
                            pageCount={pageCount}
                            totalCount={totalCount}
                            startIndex={startIndex}
                            endIndex={endIndex}
                            onPageChange={setPage}
                        />

                    </>

                )}

            </div>

            <p className="field-hint">
                Start, stop, modify, and delete aren't implemented in the Deployment Portal yet — use
                <strong> Open AWS Console</strong> above for those.
            </p>

        </>

    );

}
