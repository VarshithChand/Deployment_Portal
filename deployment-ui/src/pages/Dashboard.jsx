import { useState } from "react";
import {
    Cloud, Server, Boxes, ShieldCheck, Activity,
    GitBranch, Clock, ArrowUpRight, Check, X,
    AlertTriangle, CircleDot, Play, Radio, Terminal, ChevronRight
} from "lucide-react";

import useAuth from "../hooks/useAuth";
import useNavigation from "../hooks/useNavigation";
import useToast from "../hooks/useToast";
import usePolling from "../hooks/usePolling";
import useGithubDeploymentActivity from "../hooks/useGithubDeploymentActivity";
import useSystemHealthSummary from "../hooks/useSystemHealthSummary";
import { getPendingApprovals, submitApprovalDecision } from "../services/approvalsService";
import { getEnvironments } from "../services/environmentsService";
import PageLayout from "../components/layout/PageLayout";

// Round 7 - a full visual + structural rework, replacing the flex-column
// card layout (rounds 1-6) with a single dense "ops console" page. Every
// number here is still real, drawn from the same hooks/services the old
// card-based Dashboard used (useSystemHealthSummary, useGithubDeploymentActivity,
// approvalsService, environmentsService) - nothing in this file is mock
// data, even though the design that inspired this page's CSS/layout was
// originally handed over with mock arrays. See the per-section comments
// below for exactly what's real vs simplified from that original design:
//   - Runs table: GitHub's own run fields (workflow name, branch, commit,
//     triggering login, created_at) plus two fields added to the backend
//     for this (RunStartedAt/UpdatedAt on WorkflowDto) so Duration is a
//     real elapsed time, not invented. There's no "% complete" for an
//     in-progress run anywhere in this app's data, so running rows show
//     an indeterminate sweep instead of a fabricated percentage.
//   - Connection fleet: the same 9-row useSystemHealthSummary the old
//     "Connections" table used, grouped by category.
//   - Needs attention: built from three real signals - integrations that
//     are configured but unhealthy, recent failed runs, and pending
//     approvals - not a hardcoded list. There's no PAT-expiry or CodeQL-
//     finding data surfaced anywhere else in this app, so those blocker
//     types from the original design aren't included here (would have
//     been invented).
//   - Environments: reuses EnvironmentsCard's own getEnvironments() data.
//     The original design showed a "domain" URL per environment; this app
//     has no live deployed-URL tracking for an environment (confirmed via
//     EnvironmentSummaryDto - only cloud-target IDs and deploy status), so
//     that's replaced with a real link to the last deploy's GitHub Actions
//     run instead of a fabricated domain.
// The Sidebar/TopBar around this page are unchanged (PageLayout, same as
// every other page). Round 7 first shipped this layout with its own fixed
// dark palette; every color below was then re-pointed at this app's own
// theme tokens (var(--card-bg)/--text/--text-muted/--stroke/--border/
// --heading-accent/--viz-good/--viz-warning/--viz-critical - the exact
// same ones .card/StatusBadge/DonutChart already use everywhere else) so
// this page matches every other page and follows the light/dark toggle +
// whichever [data-style] variant is active, instead of being a separate
// fixed-dark identity. Every selector in the CSS below is still scoped
// under .dp-root, since global.css already defines a few of the same
// generic class names this design uses (.grid, for one) - unscoped
// selectors here would have silently changed those on every other page.
// Every color here is one of this app's own theme tokens (see global.css'
// :root and its ~10 [data-style] variants) - not a separate palette, so
// this page's status colors are exactly the same green/amber/red used by
// StatusBadge/DonutChart everywhere else, and automatically follow
// whichever style/light/dark mode is active, same as every other page.
const S = {
    ok: "var(--viz-good)",
    running: "var(--heading-accent)",
    warn: "var(--viz-warning)",
    down: "var(--viz-critical)",
    queued: "var(--heading-accent)",
    off: "var(--text-muted)"
};

const FAILURE_CONCLUSIONS = new Set(["failure", "cancelled", "timed_out", "startup_failure", "action_required"]);

const CATEGORY_ICON = {
    "Source Control": GitBranch,
    "Cloud Provider": Cloud,
    "PaaS / Microservices": Server,
    "Container Registry": Boxes,
    "Code Quality": ShieldCheck,
    "Observability": Activity
};

function relativeTime(iso) {

    if (!iso) return "—";

    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    return `${Math.round(hours / 24)}d ago`;

}

