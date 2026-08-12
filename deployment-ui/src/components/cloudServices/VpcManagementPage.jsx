import { useEffect, useState } from "react";

import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";

const PAGE_SIZE = 10;

// Reuses the account-wide inventory (same reasoning as S3ManagementPage).
// Only VPCs themselves for now - subnets/route tables/security groups/
// internet & NAT gateways all need their own dedicated AWS calls this
// portal doesn't make yet (section 20 explicitly allows deferring these:
// "do not provide destructive editing unless the backend has a proper
// implementation"). Open AWS Console covers the rest of the VPC console.
export default function VpcManagementPage({ inventory }) {

    const [search, setSearch] = useState("");

    const vpcs = inventory?.vpc?.items || [];

    const filtered = vpcs.filter((v) =>
        v.name.toLowerCase().includes(search.trim().toLowerCase())
    );

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(filtered, PAGE_SIZE);

    useEffect(() => {
        setPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    if (!inventory) {
        return <div className="card"><p className="empty-state">Loading AWS resources...</p></div>;
    }

    if (!inventory.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Enter your AWS credentials in Settings → Credentials → AWS to see VPCs.
                </p>
            </div>
        );

    }

    if (inventory.vpc?.error) {
        return <div className="card"><p className="error-message">Unable to load VPC resources.</p><p className="field-hint">{inventory.vpc.error}</p></div>;
    }

    return (

        <>

            <div className="cloud-service-stat-grid">
                <div className="cloud-service-stat-tile"><span>VPCs</span><strong>{vpcs.length}</strong></div>
            </div>

            <div className="card">

                <h2 className="card-title">VPCs</h2>

                <SearchBox placeholder="Search VPCs..." value={search} onChange={setSearch} />

                {filtered.length === 0 ? (

                    <p className="empty-state">No VPCs found.</p>

                ) : (

                    <>

                        <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>Name / ID</th>
                                        <th>CIDR</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {pageItems.map((v, index) => (

                                        <tr key={startIndex + index}>
                                            <td>{v.name}</td>
                                            <td className="smoke-test-metric-mono">{v.detail || "—"}</td>
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
                Subnets, route tables, security groups, and internet/NAT gateways aren't implemented in
                the Deployment Portal yet — use <strong>Open AWS Console</strong> above for those.
            </p>

        </>

    );

}
