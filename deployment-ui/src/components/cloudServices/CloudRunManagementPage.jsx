import { useEffect, useState } from "react";

import { getCloudRunServices } from "../../services/containerServicesService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import CloudRunDetailPage from "./CloudRunDetailPage";

const PAGE_SIZE = 10;

// Section 18 - Cloud Run service list, real (list/scale/redeploy/delete -
// see CloudRunDetailPage's own comment on why there's no Stop).
export default function CloudRunManagementPage() {

    const [services, setServices] = useState(null);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);

    function load() {

        getCloudRunServices().then(setServices).catch((err) => {
            console.error(err);
            setServices({ configured: false, error: "Unable to reach the Deployment API." });
        });

    }

    useEffect(load, []);

    const list = services?.services || [];

    const filtered = list.filter((s) => {

        const q = search.trim().toLowerCase();

        if (!q) return true;

        return [s.name, s.location, s.image, s.url].filter(Boolean).some((v) => v.toLowerCase().includes(q));

    });

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filtered, PAGE_SIZE);

    useEffect(() => { setPage(1); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    if (selected) {

        return (
            <CloudRunDetailPage
                service={selected}
                onBack={() => setSelected(null)}
                onChanged={() => { load(); setSelected(null); }}
            />
        );

    }

    if (!services) {
        return <div className="card"><p className="empty-state">Loading GCP resources...</p></div>;
    }

    if (!services.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Enter your GCP credentials (Project ID, service account key, and a location) in
                    Settings → Credentials → GCP to manage Cloud Run.
                </p>
            </div>
        );

    }

    if (services.error) {

        return (
            <div className="card">
                <p className="error-message">Unable to load Cloud Run services.</p>
                <p className="field-hint">{services.error}</p>
                <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>
            </div>
        );

    }

    return (

        <div className="card">

            <h2 className="card-title">Cloud Run Services</h2>

            <SearchBox placeholder="Search name, location, image, or URL..." value={search} onChange={setSearch} />

            {filtered.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>
                    {list.length === 0 ? "No Cloud Run services found." : `No services match "${search}".`}
                </p>

            ) : (

                <>

                    <div className="table-scroll" style={{ marginTop: "12px" }}>

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Location</th>
                                    <th>Image</th>
                                    <th>Condition</th>
                                    <th className="num">Min / Max</th>
                                </tr>
                            </thead>

                            <tbody>

                                {pageItems.map((s) => (

                                    <tr key={s.name} className="table-row-clickable" onClick={() => setSelected(s)}>
                                        <td>{s.name}</td>
                                        <td>{s.location}</td>
                                        <td className="smoke-test-metric-mono">{s.image?.split("/").pop() || "—"}</td>
                                        <td>{s.condition || "—"}</td>
                                        <td className="num">{s.minInstances} / {s.maxInstances}</td>
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

    );

}
