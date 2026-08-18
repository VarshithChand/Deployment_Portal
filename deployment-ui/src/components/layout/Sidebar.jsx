import { useState } from "react";

import useNavigation from "../../hooks/useNavigation";
import useAuth from "../../hooks/useAuth";
import useTheme from "../../hooks/useTheme";

import {
    DashboardIcon,
    DeployIcon,
    ApprovalsIcon,
    PullRequestIcon,
    StorageIcon,
    AnalyticsIcon,
    TimelineIcon,
    HistoryIcon,
    EnvironmentsIcon,
    TemplatesIcon,
    ServicesIcon,
    DockerIcon,
    CodeQualityIcon,
    SonarIcon,
    CodeQlIcon,
    EslintIcon,
    PylintIcon,
    CheckstyleIcon,
    SettingsIcon,
    GitHubGroupIcon,
    CloudServicesIcon,
    HostingProvidersIcon,
    ContainerRegistryIcon,
    ChevronIcon,
    SunIcon,
    MoonIcon,
    LockIcon
} from "./SidebarIcons";

import useToast from "../../hooks/useToast";

// Approvals and Pull Requests are both gated on the same repo-admin
// permission (canApproveReleases) — listed together so the filter below
// can hide either with one check. Exported (with TABS/ADMIN_ONLY_TABS
// below) so HeaderSearch can search the same page list under the same
// visibility rules, instead of hand-maintaining a second copy that could
// drift out of sync with what the Sidebar actually shows.
export const GATED_TABS = new Set(["approvals", "pullRequests"]);

// Everything that's really "a GitHub repo/pipeline feature" lives grouped
// under one collapsible "GitHub" section instead of sitting flat alongside
// Dashboard/Services/Docker/Code Quality/Settings, which aren't tied to a
// specific repo the same way. A "group" entry is purely a Sidebar-side
// grouping - it has no tab key of its own and never appears in App.jsx's
// tab switch; only its children do.
export const TABS = [
    { key: "dashboard", label: "Dashboard", Icon: DashboardIcon },
    {
        key: "github",
        type: "group",
        label: "GitHub",
        Icon: GitHubGroupIcon,
        children: [
            { key: "deploy", label: "Deploy", Icon: DeployIcon },
            { key: "approvals", label: "Approvals", Icon: ApprovalsIcon },
            { key: "pullRequests", label: "Pull Requests", Icon: PullRequestIcon },
            { key: "storage", label: "Artifacts & Images", Icon: StorageIcon },
            { key: "analytics", label: "Analytics", Icon: AnalyticsIcon },
            { key: "timeline", label: "Timeline", Icon: TimelineIcon },
            { key: "history", label: "History", Icon: HistoryIcon },
            { key: "environments", label: "Environments", Icon: EnvironmentsIcon },
            { key: "templates", label: "Template Tester", Icon: TemplatesIcon }
        ]
    },
    // A separate top-level page, not a GitHub sub-page - it browses AWS's
    // own service catalog, not anything about this repo's pipeline.
    // Deliberately NOT called "Services" either way - the top-level
    // "services" tab below is a different, pre-existing admin feature (PAT
    // user management + audit log); "Cloud Services" also matches this
    // page's own <h1> title (see pages/CloudServices.jsx).
    { key: "cloudServices", label: "Cloud Services", Icon: CloudServicesIcon },
    // Session-scoped Render/Cloudflare/Netlify/Vercel connections (see
    // pages/PaasHosting.jsx) - same open, self-service posture as Cloud
    // Services above: not in GATED_TABS/ADMIN_ONLY_TABS below, and not in
    // SettingsService.GrantablePageKeys, since this is the visitor's own
    // account credential, not a portal-admin-gated feature.
    { key: "paasHosting", label: "Hosting Providers", Icon: HostingProvidersIcon },
    // A hub for browsing container image registries (AWS ECR/Azure ACR/GCP
    // Artifact Registry now; Docker Hub/GHCR/GitLab/JFrog/Harbor/Nexus are
    // shown but not yet built - see pages/ContainerRegistry.jsx). Kept
    // deliberately separate from "docker" below, which is Docker *Engine*
    // management (containers/images/volumes on the host) - a different
    // concept from a container *registry*, and reusing that nav item would
    // have recreated the exact naming confusion Hosting Providers' own
    // redesign already hit once this session. Same self-service posture as
    // Cloud Services/Hosting Providers above - each provider's own session
    // credential is the auth boundary, not a portal admin gate.
    { key: "containerRegistry", label: "Container Registry", Icon: ContainerRegistryIcon },
    { key: "services", label: "Services", Icon: ServicesIcon },
    { key: "docker", label: "Docker", Icon: DockerIcon },
    // Every code-quality/static-analysis tool as its own nested sidebar
    // page, same "collapsible group" treatment as GitHub above - each
    // child is a real, independently-navigable page (own tab key, own
    // App.jsx route), not a tile inside one shared page. "codeQuality"
    // itself is kept as the SonarQube/SonarCloud child's own key (not the
    // group's) specifically so the existing backend admin gate
    // (AdminGate.DenyUnlessAdminAsync(..., "codeQuality") in
    // SonarController) and the existing grantable-page-key list both keep
    // working completely unchanged - only Sonar needs that gate (one
    // shared team credential, not per-user); CodeQL reuses this session's
    // own GitHub token as ITS auth boundary the same way Artifacts/
    // Analytics/History do, so it stays open like they are, not grouped
    // into the same admin-only bucket.
    {
        key: "codeQualityGroup",
        type: "group",
        label: "Code Quality",
        Icon: CodeQualityIcon,
        children: [
            { key: "codeQuality", label: "SonarQube / SonarCloud", Icon: SonarIcon },
            { key: "codeql", label: "CodeQL", Icon: CodeQlIcon },
            { key: "eslint", label: "ESLint", Icon: EslintIcon },
            { key: "pylint", label: "Pylint", Icon: PylintIcon },
            { key: "checkstyle", label: "Checkstyle", Icon: CheckstyleIcon }
        ]
    },
    { key: "settings", label: "Settings", Icon: SettingsIcon }
];

