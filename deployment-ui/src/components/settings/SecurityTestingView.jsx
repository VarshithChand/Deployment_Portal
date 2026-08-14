import { useEffect, useMemo, useState } from "react";

import {
    getTargets, addTarget, removeTarget, runScan, getScans, getScan, deleteScan, getDiscoveredRoutes
} from "../../services/securityTestingService";
import { API_BASE } from "../../api/apiBase";
import { FLAT_TABS } from "../layout/Sidebar";
import { VIEWS, VIEW_TITLES } from "../../constants/settingsViews";
import usePagination from "../../hooks/usePagination";
import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";
import ClearableInput from "../common/ClearableInput";
import Pagination from "../common/Pagination";

const TARGETS_PAGE_SIZE = 5;
const SCANS_PAGE_SIZE = 10;
const PAGES_PAGE_SIZE = 10;
const ROUTES_PAGE_SIZE = 10;

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

const SEVERITY_BADGE = {
    CRITICAL: "badge-danger",
    HIGH: "badge-danger",
    MEDIUM: "badge-warning",
    LOW: "badge-info",
    INFO: "badge-secondary"
};

function sortFindings(findings) {
    return [...(findings || [])].sort(
        (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    );
}

function isHttpUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    }
    catch {
        return false;
    }
}

function scoreClass(score) {
    if (score >= 90) return "field-hint-good";
    if (score >= 70) return "field-hint";
    return "field-hint-bad";
}