// Real elapsed time from the two fields added to WorkflowDto for this
// page (RunStartedAt/UpdatedAt) - "—" for a run that's still queued and
// hasn't actually started executing yet, not a guess.
function formatDuration(run) {

    if (!run.runStartedAt) return "—";

    const start = new Date(run.runStartedAt).getTime();
    const end = run.updatedAt ? new Date(run.updatedAt).getTime() : Date.now();
    const secs = Math.max(0, Math.round((end - start) / 1000));

    if (secs < 60) return `${secs}s`;

    return `${Math.floor(secs / 60)}m ${secs % 60}s`;

}

function initials(login) {

    if (!login) return "—";
    if (login.toLowerCase().includes("[bot]")) return "◆";

    const clean = login.replace(/[^a-zA-Z0-9]/g, "");
    return clean.slice(0, 2).toUpperCase() || "—";

}

function runTone(run) {

    if (run.status === "in_progress") return "running";
    if (run.status === "queued") return "queued";
    if (run.conclusion === "success") return "ok";
    if (FAILURE_CONCLUSIONS.has(run.conclusion)) return "down";

    return "off";

}

function envTone(env) {

    if (env.conclusion === "success") return "ok";
    if (env.conclusion && FAILURE_CONCLUSIONS.has(env.conclusion)) return "down";
    if (env.status === "in_progress" || env.status === "queued") return "running";

    return "off";

}

function Dot({ s, pulse }) {
    return (
        <span className="dp-dot" style={{ background: S[s], boxShadow: `0 0 0 3px color-mix(in srgb, ${S[s]} 22%, transparent)` }}>
            {pulse && <span className="dp-ping" style={{ background: S[s] }} />}
        </span>
    );
}

