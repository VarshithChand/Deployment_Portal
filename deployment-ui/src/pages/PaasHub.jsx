import { useEffect, useState } from "react";

import { getPaasApplications, bulkRestartPaasApplications } from "../services/paasHubService";
import usePagination from "../hooks/usePagination";
import useToast from "../hooks/useToast";
import PageLayout from "../components/layout/PageLayout";
import Pagination from "../components/common/Pagination";
import SearchBox from "../components/common/SearchBox";
import ConfirmDialog from "../components/ConfirmDialog";
import StateBadge from "../components/cloudServices/StateBadge";

const PAGE_SIZE = 10;
const PROVIDERS = ["AWS", "Azure", "GCP"];

// Section 2's cross-provider application list + section 3's global
// search + section 4's filters (Provider/Status - Region/Environment/
// Version are reachable through the search box instead of their own
// dropdowns, since section 3 already lists them as search targets and a
// 5-filter row for 3 providers' worth of apps would be more UI than the
// data warrants) + section 14's bulk restart (see PaasAggregationService.
// BulkRestartAsync's own comment for why this is Restart-only, not
// Start/Stop/Restart - Elastic Beanstalk and Cloud Run have no real
// Start/Stop). Rows aren't clickable into a full detail page here - each
// provider's own dedicated page (Elastic Beanstalk / App Service / GCP
// Cloud Run, all reachable from this same sidebar group) is where real
// management happens; this page is discovery + bulk restart only.
export default function PaasHub() {

    const toast = useToast();

    const [data, setData] = useState(null);
    const [search, setSearch] = useState("");
    const [providerFilter, setProviderFilter] = useState(new Set());
    const [statusFilter, setStatusFilter] = useState(new Set());
    const [checked, setChecked] = useState(new Set());
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [applying, setApplying] = useState(false);
    const [results, setResults] = useState(null);

    function load() {
        getPaasApplications().then(setData).catch((err) => {
            console.error(err);
            setData(null);
        });
    }

    useEffect(load, []);

    const apps = data?.applications || [];
    const statuses = [...new Set(apps.map((a) => a.status).filter(Boolean))];

    function toggleSetValue(setState, value) {
        setState((prev) => {
            const next = new Set(prev);
            if (next.has(value)) next.delete(value); else next.add(value);
            return next;
        });
    }

    const filtered = apps.filter((a) => {

        if (providerFilter.size > 0 && !providerFilter.has(a.provider)) return false;
        if (statusFilter.size > 0 && !statusFilter.has(a.status)) return false;

        const q = search.trim().toLowerCase();

        if (!q) return true;

        return [a.name, a.environment, a.region, a.status, a.version, a.url]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(q));

    });

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filtered, PAGE_SIZE);

    useEffect(() => { setPage(1); }, [search, providerFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    function toggleChecked(key) {

        setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });

    }

    function appKey(a) {
        return `${a.provider}:${a.resourceGroup || a.environment || ""}:${a.name}`;
    }

    const selectedApps = apps.filter((a) => checked.has(appKey(a)));

    async function applyBulkRestart() {

        setApplying(true);

        try {

            const items = selectedApps.map((a) => ({ provider: a.provider, name: a.name, resourceGroup: a.resourceGroup }));
            const result = await bulkRestartPaasApplications(items);

            setResults(result.results);

            const failures = result.results.filter((r) => !r.success);

            if (failures.length === 0) toast.show(`Restarted ${selectedApps.length} application(s).`, "success");
            else toast.show(`${result.results.length - failures.length}/${result.results.length} restarted - see results below.`, "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to apply bulk restart.", "error");
        }
        finally {
            setApplying(false);
            setConfirmOpen(false);
        }

    }

    return (

        <PageLayout title="PaaS / Microservices">

            <p className="field-hint" style={{ marginBottom: "18px" }}>
                Every AWS Elastic Beanstalk environment, Azure App Service, and GCP Cloud Run service
                across this session's connected accounts, in one list.
            </p>

            {!data ? (

                <div className="card"><p className="empty-state">Loading applications...</p></div>

            ) : (

                <>

                    {(!data.awsConfigured || !data.azureConfigured || !data.gcpConfigured || data.awsError || data.azureError || data.gcpError) && (

                        <div className="card">

                            <h3 className="settings-subhead" style={{ marginTop: 0 }}>Provider Status</h3>

                            <ul className="cloud-service-detail-list">
                                <li>AWS: {data.awsError ? <span className="badge badge-danger">{data.awsError}</span> : data.awsConfigured ? <span className="badge badge-success">Connected</span> : <span className="badge badge-secondary">Not configured</span>}</li>
                                <li>Azure: {data.azureError ? <span className="badge badge-danger">{data.azureError}</span> : data.azureConfigured ? <span className="badge badge-success">Connected</span> : <span className="badge badge-secondary">Not configured</span>}</li>
                                <li>GCP: {data.gcpError ? <span className="badge badge-danger">{data.gcpError}</span> : data.gcpConfigured ? <span className="badge badge-success">Connected</span> : <span className="badge badge-secondary">Not configured</span>}</li>
                            </ul>

                        </div>

                    )}

                    <div className="card">

                        <h2 className="card-title">All Applications</h2>

                        <SearchBox placeholder="Search name, environment, region, status, version, or URL..." value={search} onChange={setSearch} />

                        <div className="button-row" style={{ marginTop: "10px" }}>
                            {PROVIDERS.map((p) => (
                                <button key={p} type="button" className={`btn btn-sm ${providerFilter.has(p) ? "btn-primary" : "btn-secondary"}`} onClick={() => toggleSetValue(setProviderFilter, p)}>
                                    {p}
                                </button>
                            ))}
                        </div>

                        {statuses.length > 0 && (

                            <div className="button-row" style={{ marginTop: "6px" }}>
                                {statuses.map((s) => (
                                    <button key={s} type="button" className={`btn btn-sm ${statusFilter.has(s) ? "btn-primary" : "btn-secondary"}`} onClick={() => toggleSetValue(setStatusFilter, s)}>
                                        {s}
                                    </button>
                                ))}
                            </div>

                        )}

                        {checked.size > 0 && (

                            <div className="cloud-service-bulk-bar">
                                <strong>{checked.size} application(s) selected</strong>
                                <button type="button" className="btn btn-sm btn-primary" onClick={() => setConfirmOpen(true)}>Restart Selected</button>
                                <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setChecked(new Set()); setResults(null); }}>Clear Selection</button>
                            </div>

                        )}

                        {results && (

                            <div className="card" style={{ margin: "0 0 12px" }}>

                                <h4 className="settings-subhead" style={{ marginTop: 0 }}>Bulk Restart Results</h4>

                                <ul className="cloud-service-detail-list">
                                    {results.map((r, index) => (
                                        <li key={`${r.provider}-${r.name}-${index}`}>
                                            [{r.provider}] {r.name} {r.success ? <span className="badge badge-success">✓</span> : <span className="badge badge-danger">✗ {r.error}</span>}
                                        </li>
                                    ))}
                                </ul>

                            </div>

                        )}

                        {filtered.length === 0 ? (

                            <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>
                                {apps.length === 0 ? "No PaaS applications found - connect AWS, Azure, or GCP credentials in Settings." : `No applications match your search/filters.`}
                            </p>

                        ) : (

                            <>

                                <div className="table-scroll" style={{ marginTop: "12px" }}>

                                    <table className="table">

                                        <thead>
                                            <tr>
                                                <th><span className="visually-hidden">Select</span></th>
                                                <th>Provider</th>
                                                <th>Name</th>
                                                <th>Environment</th>
                                                <th>Region</th>
                                                <th>Status</th>
                                                <th>Version</th>
                                                <th>URL</th>
                                            </tr>
                                        </thead>

                                        <tbody>

                                            {pageItems.map((a) => (

                                                <tr key={appKey(a)}>
                                                    <td onClick={(e) => e.stopPropagation()}>
                                                        <input type="checkbox" aria-label={`Select ${a.name}`} checked={checked.has(appKey(a))} onChange={() => toggleChecked(appKey(a))} />
                                                    </td>
                                                    <td><span className="badge badge-secondary">{a.provider}</span></td>
                                                    <td>{a.name}</td>
                                                    <td>{a.environment || "—"}</td>
                                                    <td>{a.region || "—"}</td>
                                                    <td><StateBadge state={a.status} /></td>
                                                    <td className="smoke-test-metric-mono">{a.version || "—"}</td>
                                                    <td>{a.url || "—"}</td>
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

                </>

            )}

            <ConfirmDialog
                open={confirmOpen}
                title="Restart selected applications?"
                message={(
                    <>
                        You are about to restart {selectedApps.length} application(s):
                        <ul>
                            {selectedApps.map((a) => <li key={appKey(a)}>[{a.provider}] {a.name}</li>)}
                        </ul>
                    </>
                )}
                confirmLabel={applying ? "Restarting..." : "Confirm"}
                danger
                onConfirm={applyBulkRestart}
                onCancel={() => setConfirmOpen(false)}
            />

        </PageLayout>

    );

}
