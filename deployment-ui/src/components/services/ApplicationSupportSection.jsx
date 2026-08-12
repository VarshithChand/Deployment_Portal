import { useEffect, useMemo, useState } from "react";

import {
    getApplicationVersion,
    getApplicationHealth,
    getLatestDeployment,
    getUserVersions
} from "../../services/applicationSupportService";
import { getAppVersion } from "../../services/appVersionService";
import { getLocalAppVersion } from "../../utils/appCacheManager";
import { APP_COMMIT, APP_VERSION, APP_ENVIRONMENT } from "../../utils/buildInfo";
import usePagination from "../../hooks/usePagination";
import SectionTabs from "../common/SectionTabs";
import SearchBox from "../common/SearchBox";
import Pagination from "../common/Pagination";
import ApplicationSupportCopilot from "./ApplicationSupportCopilot";
import AppCacheControlCard from "./AppCacheControlCard";

const SUB_SECTIONS = [
    { key: "version", label: "Application Version" },
    { key: "users", label: "User Versions" },
    { key: "deployments", label: "Deployments" },
    { key: "copilot", label: "Deployment Support Copilot" }
];

const PAGE_SIZE = 10;

function StatCard({ label, value, badge }) {

    return (

        <div className="cloud-service-stat-tile">
            <span>{label}</span>
            <strong>{value}</strong>
            {badge}
        </div>

    );

}

