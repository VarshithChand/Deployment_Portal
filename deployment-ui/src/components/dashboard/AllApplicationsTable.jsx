import { useEffect, useState } from "react";

import usePaasApplications from "../../hooks/usePaasApplications";
import usePagination from "../../hooks/usePagination";
import useNavigation from "../../hooks/useNavigation";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import StateBadge from "../cloudServices/StateBadge";

const PAGE_SIZE = 10;

// A Dashboard-level glance at every PaaS application, reusing the exact
// same real data the "All Applications" hub page already fetches (GET
// /api/paas/applications - AWS Elastic Beanstalk + Azure App Service +
// GCP Cloud Run in one call), deduped with PaasSummaryCard's identical
// call via usePaasApplications. Row click and "View All" both go to
// that same hub page for real management - not a second detail view
// built here.
export default function AllApplicationsTable() {

    const { setTab } = useNavigation();
    const { data } = usePaasApplications();

    const [search, setSearch] = useState("");

    const apps = data?.applications || [];

    const filtered = apps.filter((a) => {

        const q = search.trim().toLowerCase();

        if (!q) return true;

        return [a.name, a.environment, a.region, a.status, a.version].filter(Boolean).some((v) => v.toLowerCase().includes(q));

    });

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filtered, PAGE_SIZE);

    useEffect(() => { setPage(1); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!data || apps.length === 0) {
        return null;
    }

    return (

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>All Applications</h2>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setTab("paasHub")}>View All →</button>
            </div>

            <SearchBox placeholder="Search applications..." value={search} onChange={setSearch} />

            <div className="table-scroll" style={{ marginTop: "12px" }}>

                <table className="table">

                    <thead>
                        <tr>
                            <th>Application</th>
                            <th>Provider</th>
                            <th>Environment</th>
                            <th>Status</th>
                            <th>Version</th>
                        </tr>
                    </thead>

                    <tbody>

                        {pageItems.map((a, index) => (

                            <tr key={`${a.provider}-${a.name}-${index}`} className="table-row-clickable" onClick={() => setTab("paasHub")}>
                                <td>{a.name}</td>
                                <td><span className="badge badge-secondary">{a.provider}</span></td>
                                <td>{a.environment || "—"}</td>
                                <td><StateBadge state={a.status} /></td>
                                <td className="smoke-test-metric-mono">{a.version || "—"}</td>
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

        </div>

    );

}