// Settings -> Security Testing Lab. Restricted server-side to one specific
// GitHub identity (see AdminGate.DenyUnlessSuperAdminAsync) - this
// component is only ever reached after Settings.jsx's own
// isSuperAdminSession gate, but every fetch below still runs into the
// same real 403 if that ever disagrees with the backend. Self-contained
// like DatabaseView - no props threaded from Settings.jsx.
export default function SecurityTestingView() {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [targets, setTargets] = useState([]);
    const [targetsLoading, setTargetsLoading] = useState(true);
    const [newTargetUrl, setNewTargetUrl] = useState("");
    const [addingTarget, setAddingTarget] = useState(false);
    const [removingId, setRemovingId] = useState(null);

    const [scanUrl, setScanUrl] = useState("");
    const [activeMode, setActiveMode] = useState(false);
    const [activeConfirmed, setActiveConfirmed] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scanError, setScanError] = useState("");
    const [result, setResult] = useState(null);

    const [scans, setScans] = useState([]);
    const [scansLoading, setScansLoading] = useState(true);
    const [loadingScanId, setLoadingScanId] = useState(null);
    const [deletingScanId, setDeletingScanId] = useState(null);

    const [backendRoutes, setBackendRoutes] = useState([]);
    const [backendRoutesLoading, setBackendRoutesLoading] = useState(true);
    const [addingBulk, setAddingBulk] = useState(false);

    const targetsPagination = usePagination(targets, TARGETS_PAGE_SIZE);
    const scansPagination = usePagination(scans, SCANS_PAGE_SIZE);

    // Every page/sub-page this portal's own Sidebar and Settings hub
    // already know about - imported directly from the same arrays those
    // components render their own navigation from (Sidebar.jsx's
    // FLAT_TABS, constants/settingsViews.js's VIEWS), not a separately
    // typed-out list. A new tab or Settings sub-page added there appears
    // here automatically, with nothing to keep in sync by hand.
    const frontendPages = useMemo(() => {

        const origin = window.location.origin;
        const pages = FLAT_TABS.map((t) => ({ label: t.label, url: `${origin}/?tab=${t.key}` }));

        for (const view of VIEWS) {
            if (view === "hub") continue;
            pages.push({ label: `Settings > ${VIEW_TITLES[view] || view}`, url: `${origin}/?tab=settings&view=${view}` });
        }

        return pages;

    }, []);

    // GET, no {parameter} placeholder - the only discovered routes that
    // map onto a single, literal, scannable URL the way this tool's
    // GET-only scan already works. A route needing a real {id}/{key} (or
    // any non-GET action) still shows in the table below for visibility,
    // just without an "Add" button - there's no single correct value to
    // fill the placeholder with generically.
    function isScannableRoute(route) {
        return route.method === "GET" && !route.path.includes("{");
    }

    function routeUrl(route) {
        return `${API_BASE || window.location.origin}${route.path}`;
    }

    async function refreshTargets() {

        try {
            setTargets(await getTargets());
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setTargetsLoading(false);
        }

    }

    async function refreshScans() {

        try {
            setScans(await getScans());
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setScansLoading(false);
        }

    }

    async function refreshBackendRoutes() {

        try {
            setBackendRoutes(await getDiscoveredRoutes());
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setBackendRoutesLoading(false);
        }

    }

    useEffect(() => {

        refreshTargets();
        refreshScans();
        refreshBackendRoutes();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Shared by "Add All" on both the Application Pages and Backend API
    // Endpoints tables - addTarget is idempotent by URL server-side
    // (AddSecurityTestingTargetAsync), so re-running this after some URLs
    // are already authorized just leaves those as they were rather than
    // creating duplicates.
    async function handleAddAll(urls, label) {

        setAddingBulk(true);

        let added = 0;

        for (const url of urls) {

            try {
                await addTarget(url);
                added++;
            }
            catch (err) {
                console.error(err);
            }

        }

        toast.show(`Added ${added} of ${urls.length} ${label} as authorized targets.`, "success");
        await refreshTargets();

        setAddingBulk(false);

    }

    const pagesPagination = usePagination(frontendPages, PAGES_PAGE_SIZE);
    const routesPagination = usePagination(backendRoutes, ROUTES_PAGE_SIZE);

    const isAuthorizedTarget = targets.some((t) => t.url === scanUrl.trim());

    async function handleAddTarget() {

        const url = newTargetUrl.trim();

        if (!isHttpUrl(url)) {
            toast.show("Enter a valid http:// or https:// URL.", "error");
            return;
        }

        try {

            setAddingTarget(true);
            await addTarget(url);
            setNewTargetUrl("");
            toast.show("Target authorized.", "success");
            await refreshTargets();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to add that target.", "error");

        }
        finally {

            setAddingTarget(false);

        }

    }

    async function handleRemoveTarget(target) {

        if (!(await confirm({
            title: "Remove this authorized target?",
            message: `'${target.url}' will no longer be scannable until it's added back.`,
            confirmLabel: "Remove",
            danger: true
        }))) {
            return;
        }

        try {

            setRemovingId(target.id);
            await removeTarget(target.id);
            toast.show("Target removed.", "success");
            await refreshTargets();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to remove that target.", "error");

        }
        finally {

            setRemovingId(null);

        }

    }

    async function handleAnalyze() {

        const url = scanUrl.trim();

        if (!isHttpUrl(url)) {
            setScanError("Enter a valid http:// or https:// URL.");
            return;
        }

        if (!isAuthorizedTarget) {
            setScanError("This URL isn't on your authorized targets list — add it below first.");
            return;
        }

        if (activeMode && !activeConfirmed) {
            setScanError("Confirm you own or are authorized to test this target before enabling active testing.");
            return;
        }

        try {

            setScanning(true);
            setScanError("");
            setResult(null);

            const scanResult = await runScan(url, activeMode, activeMode && activeConfirmed);
            setResult(scanResult);

            if (scanResult.error) {
                toast.show(scanResult.error, "error");
            }

            await refreshScans();

        }
        catch (err) {

            console.error(err);
            setScanError(err.response?.data?.message || "The scan failed to start.");

        }
        finally {

            setScanning(false);

        }

    }

    async function handleViewScan(id) {

        try {

            setLoadingScanId(id);
            setResult(await getScan(id));
            setScanError("");

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to load that scan.", "error");

        }
        finally {

            setLoadingScanId(null);

        }

    }

    async function handleDeleteScan(entry) {

        if (!(await confirm({
            title: "Delete this scan?",
            message: `Delete the scan of '${entry.target}' from ${new Date(entry.startedAtUtc).toLocaleString()}? This can't be undone.`,
            confirmLabel: "Delete",
            danger: true
        }))) {
            return;
        }

        try {

            setDeletingScanId(entry.id);
            await deleteScan(entry.id);

            if (result?.id === entry.id) setResult(null);

            toast.show("Scan deleted.", "success");
            await refreshScans();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to delete that scan.", "error");

        }
        finally {

            setDeletingScanId(null);

        }

    }

    const findings = sortFindings(result?.findings);
    const performanceFindings = sortFindings(result?.performanceFindings);

    function formatBytes(bytes) {
        if (bytes == null) return "—";
        if (bytes < 1024) return `${bytes} B`;
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return (

        <>

        {dialog}

        <div className="card">

            <h2 className="card-title">Security Testing Lab</h2>

            <p className="empty-state" style={{ padding: "0 0 10px", textAlign: "left" }}>
                Authorized security testing for systems you administer through this portal.
            </p>

            <div className="error-message" style={{ marginBottom: 0 }}>
                Use this tool only against systems you own or are explicitly authorized to test.
            </div>

        </div>

        <div className="card">

            <h2 className="card-title">Authorized Targets</h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Only URLs added here can be scanned — this is enforced on the server, not just hidden
                in this list. Add every target you're authorized to test before analyzing it below.
            </p>

            <div className="form-group">

                <label>Add a target URL</label>

                <div className="button-row">

                    <div style={{ flex: 1 }}>
                        <ClearableInput
                            placeholder="https://example.com"
                            value={newTargetUrl}
                            onChange={(e) => setNewTargetUrl(e.target.value)}
                            onClear={() => setNewTargetUrl("")}
                            autoComplete="off"
                            name="new-security-target"
                        />
                    </div>

                    <button type="button" className="btn btn-primary" onClick={handleAddTarget} disabled={addingTarget}>
                        {addingTarget ? "Adding..." : "Add Target"}
                    </button>

                </div>

            </div>

            {targetsLoading ? (

                <p className="field-hint">Loading...</p>

            ) : targets.length === 0 ? (

                <p className="empty-state">No authorized targets yet — add one above.</p>

            ) : (

                <>

                <div className="table-scroll">

                    <table className="table">

                        <thead>
                            <tr>
                                <th>URL</th>
                                <th>Added</th>
                                <th></th>
                            </tr>
                        </thead>

                        <tbody>

                            {targetsPagination.pageItems.map((target) => (

                                <tr key={target.id}>
                                    <td>{target.url}</td>
                                    <td>{new Date(target.addedAtUtc).toLocaleString()}</td>
                                    <td>
                                        <button
                                            type="button"
                                            className="btn btn-danger btn-sm"
                                            onClick={() => handleRemoveTarget(target)}
                                            disabled={removingId === target.id}
                                        >
                                            {removingId === target.id ? "..." : "Remove"}
                                        </button>
                                    </td>
                                </tr>

                            ))}

                        </tbody>

                    </table>

                </div>

                <Pagination
                    page={targetsPagination.page}
                    pageCount={targetsPagination.pageCount}
                    totalCount={targetsPagination.totalCount}
                    startIndex={targetsPagination.startIndex}
                    endIndex={targetsPagination.endIndex}
                    onPageChange={targetsPagination.setPage}
                />

                </>

            )}

        </div>

        <div className="card">

            <h2 className="card-title">Application Pages</h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Every tab and Settings sub-page this portal itself knows about — pulled from the
                same navigation list Sidebar renders from, so a newly added page appears here
                automatically. This is a single-page app: every page below is served by the same
                static shell with the same security headers, so scanning several of them verifies
                those portal-wide headers apply everywhere, not page-specific content.
            </p>

            <div className="button-row" style={{ marginBottom: 15 }}>
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleAddAll(frontendPages.map((p) => p.url), "application pages")}
                    disabled={addingBulk}
                >
                    {addingBulk ? "Adding..." : `Add All as Targets (${frontendPages.length})`}
                </button>
            </div>

            <div className="table-scroll">

                <table className="table">

                    <thead>
                        <tr>
                            <th>Page</th>
                            <th>URL</th>
                            <th></th>
                        </tr>
                    </thead>

                    <tbody>

                        {pagesPagination.pageItems.map((page) => (

                            <tr key={page.url}>
                                <td>{page.label}</td>
                                <td>{page.url}</td>
                                <td>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => handleAddAll([page.url], "application page")}
                                        disabled={addingBulk || targets.some((t) => t.url === page.url)}
                                    >
                                        {targets.some((t) => t.url === page.url) ? "Authorized" : "Add"}
                                    </button>
                                </td>
                            </tr>

                        ))}

                    </tbody>

                </table>

            </div>

            <Pagination
                page={pagesPagination.page}
                pageCount={pagesPagination.pageCount}
                totalCount={pagesPagination.totalCount}
                startIndex={pagesPagination.startIndex}
                endIndex={pagesPagination.endIndex}
                onPageChange={pagesPagination.setPage}
            />

        </div>

        <div className="card">

            <h2 className="card-title">Backend API Endpoints</h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Every route registered on the backend right now, reflected from its own routing
                table — a newly added controller/action appears here the next time the backend
                restarts, nothing to maintain by hand. Only GET routes with no path parameter can be
                added as a scan target (a scan is always a plain GET, the same way this whole tool
                works elsewhere); the rest are listed for visibility only. Most of these correctly
                require your own session or admin auth — seeing them reject an unauthenticated scan
                (401/403) is the expected, correct result, not a failure.
            </p>

            {backendRoutesLoading ? (

                <p className="field-hint">Loading...</p>

            ) : (

                <>

                <div className="button-row" style={{ marginBottom: 15 }}>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleAddAll(backendRoutes.filter(isScannableRoute).map(routeUrl), "backend endpoints")}
                        disabled={addingBulk}
                    >
                        {addingBulk ? "Adding..." : `Add All Scannable as Targets (${backendRoutes.filter(isScannableRoute).length})`}
                    </button>
                </div>

                <div className="table-scroll">

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Controller</th>
                                <th>Method</th>
                                <th>Path</th>
                                <th></th>
                            </tr>
                        </thead>

                        <tbody>

                            {routesPagination.pageItems.map((route, index) => (

                                <tr key={`${route.method}-${route.path}-${index}`}>
                                    <td>{route.controller}</td>
                                    <td>{route.method}</td>
                                    <td>{route.path}</td>
                                    <td>
                                        {isScannableRoute(route) ? (
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleAddAll([routeUrl(route)], "backend endpoint")}
                                                disabled={addingBulk || targets.some((t) => t.url === routeUrl(route))}
                                            >
                                                {targets.some((t) => t.url === routeUrl(route)) ? "Authorized" : "Add"}
                                            </button>
                                        ) : (
                                            <span className="field-hint">—</span>
                                        )}
                                    </td>
                                </tr>

                            ))}

                        </tbody>

                    </table>

                </div>

                <Pagination
                    page={routesPagination.page}
                    pageCount={routesPagination.pageCount}
                    totalCount={routesPagination.totalCount}
                    startIndex={routesPagination.startIndex}
                    endIndex={routesPagination.endIndex}
                    onPageChange={routesPagination.setPage}
                />

                </>

            )}

        </div>

        <div className="card">

            <h2 className="card-title">Analyze Target</h2>

            <div className="form-group">

                <label>Target URL</label>
                <ClearableInput
                    placeholder="https://example.com"
                    value={scanUrl}
                    onChange={(e) => setScanUrl(e.target.value)}
                    onClear={() => setScanUrl("")}
                    autoComplete="off"
                    name="scan-target-url"
                />

                {scanUrl.trim() && !isAuthorizedTarget && (
                    <p className="field-hint field-hint-bad">
                        Not on your authorized targets list — add it above first.
                    </p>
                )}

            </div>

            <div className="form-group">

                <label className="checkbox-list-item">
                    <input
                        type="checkbox"
                        checked={activeMode}
                        onChange={(e) => {
                            setActiveMode(e.target.checked);
                            if (!e.target.checked) setActiveConfirmed(false);
                        }}
                    />
                    Enable Active Testing
                </label>

                {activeMode && (

                    <>

                    <p className="field-hint field-hint-bad" style={{ marginTop: 8 }}>
                        Active testing can generate traffic and may affect the target. Only continue if
                        you have explicit authorization. This never sends a destructive request — it only
                        probes GET reachability of endpoints already referenced on the page.
                    </p>

                    <label className="checkbox-list-item" style={{ marginTop: 8 }}>
                        <input
                            type="checkbox"
                            checked={activeConfirmed}
                            onChange={(e) => setActiveConfirmed(e.target.checked)}
                        />
                        I confirm I own or am authorized to test this target.
                    </label>

                    </>

                )}

            </div>

            {scanError && <div className="error-message">{scanError}</div>}

            <div className="button-row">
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAnalyze}
                    disabled={scanning || !scanUrl.trim() || (activeMode && !activeConfirmed)}
                >
                    {scanning ? "Analyzing..." : "Analyze Target"}
                </button>
            </div>

        </div>

        <div className="card">

            <h2 className="card-title">Target Information</h2>

            {!result ? (

                <p className="empty-state">No scan has been performed.</p>

            ) : result.error ? (

                <p className="field-hint field-hint-bad">{result.error}</p>

            ) : (

                <>

                <div className="settings-subsection">

                    <p><strong>Target:</strong> {result.target}</p>
                    <p><strong>Status:</strong> {result.targetInfo.statusCode ?? "—"}</p>
                    <p><strong>HTTPS:</strong> {result.targetInfo.https ? "Yes" : "No"}</p>
                    <p><strong>Response time:</strong> {result.targetInfo.responseTimeMs ?? Math.round(result.durationMs)} ms</p>
                    {result.targetInfo.pageTitle && <p><strong>Page title:</strong> {result.targetInfo.pageTitle}</p>}
                    <p><strong>robots.txt:</strong> {result.targetInfo.robotsTxtFound ? "Found" : "Not found"}</p>
                    <p><strong>security.txt:</strong> {result.targetInfo.securityTxtFound ? "Found" : "Not found"}</p>
                    {result.targetInfo.redirectChain?.length > 1 && (
                        <p><strong>Redirects:</strong> {result.targetInfo.redirectChain.join(" → ")}</p>
                    )}

                </div>

                <h3 className="settings-subhead">Security Headers</h3>

                <div className="button-row" style={{ flexWrap: "wrap" }}>
                    {Object.entries(result.targetInfo.securityHeaders || {}).map(([header, status]) => (
                        <span
                            key={header}
                            className={`badge ${status === "PASS" ? "badge-success" : status === "WARN" ? "badge-warning" : "badge-danger"}`}
                        >
                            {status === "PASS" ? "✓" : "⚠"} {header}
                        </span>
                    ))}
                </div>

                <h3 className="settings-subhead">Third-Party Hosts</h3>

                <p className="field-hint" style={{ padding: "0 0 10px" }}>
                    Other origins this page's own markup references (scripts, images, stylesheets,
                    links) — every one of these can potentially observe the visit.
                </p>

                {result.targetInfo.thirdPartyHosts?.length > 0 ? (

                    <div className="button-row" style={{ flexWrap: "wrap" }}>
                        {result.targetInfo.thirdPartyHosts.map((host) => (
                            <span key={host} className="badge badge-secondary">{host}</span>
                        ))}
                    </div>

                ) : (

                    <p className="empty-state">No third-party hosts referenced.</p>

                )}

                <h3 className="settings-subhead">Security Score</h3>

                <p className={scoreClass(result.securityScore)} style={{ fontSize: 28, fontWeight: 700 }}>
                    {result.securityScore} / 100
                </p>

                <div className="button-row">
                    <span className="badge badge-danger">Critical: {result.summary.critical}</span>
                    <span className="badge badge-danger">High: {result.summary.high}</span>
                    <span className="badge badge-warning">Medium: {result.summary.medium}</span>
                    <span className="badge badge-info">Low: {result.summary.low}</span>
                    <span className="badge badge-secondary">Info: {result.summary.info}</span>
                </div>

                <div className="settings-subsection" style={{ marginTop: 20 }}>

                    <h3 className="settings-subhead">Performance Score</h3>

                    <p className="field-hint" style={{ padding: "0 0 10px" }}>
                        A lightweight HTTP-level check (response time, compression, payload size,
                        caching) from this same request — not a full page-load audit like Lighthouse,
                        since this tool never renders the page or fetches its linked assets.
                    </p>

                    <p className={scoreClass(result.performanceScore)} style={{ fontSize: 28, fontWeight: 700 }}>
                        {result.performanceScore} / 100
                    </p>

                    <div className="button-row" style={{ flexWrap: "wrap" }}>
                        <span className="badge badge-secondary">Response time: {result.targetInfo.responseTimeMs ?? "—"} ms</span>
                        <span className="badge badge-secondary">Size: {formatBytes(result.targetInfo.responseSizeBytes)}</span>
                        <span className="badge badge-secondary">Compression: {result.targetInfo.contentEncoding || "None"}</span>
                        <span className="badge badge-secondary">Cache-Control: {result.targetInfo.cacheControl || "None"}</span>
                    </div>

                </div>

                <p className="field-hint" style={{ marginTop: 10 }}>
                    Automated security assessment — not a complete penetration test.
                </p>

                </>

            )}

        </div>

        <div className="card">

            <h2 className="card-title">Security Findings</h2>

            {!result || result.error ? (

                <p className="empty-state">No scan has been performed.</p>

            ) : findings.length === 0 ? (

                <p className="empty-state">No findings — every check passed.</p>

            ) : (

                findings.map((finding, index) => (

                    <div key={index} className="settings-subsection">

                        <span className={`badge ${SEVERITY_BADGE[finding.severity] || "badge-secondary"}`}>
                            {finding.severity}
                        </span>

                        <p style={{ fontWeight: 600, marginTop: 6, marginBottom: 4 }}>{finding.title}</p>
                        <p className="field-hint">{finding.description}</p>
                        <p className="field-hint"><strong>Recommendation:</strong> {finding.recommendation}</p>

                    </div>

                ))

            )}

        </div>

        <div className="card">

            <h2 className="card-title">Performance Findings</h2>

            {!result || result.error ? (

                <p className="empty-state">No scan has been performed.</p>

            ) : performanceFindings.length === 0 ? (

                <p className="empty-state">No findings — every check passed.</p>

            ) : (

                performanceFindings.map((finding, index) => (

                    <div key={index} className="settings-subsection">

                        <span className={`badge ${SEVERITY_BADGE[finding.severity] || "badge-secondary"}`}>
                            {finding.severity}
                        </span>

                        <p style={{ fontWeight: 600, marginTop: 6, marginBottom: 4 }}>{finding.title}</p>
                        <p className="field-hint">{finding.description}</p>
                        <p className="field-hint"><strong>Recommendation:</strong> {finding.recommendation}</p>

                    </div>

                ))

            )}

        </div>

        <div className="card">

            <h2 className="card-title">Scan History</h2>

            {scansLoading ? (

                <p className="field-hint">Loading...</p>

            ) : scans.length === 0 ? (

                <p className="empty-state">No scans yet.</p>

            ) : (

                <>

                <div className="table-scroll">

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Target</th>
                                <th>When</th>
                                <th>Security</th>
                                <th>Performance</th>
                                <th>Findings</th>
                                <th></th>
                            </tr>
                        </thead>

                        <tbody>

                            {scansPagination.pageItems.map((entry) => (

                                <tr key={entry.id}>
                                    <td>{entry.target}</td>
                                    <td>{new Date(entry.startedAtUtc).toLocaleString()}</td>
                                    <td>{entry.error ? "—" : `${entry.securityScore}/100`}</td>
                                    <td>{entry.error ? "—" : `${entry.performanceScore}/100`}</td>
                                    <td>
                                        {entry.error
                                            ? entry.error
                                            : `${entry.summary.critical}C ${entry.summary.high}H ${entry.summary.medium}M ${entry.summary.low}L ${entry.summary.info}I`}
                                    </td>
                                    <td>

                                        <div className="button-row">

                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleViewScan(entry.id)}
                                                disabled={loadingScanId === entry.id}
                                            >
                                                {loadingScanId === entry.id ? "..." : "View"}
                                            </button>

                                            <button
                                                type="button"
                                                className="btn btn-danger btn-sm"
                                                onClick={() => handleDeleteScan(entry)}
                                                disabled={deletingScanId === entry.id}
                                            >
                                                {deletingScanId === entry.id ? "..." : "Delete"}
                                            </button>

                                        </div>

                                    </td>
                                </tr>

                            ))}

                        </tbody>

                    </table>

                </div>

                <Pagination
                    page={scansPagination.page}
                    pageCount={scansPagination.pageCount}
                    totalCount={scansPagination.totalCount}
                    startIndex={scansPagination.startIndex}
                    endIndex={scansPagination.endIndex}
                    onPageChange={scansPagination.setPage}
                />

                </>

            )}

        </div>

        </>

    );

}
