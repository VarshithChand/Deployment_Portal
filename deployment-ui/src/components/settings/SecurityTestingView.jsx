import { useEffect, useState } from "react";

import {
    getTargets, addTarget, removeTarget, runScan, getScans, getScan, deleteScan
} from "../../services/securityTestingService";
import usePagination from "../../hooks/usePagination";
import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";
import ClearableInput from "../common/ClearableInput";
import Pagination from "../common/Pagination";

const TARGETS_PAGE_SIZE = 5;
const SCANS_PAGE_SIZE = 10;

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

    const targetsPagination = usePagination(targets, TARGETS_PAGE_SIZE);
    const scansPagination = usePagination(scans, SCANS_PAGE_SIZE);

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

    useEffect(() => {

        refreshTargets();
        refreshScans();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

                    <label className="checkbox-label" style={{ marginTop: 8 }}>
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

                <p className="field-hint" style={{ marginTop: 10 }}>
                    Automated security assessment — not a complete penetration test.
                </p>

                </>

            )}

        </div>

        <div className="card">

            <h2 className="card-title">Findings</h2>

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
                                <th>Score</th>
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