// Services -> Application Support - admin-only version/deployment/health
// visibility plus Deployment Support Copilot (see section 1/2/24 of the
// spec this came from: lives ONLY here, never on Credentials, never a new
// top-level sidebar item). Self-contained, mirroring how AwsLoginSection/
// GcpLoginSection are standalone within Settings - Services.jsx just
// renders this when its own "application-support" section is active.
export default function ApplicationSupportSection() {

    const [subSection, setSubSection] = useState("version");

    const [version, setVersion] = useState(null);
    const [health, setHealth] = useState(null);
    const [versionLoading, setVersionLoading] = useState(true);

    const [deployment, setDeployment] = useState(null);
    const [deploymentLoading, setDeploymentLoading] = useState(true);

    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(true);
    const [userSearch, setUserSearch] = useState("");

    const [refreshing, setRefreshing] = useState(false);

    // The same cache-bust counter AppUpdateMonitor polls in the background
    // (see utils/appCacheManager.js) - surfaced here directly so "is the
    // person looking at THIS page right now on the latest deployed build"
    // has one clear, explicit answer instead of only being an invisible
    // background check.
    const [serverCacheVersion, setServerCacheVersion] = useState(null);
    const localCacheVersion = getLocalAppVersion();

    async function loadVersion() {

        try {

            const [versionData, healthData, cacheVersionData] = await Promise.all([
                getApplicationVersion(),
                getApplicationHealth(),
                getAppVersion()
            ]);

            setVersion(versionData);
            setHealth(healthData);
            setServerCacheVersion(cacheVersionData.version);

        }
        catch (err) {
            console.error(err);
        }
        finally {
            setVersionLoading(false);
        }

    }

    async function loadDeployment() {

        try {
            setDeployment(await getLatestDeployment());
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setDeploymentLoading(false);
        }

    }

    async function loadUsers() {

        try {
            setUsers(await getUserVersions());
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setUsersLoading(false);
        }

    }

    useEffect(() => {

        loadVersion();
        loadDeployment();
        loadUsers();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Refreshes everything in place (section 14) - no full page reload
    // needed just to see current data again.
    async function handleRefreshAll() {

        setRefreshing(true);

        await Promise.all([loadVersion(), loadDeployment(), loadUsers()]);

        setRefreshing(false);

    }

    const commitsMatch = version?.backendCommit && APP_COMMIT !== "unknown"
        ? version.backendCommit === APP_COMMIT
        : null;

    const isOnLatestCacheVersion = serverCacheVersion != null && localCacheVersion != null
        ? Number(localCacheVersion) >= Number(serverCacheVersion)
        : null;

    const filteredUsers = useMemo(() => {

        const trimmed = userSearch.trim().toLowerCase();

        return trimmed
            ? users.filter((u) => u.patOwnerLogin.toLowerCase().includes(trimmed))
            : users;

    }, [users, userSearch]);

    const {
        page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex
    } = usePagination(filteredUsers, PAGE_SIZE);

    useEffect(() => {

        setPage(1);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userSearch]);

    function userVersionStatus(user) {

        if (!user.frontendCommit) {
            return { label: "? Unknown", className: "badge-secondary" };
        }

        if (APP_COMMIT !== "unknown" && user.frontendCommit === APP_COMMIT) {
            return { label: "✓ Current", className: "badge-success" };
        }

        return { label: "⚠ Outdated", className: "badge-warning" };

    }

    return (

        <>

            <div className="repo-picker-header" style={{ marginBottom: "12px" }}>
                <h2 className="card-title" style={{ margin: 0 }}>Application Support</h2>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleRefreshAll} disabled={refreshing}>
                    {refreshing ? "Refreshing..." : "Refresh"}
                </button>
            </div>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Application version visibility, deployment diagnostics, and user support — admin-only,
                only reachable from here.
            </p>

            <SectionTabs sections={SUB_SECTIONS} active={subSection} onSelect={setSubSection} />

            {subSection === "version" && (

                versionLoading ? (

                    <p className="empty-state">Loading...</p>

                ) : (

                    <>

                        <div className="card">

                            <h3 className="settings-subhead" style={{ marginTop: 0 }}>Your Version Status</h3>

                            {isOnLatestCacheVersion === null ? (

                                <p className="empty-state" style={{ textAlign: "left" }}>
                                    Unable to determine — this browser hasn't checked in yet. Reload the page
                                    once, then come back here.
                                </p>

                            ) : isOnLatestCacheVersion ? (

                                <p style={{ margin: 0 }}>
                                    <span className="badge badge-success">✓ Current</span>{" "}
                                    You (this browser) are using the latest deployed version
                                    (v{serverCacheVersion}).
                                </p>

                            ) : (

                                <p style={{ margin: 0 }}>
                                    <span className="badge badge-warning">⚠ Outdated</span>{" "}
                                    You (this browser) are on v{localCacheVersion}, the latest deployed version
                                    is v{serverCacheVersion}. Refresh this page to update — or wait, you'll be
                                    prompted automatically within about 30 seconds.
                                </p>

                            )}

                        </div>

                        <br />

                        <AppCacheControlCard />

                        <br />

                        <div className="cloud-service-stat-grid">

                            <StatCard label="Frontend Commit" value={APP_COMMIT} />
                            <StatCard label="Backend Commit" value={version?.backendCommit || "unknown"} />
                            <StatCard label="Frontend Version" value={APP_VERSION || "not set"} />
                            <StatCard label="Backend Version" value={version?.backendVersion || "not set"} />
                            <StatCard label="Environment" value={version?.environment || "unknown"} />
                            <StatCard label="Frontend Build" value={APP_ENVIRONMENT} />

                        </div>

                        <br />

                        <div className="card">

                            <h3 className="settings-subhead" style={{ marginTop: 0 }}>Version Compatibility</h3>

                            {commitsMatch === null ? (

                                <p className="empty-state" style={{ textAlign: "left" }}>
                                    Unable to compare — this browser's build commit or the backend's commit isn't
                                    available.
                                </p>

                            ) : commitsMatch ? (

                                <p style={{ margin: 0 }}>
                                    <span className="badge badge-success">✓ Versions match</span>{" "}
                                    Your browser and the backend are running the same commit.
                                </p>

                            ) : (

                                <p style={{ margin: 0 }}>
                                    <span className="badge badge-warning">⚠ Version mismatch</span>{" "}
                                    Your browser is on <code>{APP_COMMIT}</code>, the backend is on{" "}
                                    <code>{version?.backendCommit}</code>. This can simply mean the frontend and
                                    backend were deployed at different times — refresh this page to confirm you
                                    have the latest frontend.
                                </p>

                            )}

                        </div>

                        <br />

                        <div className="card">

                            <h3 className="settings-subhead" style={{ marginTop: 0 }}>Health</h3>

                            {!health ? (

                                <p className="empty-state">Unable to load health status.</p>

                            ) : (

                                <div className="cloud-service-stat-grid">

                                    <StatCard
                                        label="Backend"
                                        value={health.backendHealthy ? "Healthy" : "Unhealthy"}
                                    />

                                    <StatCard
                                        label="Database"
                                        value={health.databaseHealthy ? `Connected (${health.databaseMode})` : "Unhealthy"}
                                    />

                                    <StatCard
                                        label="GitHub"
                                        value={health.gitHubConfigured ? "Connected" : "Not configured"}
                                    />

                                </div>

                            )}

                            {health?.databaseError && (
                                <p className="field-hint field-hint-bad" style={{ marginTop: "10px" }}>
                                    {health.databaseError}
                                </p>
                            )}

                        </div>

                    </>

                )

            )}

            {subSection === "users" && (

                <>

                    <SearchBox placeholder="Search by GitHub username..." value={userSearch} onChange={setUserSearch} />

                    {usersLoading ? (

                        <p className="empty-state">Loading...</p>

                    ) : filteredUsers.length === 0 ? (

                        <p className="empty-state">
                            {users.length === 0 ? "No connected users yet." : "No users match that search."}
                        </p>

                    ) : (

                        <>

                            <div className="table-scroll">

                                <table className="table">

                                    <thead>
                                        <tr>
                                            <th>User</th>
                                            <th>Frontend Commit</th>
                                            <th>Environment</th>
                                            <th>Last Reported</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>

                                    <tbody>

                                        {pageItems.map((u) => {

                                            const status = userVersionStatus(u);

                                            return (

                                                <tr key={u.key}>
                                                    <td>{u.patOwnerLogin}</td>
                                                    <td className="smoke-test-metric-mono">{u.frontendCommit || "—"}</td>
                                                    <td>{u.frontendEnvironment || "—"}</td>
                                                    <td>
                                                        {u.frontendLastSeenUtc
                                                            ? new Date(u.frontendLastSeenUtc).toLocaleString()
                                                            : "Not seen since restart"}
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${status.className}`}>{status.label}</span>
                                                    </td>
                                                </tr>

                                            );

                                        })}

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

                </>

            )}

            {subSection === "deployments" && (

                deploymentLoading ? (

                    <p className="empty-state">Loading...</p>

                ) : !deployment?.environmentName ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        No environments configured yet — add one in Settings → Environments.
                    </p>

                ) : (

                    <div className="card">

                        <h3 className="settings-subhead" style={{ marginTop: 0 }}>
                            Latest Deployment — {deployment.environmentName}
                        </h3>

                        {!deployment.runId ? (

                            <p className="empty-state" style={{ textAlign: "left" }}>
                                No workflow runs found yet for "{deployment.workflowName}".
                            </p>

                        ) : (

                            <ul className="cloud-service-detail-list">
                                <li>Workflow: {deployment.workflowName}</li>
                                <li>Run: #{deployment.runNumber}</li>
                                <li>Branch: {deployment.branch}</li>
                                <li>Commit: <code>{deployment.commitSha?.slice(0, 7)}</code></li>
                                <li>
                                    Status:{" "}
                                    {deployment.status === "completed" ? (
                                        <span className={`badge ${deployment.conclusion === "success" ? "badge-success" : "badge-danger"}`}>
                                            {deployment.conclusion === "success" ? "✓ Success" : deployment.conclusion}
                                        </span>
                                    ) : (
                                        <span className="badge badge-info">{deployment.status}</span>
                                    )}
                                </li>
                                <li>
                                    Started:{" "}
                                    {deployment.startedAtUtc ? new Date(deployment.startedAtUtc).toLocaleString() : "—"}
                                </li>
                                {deployment.htmlUrl && (
                                    <li>
                                        <a href={deployment.htmlUrl} target="_blank" rel="noreferrer">
                                            View on GitHub →
                                        </a>
                                    </li>
                                )}
                            </ul>

                        )}

                    </div>

                )

            )}

            {subSection === "copilot" && <ApplicationSupportCopilot />}

        </>

    );

}
