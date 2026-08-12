import { useEffect, useState } from "react";

import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";

const PAGE_SIZE = 10;

// Reuses the account-wide inventory CloudServices.jsx already fetched
// (see settingsService.getMyAwsResources) rather than a separate call -
// S3's own tile there already lists bucket name + created date, exactly
// what this table needs. Read-only (section 34) - object browsing,
// versioning/encryption detail, and delete all need their own real
// implementation, not built yet.
export default function S3ManagementPage({ inventory }) {

    const [search, setSearch] = useState("");

    const buckets = inventory?.s3?.items || [];

    const filtered = buckets.filter((b) =>
        b.name.toLowerCase().includes(search.trim().toLowerCase())
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
                    Enter your AWS credentials in Settings → Credentials → AWS to see S3 buckets.
                </p>
            </div>
        );

    }

    if (inventory.s3?.error) {
        return <div className="card"><p className="error-message">Unable to load S3 resources.</p><p className="field-hint">{inventory.s3.error}</p></div>;
    }

    return (

        <>

            <div className="cloud-service-stat-grid">
                <div className="cloud-service-stat-tile"><span>Total Buckets</span><strong>{buckets.length}</strong></div>
            </div>

            <div className="card">

                <h2 className="card-title">Buckets</h2>

                <SearchBox placeholder="Search buckets..." value={search} onChange={setSearch} />

                {filtered.length === 0 ? (

                    <p className="empty-state">No S3 buckets found.</p>

                ) : (

                    <>

                        <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>Bucket</th>
                                        <th>Region</th>
                                        <th>Created</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {pageItems.map((b, index) => (

                                        <tr key={startIndex + index}>
                                            <td>{b.name}</td>
                                            <td>{inventory.region || "—"}</td>
                                            <td>{b.detail || "—"}</td>
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
                Object browsing, versioning/encryption detail, and bucket deletion aren't implemented in
                the Deployment Portal yet — use <strong>Open AWS Console</strong> above for those.
            </p>

        </>

    );

}
