import { useEffect, useState } from "react";

import { getLambdaFunctions } from "../../services/cloudServicesService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";

const PAGE_SIZE = 10;

// Read-only for now (see section 34 of the request this came from - no
// fake buttons) - Invoke/Update/Configure/Delete all need real UI of
// their own (a payload editor for Invoke, an env-var/role editor for
// Configure) that isn't built yet. Open AWS Console covers those until
// they are.
export default function LambdaManagementPage({ refreshToken }) {

    const [list, setList] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    async function load() {

        setLoading(true);

        try {
            setList(await getLambdaFunctions());
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

    const functions = list?.functions || [];

    const filtered = functions.filter((f) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return f.name.toLowerCase().includes(q) || f.runtime.toLowerCase().includes(q);
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
                    Enter your AWS credentials in Settings → Credentials → AWS to see Lambda functions.
                </p>
            </div>
        );

    }

    if (list.error) {

        return (
            <div className="card">
                <p className="error-message">Unable to load Lambda resources.</p>
                <p className="field-hint">{list.error}</p>
                <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>
            </div>
        );

    }

    return (

        <>

            <div className="cloud-service-stat-grid">
                <div className="cloud-service-stat-tile"><span>Total Functions</span><strong>{functions.length}</strong></div>
            </div>

            <div className="card">

                <h2 className="card-title">Functions</h2>

                <SearchBox placeholder="Search function or runtime..." value={search} onChange={setSearch} />

                {filtered.length === 0 ? (

                    <p className="empty-state">No Lambda functions found.</p>

                ) : (

                    <>

                        <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>Function</th>
                                        <th>Runtime</th>
                                        <th>Architecture</th>
                                        <th className="num">Memory (MB)</th>
                                        <th className="num">Timeout (s)</th>
                                        <th>Last Modified</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {pageItems.map((f) => (

                                        <tr key={f.name}>
                                            <td>{f.name}</td>
                                            <td className="smoke-test-metric-mono">{f.runtime}</td>
                                            <td>{f.architecture}</td>
                                            <td className="num">{f.memorySize}</td>
                                            <td className="num">{f.timeout}</td>
                                            <td>{f.lastModified ? new Date(f.lastModified).toLocaleString() : "—"}</td>
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
                Invoke, configuration editing, and delete aren't implemented in the Deployment Portal
                yet — use <strong>Open AWS Console</strong> above for those.
            </p>

        </>

    );

}