export default function Dashboard() {

    const { githubTokenConfigured, canApproveReleases } = useAuth();
    const { setTab, goToEnvironment } = useNavigation();
    const toast = useToast();

    const { rows } = useSystemHealthSummary();
    const { runs } = useGithubDeploymentActivity(githubTokenConfigured);

    const [environments, setEnvironments] = useState([]);
    const [envLoading, setEnvLoading] = useState(true);
    const [approvals, setApprovals] = useState([]);
    const [decided, setDecided] = useState({});

    const [envFilter, setEnvFilter] = useState("all");
    const [runFilter, setRunFilter] = useState("all");

    async function loadEnvironments() {

        if (!githubTokenConfigured) {
            setEnvLoading(false);
            return;
        }

        const data = await getEnvironments();
        setEnvironments(Array.isArray(data) ? data : []);
        setEnvLoading(false);

    }

    async function loadApprovals() {

        if (!canApproveReleases) return;

        try {
            const response = await getPendingApprovals();
            setApprovals(Array.isArray(response.data) ? response.data : []);
        }
        catch (err) {
            console.error(err);
        }

    }

    usePolling(loadEnvironments, 30000);
    usePolling(loadApprovals, 20000);

    async function decide(item, approve) {

        try {

            await submitApprovalDecision({
                runId: item.runId,
                environmentIds: (item.environments || []).map((e) => e.id),
                approve
            });

            toast.show(`Deployment ${approve ? "approved" : "denied"}.`, "success");
            setDecided((s) => ({ ...s, [item.runId]: approve ? "approve" : "deny" }));
            loadApprovals();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Couldn't submit that decision.", "error");
        }

    }

    const safeRuns = runs || [];
    const runsLoading = runs === null;

    const selectedEnvDef = envFilter === "all" ? null : environments.find((e) => e.name === envFilter);

    const visibleRuns = safeRuns
        .filter((r) => !selectedEnvDef || r.name === selectedEnvDef.workflowName)
        .filter((r) => {
            if (runFilter === "running") return r.status === "in_progress" || r.status === "queued";
            if (runFilter === "failed") return FAILURE_CONCLUSIONS.has(r.conclusion);
            return true;
        })
        .slice(0, 10);

    const inFlight = safeRuns.filter((r) => r.status === "in_progress" || r.status === "queued").length;

    const downRows = rows.filter((r) => r.configured && !r.healthy);
    const okRows = rows.filter((r) => r.configured && r.healthy);
    const offRows = rows.filter((r) => !r.configured);

    const pendingApprovals = approvals.filter((a) => !decided[a.runId]);
    const recentFailures = safeRuns.filter((r) => FAILURE_CONCLUSIONS.has(r.conclusion)).slice(0, 3);

    const blockers = [
        ...downRows.map((r) => ({
            sev: "down",
            Icon: CATEGORY_ICON[r.category] || AlertTriangle,
            title: `${r.label} is unhealthy`,
            sub: `${r.category} · configured but not responding correctly right now`,
            action: "Reconnect",
            onClick: () => r.tab && setTab(r.tab)
        })),
        ...recentFailures.map((r) => ({
            sev: "down",
            Icon: X,
            title: `${r.name || r.repo} failed`,
            sub: `${r.repo} · ${relativeTime(r.createdAt)}`,
            action: "View run",
            onClick: () => setTab("history")
        })),
        ...(pendingApprovals.length > 0 ? [{
            sev: "queued",
            Icon: Radio,
            title: `${pendingApprovals.length} promotion${pendingApprovals.length > 1 ? "s" : ""} waiting on approval`,
            sub: "Review and approve or deny below.",
            action: "Review",
            onClick: () => setTab("approvals")
        }] : [])
    ].slice(0, 6);

    const verdict = downRows.length > 0 || blockers.length > 2 ? "warn" : "ok";

    // 24h deploy volume, bucketed by hour from real run timestamps - "no
    // bars" for an hour with no runs, not a smoothed/invented curve.
    const HOUR_MS = 3600000;
    const now = Date.now();

    const day = Array.from({ length: 24 }, (_, i) => {

        const hourStart = now - (23 - i) * HOUR_MS;
        const hourEnd = hourStart + HOUR_MS;

        const inHour = safeRuns.filter((r) => {
            const t = new Date(r.createdAt).getTime();
            return t >= hourStart && t < hourEnd;
        });

        return [
            inHour.filter((r) => r.conclusion === "success").length,
            inHour.filter((r) => FAILURE_CONCLUSIONS.has(r.conclusion)).length
        ];

    });

    const maxDay = Math.max(1, ...day.map(([a, b]) => a + b));
    const totalOk = day.reduce((sum, [a]) => sum + a, 0);
    const totalBad = day.reduce((sum, [, b]) => sum + b, 0);
    const successRate = totalOk + totalBad > 0 ? Math.round((totalOk / (totalOk + totalBad)) * 100) : null;

    const fleetGroups = [];
    const groupIndex = {};

    rows.forEach((r) => {

        if (!(r.category in groupIndex)) {
            groupIndex[r.category] = { group: r.category, items: [] };
            fleetGroups.push(groupIndex[r.category]);
        }

        groupIndex[r.category].items.push(r);

    });

    return (

        <PageLayout title="Overview">

            <div className="dp-root">
                <style>{CSS}</style>

                {environments.length > 0 && (

                    <div className="dp-env-pills" role="tablist" aria-label="Environment filter">
                        <button role="tab" aria-selected={envFilter === "all"}
                            className={"dp-env-pill" + (envFilter === "all" ? " on" : "")}
                            onClick={() => setEnvFilter("all")}>
                            All environments
                        </button>
                        {environments.map((e) => (
                            <button key={e.name} role="tab" aria-selected={envFilter === e.name}
                                className={"dp-env-pill" + (envFilter === e.name ? " on" : "")}
                                onClick={() => setEnvFilter(e.name)}>
                                {e.name}
                            </button>
                        ))}
                    </div>

                )}

                <section className={"dp-ribbon " + verdict}>

                    <div className="dp-verdict">
                        <Dot s={verdict} pulse />
                        <div>
                            <h1>{verdict === "ok" ? "Operational" : "Attention needed"}</h1>
                            <p>{downRows.length} integration{downRows.length === 1 ? "" : "s"} unhealthy, {offRows.length} not connected, {blockers.length} item{blockers.length === 1 ? "" : "s"} waiting on you</p>
                        </div>
                    </div>

                    <div className="dp-vitals">

                        <div className="dp-vital">
                            <span className="dp-vlabel"><Play size={12} /> In flight</span>
                            <span className="dp-vval" style={{ color: S.running }}>{inFlight}</span>
                        </div>

                        <div className="dp-vital dp-wide">
                            <span className="dp-vlabel"><Activity size={12} /> Deploys, last 24h</span>
                            <div className="dp-spark" aria-hidden>
                                {day.map(([ok, bad], i) => (
                                    <span key={i} className="dp-spark-col" title={`${ok + bad} run${ok + bad === 1 ? "" : "s"}`}>
                                        {bad > 0 && <em className="bad" style={{ height: `${(bad / maxDay) * 34}px` }} />}
                                        <em className="good" style={{ height: `${(ok / maxDay) * 34}px` }} />
                                    </span>
                                ))}
                            </div>
                            <span className="dp-vsub">{successRate != null ? `${successRate}% success` : "No runs in the last 24h"}</span>
                        </div>

                        <div className="dp-vital">
                            <span className="dp-vlabel"><Server size={12} /> Connections</span>
                            <span className="dp-vval">{okRows.length}<span className="dp-vslash">/{rows.length}</span></span>
                        </div>

                        <div className="dp-vital">
                            <span className="dp-vlabel"><ShieldCheck size={12} /> Approvals</span>
                            <span className="dp-vval" style={{ color: pendingApprovals.length ? S.queued : S.ok }}>{pendingApprovals.length}</span>
                        </div>

                    </div>

                </section>

                <div className="dp-grid">

                    <section className="dp-panel dp-board">

                        <div className="dp-panel-head">
                            <div className="dp-panel-title"><Terminal size={15} /> Deployment runs</div>
                            <div className="dp-seg">
                                {[["all", "All"], ["running", "Running"], ["failed", "Failed"]].map(([k, l]) => (
                                    <button key={k} className={"dp-seg-b" + (runFilter === k ? " on" : "")}
                                        onClick={() => setRunFilter(k)}>{l}</button>
                                ))}
                            </div>
                        </div>

                        {!githubTokenConfigured ? (

                            <div className="dp-empty">Connect GitHub in Settings to see deployment runs here.</div>

                        ) : runsLoading ? (

                            <div className="dp-empty">Loading deployment runs...</div>

                        ) : (

                            <>
                                <div className="dp-board-head">
                                    <span>Workflow</span><span>Branch</span><span className="dp-hcell">Commit</span>
                                    <span className="dp-hcell">By</span><span className="dp-hcell">Duration</span><span className="dp-hcell">When</span>
                                </div>

                                <div className="dp-rows">

                                    {visibleRuns.map((r) => {
                                        const tone = runTone(r);
                                        return (
                                            <div key={`${r.repo}-${r.id}`} className={"dp-row " + tone}>
                                                <span className="dp-rail" style={{ background: S[tone] }} />
                                                <div className="dp-cell dp-wf">
                                                    <Dot s={tone} pulse={tone === "running"} />
                                                    <div className="dp-wf-txt">
                                                        <span className="dp-mono dp-wf-name">{r.name || r.repo}</span>
                                                        <span className="dp-run-id">{r.repo}{r.runNumber ? ` · #${r.runNumber}` : ""}</span>
                                                    </div>
                                                </div>
                                                <div className="dp-cell dp-branch"><GitBranch size={12} /><span className="dp-mono">{r.branch || "—"}</span></div>
                                                <div className="dp-cell dp-hcell dp-mono dp-sha">{r.commitSha ? r.commitSha.slice(0, 7) : "—"}</div>
                                                <div className="dp-cell dp-hcell"><span className="dp-who">{initials(r.triggeredBy)}</span></div>
                                                <div className="dp-cell dp-hcell dp-mono dp-muted">{formatDuration(r)}</div>
                                                <div className="dp-cell dp-hcell dp-time"><Clock size={11} /><span>{relativeTime(r.createdAt)}</span></div>
                                                {tone === "running" && <div className="dp-progress"><span /></div>}
                                            </div>
                                        );
                                    })}

                                    {visibleRuns.length === 0 &&
                                        <div className="dp-empty">No runs match this filter.</div>}

                                </div>
                            </>

                        )}

                    </section>

                    <div className="dp-rail-col">

                        <section className="dp-panel">

                            <div className="dp-panel-head">
                                <div className="dp-panel-title"><AlertTriangle size={15} /> Needs attention</div>
                                <span className="dp-count-pill">{blockers.length}</span>
                            </div>

                            <div className="dp-blockers">

                                {blockers.map((b, i) => (
                                    <div key={i} className="dp-blocker">
                                        <span className="dp-brail" style={{ background: S[b.sev] }} />
                                        <span className="dp-bicon" style={{ color: S[b.sev], background: `color-mix(in srgb, ${S[b.sev]} 18%, transparent)` }}>
                                            <b.Icon size={14} />
                                        </span>
                                        <div className="dp-btxt">
                                            <span className="dp-btitle">{b.title}</span>
                                            <span className="dp-bsub">{b.sub}</span>
                                        </div>
                                        <button className="dp-baction" onClick={b.onClick}>{b.action}<ChevronRight size={13} /></button>
                                    </div>
                                ))}

                                {blockers.length === 0 &&
                                    <div className="dp-empty dp-small">Nothing needs attention.</div>}

                            </div>

                        </section>

                        {canApproveReleases && (

                            <section className="dp-panel">

                                <div className="dp-panel-head">
                                    <div className="dp-panel-title"><ShieldCheck size={15} /> Pending approvals</div>
                                    <span className="dp-count-pill">{pendingApprovals.length}</span>
                                </div>

                                <div className="dp-approvals">

                                    {approvals.map((a) => {
                                        const d = decided[a.runId];
                                        return (
                                            <div key={a.runId} className={"dp-approval" + (d ? " done" : "")}>
                                                <div className="dp-atxt">
                                                    <span className="dp-atitle">{a.workflowName}</span>
                                                    <span className="dp-ameta">
                                                        <span className="dp-mono">{a.branch}</span> · requested by {a.triggeredBy}
                                                        {a.environments?.length > 0 && ` → ${a.environments.map((e) => e.name).join(", ")}`}
                                                    </span>
                                                </div>
                                                {d
                                                    ? <span className={"dp-decided " + d}>{d === "approve" ? "Approved" : "Denied"}</span>
                                                    : <div className="dp-abtns">
                                                        <button className="deny" onClick={() => decide(a, false)}>
                                                            <X size={13} /> Deny</button>
                                                        <button className="approve" onClick={() => decide(a, true)}>
                                                            <Check size={13} /> Approve</button>
                                                    </div>}
                                            </div>
                                        );
                                    })}

                                    {pendingApprovals.length === 0 &&
                                        <div className="dp-empty dp-small">All approvals cleared.</div>}

                                </div>

                            </section>

                        )}

                    </div>

                </div>

                <section className="dp-panel">

                    <div className="dp-panel-head">
                        <div className="dp-panel-title"><Server size={15} /> Connection health</div>
                        <div className="dp-fleet-legend">
                            <span><i style={{ background: S.ok }} /> Healthy {okRows.length}</span>
                            <span><i style={{ background: S.down }} /> Unhealthy {downRows.length}</span>
                            <span><i style={{ background: S.off }} /> Not connected {offRows.length}</span>
                        </div>
                    </div>

                    <div className="dp-fleet">

                        {fleetGroups.map((g) => {

                            const bad = g.items.filter((i) => i.configured && !i.healthy).length;

                            return (

                                <div key={g.group} className="dp-fleet-group">

                                    <div className="dp-fg-head">
                                        <span>{g.group}</span>
                                        <span className={"dp-fg-count" + (bad ? " has-bad" : "")}>
                                            {g.items.filter((i) => i.configured && i.healthy).length}/{g.items.length} healthy
                                        </span>
                                    </div>

                                    <div className="dp-tiles">

                                        {g.items.map((it) => {

                                            const tone = !it.configured ? "off" : it.healthy ? "ok" : "down";
                                            const clickable = it.tab && it.configured;
                                            const Tag = clickable ? "button" : "div";

                                            return (
                                                <Tag key={it.key} type={clickable ? "button" : undefined}
                                                    className={"dp-tile " + tone}
                                                    onClick={clickable ? () => setTab(it.tab) : undefined}>
                                                    <Dot s={tone} />
                                                    <span className="dp-tname">{it.label}</span>
                                                    <span className="dp-tlat dp-mono">
                                                        {!it.configured ? "not connected" : it.tookMs != null ? `${it.tookMs}ms` : "—"}
                                                    </span>
                                                </Tag>
                                            );
                                        })}

                                    </div>

                                </div>

                            );

                        })}

                    </div>

                </section>

                <section className="dp-panel">

                    <div className="dp-panel-head">
                        <div className="dp-panel-title"><Cloud size={15} /> Environments</div>
                    </div>

                    {envLoading ? (

                        <div className="dp-empty">Loading environments...</div>

                    ) : environments.length === 0 ? (

                        <div className="dp-empty">No environments configured yet.</div>

                    ) : (

                        <div className="dp-envs">

                            {environments.map((e) => {
                                const tone = envTone(e);
                                return (
                                    <div key={e.name} className="dp-envcard" role="button" tabIndex={0}
                                        onClick={() => goToEnvironment(e.name)}
                                        onKeyDown={(ev) => {
                                            if (ev.key === "Enter" || ev.key === " ") {
                                                ev.preventDefault();
                                                goToEnvironment(e.name);
                                            }
                                        }}>
                                        <div className="dp-envcard-top">
                                            <Dot s={tone} pulse={tone === "running"} />
                                            <div>
                                                <span className="dp-envname">{e.name}</span>
                                                <span className="dp-envtarget">
                                                    {e.cloudProvider && e.cloudProvider !== "none" ? e.cloudProvider.toUpperCase() : "No cloud target set"}
                                                    {e.autoDetected && " · auto-detected"}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="dp-envfoot">
                                            <span>Last deploy <b>{e.deployedAt ? relativeTime(e.deployedAt) : "no runs yet"}</b></span>
                                            {e.htmlUrl
                                                ? <a className="dp-mono dp-envver" href={e.htmlUrl} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>
                                                    <CircleDot size={11} />{e.commitSha ? e.commitSha.slice(0, 7) : "view run"}<ArrowUpRight size={11} />
                                                </a>
                                                : <span className="dp-mono dp-envver"><CircleDot size={11} />{e.commitSha ? e.commitSha.slice(0, 7) : "—"}</span>}
                                        </div>
                                    </div>
                                );
                            })}

                        </div>

                    )}

                </section>

                <footer className="dp-footer">
                    <span>DeploymentAPI on Render · deployment-ui on Cloudflare Workers</span>
                    <span className="dp-mono">Refreshed just now</span>
                </footer>

            </div>

        </PageLayout>

    );

}