// Flattened view of TABS - every real page with none of the Sidebar-only
// grouping structure - for anything that just needs "the list of pages"
// (HeaderSearch's results) rather than how Sidebar happens to nest them.
export const FLAT_TABS = TABS.flatMap((t) => (t.type === "group" ? t.children : [t]));

// Admin-only, same as Settings > Sidebar Access / Activity Log — there's
// one shared Sonar project for the whole repo (not scoped per PAT user),
// and the backend rejects a non-admin outright (see SonarController), so
// showing this tab to anyone else would just be a dead end. Services is
// admin-only for the same reason: its Users/Audit Log tabs now read the
// real PAT-users list and activity log (see AdminUsersController/
// SecurityAuditLogController), both already admin-gated server-side.
export const ADMIN_ONLY_TABS = new Set(["codeQuality", "services"]);

const STORAGE_KEY = "sidebar-collapsed";
const GROUP_STORAGE_KEY = "sidebar-groups-collapsed";

// Left-hand nav. On tablet/desktop (>=768px, see global.css) it's a
// persistent rail, collapsed to icons-only by default (matches the
// reference the user pointed at — Google Keep's own left rail) with a
// small arrow to pull it open. Below 768px the same markup instead becomes
// an off-canvas drawer — hidden until TopBar's hamburger opens it, always
// full-width/full-label there regardless of the desktop collapse state,
// since an icon-only overlay makes little sense when it's not saving any
// persistent layout space to begin with. Settings lives as the last nav
// item rather than only being reachable through the account badge in TopBar.
export default function Sidebar() {

    const { tab, setTab, mobileNavOpen, setMobileNavOpen, sidebarAccess } = useNavigation();
    const { canApproveReleases, isAdminSession, grantedPages } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const toast = useToast();

    const [collapsed, setCollapsed] = useState(() => {

        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === null ? true : stored === "true";

    });

    // Which groups (currently just "github") the visitor has explicitly
    // collapsed - a group with no entry here defaults to expanded, matching
    // how the flat list looked before grouping existed.
    const [groupsCollapsed, setGroupsCollapsed] = useState(() => {

        try {
            return JSON.parse(localStorage.getItem(GROUP_STORAGE_KEY)) || {};
        }
        catch {
            return {};
        }

    });

    function itemVisible(t) {
        return (!GATED_TABS.has(t.key) || canApproveReleases)
            && (!ADMIN_ONLY_TABS.has(t.key) || isAdminSession || grantedPages.includes(t.key))
            && sidebarAccess[t.key] !== "hidden";
    }

    // Groups themselves aren't gated (they're not a real tab), only their
    // children are - a group with zero visible children just disappears
    // rather than showing an empty, useless header.
    const visibleTabs = TABS
        .map((t) => t.type === "group" ? { ...t, children: t.children.filter(itemVisible) } : t)
        .filter((t) => t.type === "group" ? t.children.length > 0 : itemVisible(t));

    function handleTabClick(key) {

        if (sidebarAccess[key] === "locked") {
            toast.show("This section has been restricted by the portal admin.", "error");
            return;
        }

        setTab(key);

    }

    function toggleCollapsed() {

        setCollapsed((prev) => {

            const next = !prev;
            localStorage.setItem(STORAGE_KEY, String(next));
            return next;

        });

    }

    function toggleGroup(key) {

        // A no-op while the rail is icon-only - there's nothing to hide
        // that isn't already just an icon, so the toggle would silently
        // do nothing visible and just confuse whoever clicked it.
        if (collapsed) return;

        setGroupsCollapsed((prev) => {

            const next = { ...prev, [key]: !prev[key] };
            localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(next));
            return next;

        });

    }

    // A single nav row - shared by top-level tabs and a group's children so
    // the two never visually drift apart.
    function renderTabButton({ key, label, Icon }) {

        const locked = sidebarAccess[key] === "locked";

        return (

            <button
                key={key}
                type="button"
                className={`app-sidebar-item ${tab === key ? "active" : ""} ${locked ? "locked" : ""}`}
                onClick={() => handleTabClick(key)}
                title={locked ? "Restricted by the portal admin" : (collapsed ? label : undefined)}
                aria-disabled={locked}
            >
                <span className="app-sidebar-item-icon">
                    {locked ? <LockIcon /> : <Icon />}
                </span>
                <span className="app-sidebar-item-label">{label}</span>
            </button>

        );

    }

    return (

        <>

            {/* Only rendered (and only ever visible) below the 768px
                breakpoint — tapping outside the open drawer closes it,
                same as tapping a nav item inside it already does. */}
            <div
                className={`mobile-nav-backdrop ${mobileNavOpen ? "visible" : ""}`}
                onClick={() => setMobileNavOpen(false)}
                aria-hidden="true"
            />

            <aside className={`app-sidebar ${collapsed ? "collapsed" : ""} ${mobileNavOpen ? "mobile-open" : ""}`}>

            <button
                type="button"
                className="app-sidebar-toggle"
                onClick={toggleCollapsed}
                aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
                title={collapsed ? "Expand navigation" : "Collapse navigation"}
            >
                <ChevronIcon direction={collapsed ? "right" : "left"} />
            </button>

            <div className="app-sidebar-scroll">

                <nav className="app-sidebar-nav">

                    {visibleTabs.map((item) => {

                        if (item.type !== "group") {
                            return renderTabButton(item);
                        }

                        const groupActive = item.children.some((c) => c.key === tab);

                        // Icon-only rail: always expanded (there's no label/
                        // indent distinction to collapse anyway - see
                        // toggleGroup). Otherwise: forced open while the
                        // active page lives inside it, so collapsing a
                        // group can never hide where you currently are.
                        const isExpanded = collapsed || groupActive || !groupsCollapsed[item.key];

                        return (

                            <div key={item.key} className="app-sidebar-group">

                                <button
                                    type="button"
                                    className={`app-sidebar-item app-sidebar-group-header ${groupActive ? "group-active" : ""}`}
                                    onClick={() => toggleGroup(item.key)}
                                    title={collapsed ? item.label : undefined}
                                    aria-expanded={isExpanded}
                                >
                                    <span className="app-sidebar-item-icon">
                                        <item.Icon />
                                    </span>
                                    <span className="app-sidebar-item-label">{item.label}</span>
                                    <span className={`app-sidebar-group-chevron ${isExpanded ? "expanded" : ""}`}>
                                        <ChevronIcon direction="right" />
                                    </span>
                                </button>

                                {isExpanded && (
                                    <div className="app-sidebar-group-children">
                                        {item.children.map((child) => renderTabButton(child))}
                                    </div>
                                )}

                            </div>

                        );

                    })}

                </nav>

                <div className="app-sidebar-footer">

                    <button
                        type="button"
                        className="app-sidebar-item"
                        onClick={toggleTheme}
                        title={collapsed ? (theme === "dark" ? "Light Mode" : "Dark Mode") : undefined}
                    >
                        <span className="app-sidebar-item-icon">
                            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                        </span>
                        <span className="app-sidebar-item-label">
                            {theme === "dark" ? "Light Mode" : "Dark Mode"}
                        </span>
                    </button>

                </div>

            </div>

            </aside>

        </>

    );

}