const CSS = `
.dp-root{
  color:var(--text);
  box-sizing:border-box;
}
.dp-root *{box-sizing:border-box;}
.dp-mono{font-family:'JetBrains Mono',ui-monospace,monospace; font-feature-settings:"tnum";}
.dp-root button{font-family:inherit; cursor:pointer;}
.dp-root a{color:inherit; text-decoration:none;}
.dp-root :focus-visible{outline:2px solid var(--heading-accent); outline-offset:2px; border-radius:6px;}

.dp-dot{position:relative; width:8px; height:8px; border-radius:50%; display:inline-block; flex:0 0 auto;}
.dp-ping{position:absolute; inset:0; border-radius:50%; animation:dp-ping 1.8s cubic-bezier(0,0,.2,1) infinite;}
@keyframes dp-ping{0%{transform:scale(1);opacity:.6}80%,100%{transform:scale(3);opacity:0}}

.dp-env-pills{display:flex; gap:3px; background:var(--card-bg); padding:3px; border-radius:9px; border:1px solid var(--stroke); width:fit-content; margin-bottom:14px; flex-wrap:wrap;}
.dp-env-pill{border:0; background:transparent; color:var(--text-muted); font-size:12.5px; font-weight:500;
  padding:5px 11px; border-radius:7px; transition:.15s;}
.dp-env-pill:hover{color:var(--text);}
.dp-env-pill.on{background:var(--card-bg-strong); color:var(--text); box-shadow:inset 0 0 0 1px var(--stroke);}

.dp-ribbon{display:flex; align-items:center; gap:26px; flex-wrap:wrap;
  padding:20px 22px; border-radius:16px; border:1px solid var(--stroke);
  background:var(--card-bg); box-shadow:0 10px 30px -12px var(--card-shadow);
  backdrop-filter:blur(22px) saturate(160%); -webkit-backdrop-filter:blur(22px) saturate(160%);
  margin-bottom:16px; position:relative; overflow:hidden;}
.dp-ribbon::before{content:""; position:absolute; left:0; top:0; bottom:0; width:4px;}
.dp-ribbon.ok::before{background:${S.ok};}
.dp-ribbon.warn::before{background:${S.warn};}
.dp-verdict{display:flex; align-items:center; gap:16px; min-width:280px;}
.dp-verdict .dp-dot{width:14px; height:14px;}
.dp-verdict h1{margin:0; font-size:24px; font-weight:600; letter-spacing:-.02em; color:var(--heading-accent);}
.dp-verdict p{margin:3px 0 0; font-size:13px; color:var(--text-muted);}
.dp-vitals{display:flex; gap:12px; margin-left:auto; flex-wrap:wrap;}
.dp-vital{background:var(--card-bg-strong); border:1px solid var(--stroke); border-radius:12px; padding:11px 15px; min-width:118px;}
.dp-vital.dp-wide{min-width:230px;}
.dp-vlabel{display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--text-muted); font-weight:500;}
.dp-vval{display:flex; align-items:baseline; gap:2px; font-size:26px; font-weight:600; margin-top:6px; letter-spacing:-.02em; color:var(--text);}
.dp-vslash{font-size:15px; color:var(--text-muted); font-weight:500;}
.dp-vsub{font-size:11px; color:var(--text-muted); display:block; margin-top:4px;}
.dp-spark{display:flex; align-items:flex-end; gap:2px; height:36px; margin-top:8px;}
.dp-spark-col{display:flex; flex-direction:column-reverse; gap:1px; flex:1;}
.dp-spark-col .good{background:color-mix(in srgb, ${S.ok} 85%, transparent); border-radius:1px; min-height:1px;}
.dp-spark-col .bad{background:${S.down}; border-radius:1px;}

.dp-grid{display:grid; grid-template-columns:1.7fr 1fr; gap:16px; margin-bottom:16px; align-items:start;}
.dp-rail-col{display:flex; flex-direction:column; gap:16px;}

.dp-panel{background:var(--card-bg); border:1px solid var(--stroke); border-radius:16px; overflow:hidden;
  box-shadow:0 10px 30px -12px var(--card-shadow); backdrop-filter:blur(22px) saturate(160%);
  -webkit-backdrop-filter:blur(22px) saturate(160%); margin-bottom:16px;}
.dp-grid .dp-panel, .dp-rail-col .dp-panel{margin-bottom:0;}
.dp-panel-head{display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px;}
.dp-panel-title{display:flex; align-items:center; gap:9px; font-size:14px; font-weight:600; letter-spacing:-.01em; color:var(--heading-accent);}
.dp-panel-title svg{color:var(--text-muted);}
.dp-count-pill{background:var(--card-bg-strong); border:1px solid var(--stroke); color:var(--text-muted); font-size:12px;
  min-width:22px; text-align:center; padding:2px 7px; border-radius:20px; font-weight:600;}

.dp-seg{display:flex; gap:2px; background:var(--card-bg-strong); padding:3px; border-radius:8px; border:1px solid var(--stroke);}
.dp-seg-b{border:0; background:transparent; color:var(--text-muted); font-size:12px; font-weight:500; padding:4px 10px; border-radius:6px; transition:.15s;}
.dp-seg-b.on{background:var(--card-bg); color:var(--text);}
.dp-seg-b:hover:not(.on){color:var(--text);}

.dp-board-head, .dp-row{display:grid; grid-template-columns:minmax(0,2.2fr) minmax(0,1.5fr) 78px 40px 78px 88px; align-items:center;}
.dp-board-head{padding:9px 16px; font-size:11px; color:var(--text-muted); border-bottom:1px solid var(--border); font-weight:500;}
.dp-hcell{text-align:right;}
.dp-rows{display:flex; flex-direction:column; max-height:520px; overflow-y:auto;}
.dp-row{position:relative; padding:12px 16px 12px 18px; border-bottom:1px solid var(--border); transition:background .12s;}
.dp-row:last-child{border-bottom:0;}
.dp-row:hover{background:var(--table-row-hover);}
.dp-rail{position:absolute; left:0; top:0; bottom:0; width:3px;}
.dp-row.running .dp-rail{animation:dp-railpulse 1.6s infinite;}
@keyframes dp-railpulse{50%{opacity:.5}}
.dp-cell{min-width:0;}
.dp-wf{display:flex; align-items:center; gap:11px;}
.dp-wf-txt{display:flex; flex-direction:column; gap:3px; min-width:0;}
.dp-wf-name{font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text);}
.dp-run-id{display:flex; align-items:center; gap:8px; font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
.dp-branch{display:flex; align-items:center; gap:7px; color:var(--text-muted); font-size:12.5px; min-width:0;}
.dp-branch svg{color:var(--text-muted); flex:0 0 auto;}
.dp-branch .dp-mono{white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
.dp-sha{font-size:12px; color:var(--text-muted);}
.dp-muted{color:var(--text-muted);}
.dp-who{display:inline-grid; place-items:center; width:26px; height:26px; border-radius:7px; font-size:11px;
  font-weight:600; background:color-mix(in srgb, var(--heading-accent) 16%, var(--card-bg-strong));
  color:var(--heading-accent); border:1px solid var(--stroke); margin-left:auto;}
.dp-time{display:flex; align-items:center; gap:5px; justify-content:flex-end; font-size:12px; color:var(--text-muted);}
.dp-time svg{color:var(--text-muted);}
.dp-progress{grid-column:1/-1; height:2px; background:var(--card-bg-strong); border-radius:2px; margin-top:11px; overflow:hidden;}
.dp-progress span{display:block; height:100%; width:40%; background:linear-gradient(90deg,transparent,${S.running},transparent);
  border-radius:2px; animation:dp-sweep 1.3s infinite linear;}
@keyframes dp-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
.dp-empty{padding:34px 16px; text-align:center; color:var(--text-muted); font-size:13px;}
.dp-empty.dp-small{padding:20px;}

.dp-blockers{display:flex; flex-direction:column;}
.dp-blocker{position:relative; display:flex; align-items:flex-start; gap:11px; padding:13px 15px 13px 17px; border-bottom:1px solid var(--border);}
.dp-blocker:last-child{border-bottom:0;}
.dp-brail{position:absolute; left:0; top:0; bottom:0; width:3px;}
.dp-bicon{width:28px; height:28px; border-radius:8px; display:grid; place-items:center; flex:0 0 auto;}
.dp-btxt{display:flex; flex-direction:column; gap:3px; min-width:0; flex:1;}
.dp-btitle{font-size:12.5px; font-weight:600; color:var(--text);}
.dp-bsub{font-size:11.5px; color:var(--text-muted); line-height:1.4;}
.dp-baction{display:flex; align-items:center; gap:1px; background:transparent; border:1px solid var(--stroke);
  color:var(--text-muted); font-size:11.5px; font-weight:500; padding:5px 8px 5px 10px; border-radius:8px;
  white-space:nowrap; align-self:center; transition:.15s;}
.dp-baction:hover{border-color:var(--heading-accent); color:var(--heading-accent);}

.dp-approvals{display:flex; flex-direction:column;}
.dp-approval{display:flex; align-items:center; gap:12px; padding:14px 15px; border-bottom:1px solid var(--border); flex-wrap:wrap;}
.dp-approval:last-child{border-bottom:0;}
.dp-approval.done{opacity:.6;}
.dp-atxt{flex:1; min-width:0; display:flex; flex-direction:column; gap:4px;}
.dp-atitle{font-size:13px; font-weight:600; color:var(--text);}
.dp-ameta{font-size:11px; color:var(--text-muted); line-height:1.4;}
.dp-abtns{display:flex; gap:7px;}
.dp-abtns button{display:flex; align-items:center; gap:5px; font-size:12px; font-weight:600; padding:6px 12px; border-radius:8px; border:1px solid; transition:.15s;}
.dp-abtns .deny{background:transparent; border-color:var(--stroke); color:var(--text-muted);}
.dp-abtns .deny:hover{border-color:${S.down}; color:${S.down};}
.dp-abtns .approve{background:var(--heading-accent); border-color:var(--heading-accent); color:#fff;}
.dp-abtns .approve:hover{filter:brightness(1.08);}
.dp-decided{font-size:12px; font-weight:600; padding:5px 12px; border-radius:8px;}
.dp-decided.approve{background:color-mix(in srgb, ${S.ok} 18%, transparent); color:${S.ok};}
.dp-decided.deny{background:color-mix(in srgb, ${S.down} 18%, transparent); color:${S.down};}

.dp-fleet-legend{display:flex; gap:14px; font-size:11.5px; color:var(--text-muted); flex-wrap:wrap;}
.dp-fleet-legend span{display:flex; align-items:center; gap:6px;}
.dp-fleet-legend i{width:8px; height:8px; border-radius:50%;}
.dp-fleet{display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:2px; padding:6px;}
.dp-fleet-group{padding:10px 12px;}
.dp-fg-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:9px;}
.dp-fg-head span:first-child{font-size:12px; font-weight:600; color:var(--text);}
.dp-fg-count{font-size:11px; color:var(--text-muted);}
.dp-fg-count.has-bad{color:${S.down};}
.dp-tiles{display:flex; flex-direction:column; gap:4px;}
.dp-tile{display:flex; align-items:center; gap:9px; padding:7px 10px; border-radius:8px; background:var(--card-bg-strong); border:1px solid var(--stroke);
  width:100%; text-align:left; font:inherit; color:inherit;}
.dp-tile.down{background:color-mix(in srgb, ${S.down} 12%, var(--card-bg-strong)); border-color:color-mix(in srgb, ${S.down} 44%, var(--stroke));}
.dp-tile.off{opacity:.6;}
.dp-tname{font-size:12.5px; font-weight:500; color:var(--text);}
.dp-tlat{margin-left:auto; font-size:11px; color:var(--text-muted);}

.dp-envs{display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:12px; padding:14px;}
.dp-envcard{background:var(--card-bg-strong); border:1px solid var(--stroke); border-radius:12px; padding:15px; transition:.15s; cursor:pointer;}
.dp-envcard:hover{border-color:var(--heading-accent);}
.dp-envcard-top{display:flex; align-items:flex-start; gap:11px; margin-bottom:14px;}
.dp-envcard-top .dp-dot{margin-top:5px;}
.dp-envname{font-size:13px; font-weight:600; display:block; color:var(--text);}
.dp-envtarget{display:block; font-size:11.5px; color:var(--heading-accent); margin-top:3px;}
.dp-envfoot{display:flex; align-items:center; justify-content:space-between; font-size:11.5px; color:var(--text-muted); border-top:1px solid var(--border); padding-top:11px; flex-wrap:wrap; gap:6px;}
.dp-envfoot b{color:var(--text); font-weight:600;}
.dp-envver{display:flex; align-items:center; gap:5px; color:var(--text-muted);}
a.dp-envver:hover{color:var(--heading-accent);}

.dp-footer{display:flex; justify-content:space-between; align-items:center; padding:4px 6px; font-size:11.5px; color:var(--text-muted); flex-wrap:wrap; gap:6px;}

@media (max-width:920px){
  .dp-grid{grid-template-columns:1fr;}
  .dp-vitals{width:100%;}
}
@media (prefers-reduced-motion:reduce){
  .dp-ping,.dp-row.running .dp-rail,.dp-progress span{animation:none !important;}
}
`;
