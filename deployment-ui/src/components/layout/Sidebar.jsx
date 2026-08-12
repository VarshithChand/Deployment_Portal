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
    SettingsIcon,
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

export const TABS = [
    { key: "dashboard", label: "Dashboard", Icon: DashboardIcon },
    { key: "deploy", label: "Deploy", Icon: DeployIcon },
    { key: "approvals", label: "Approvals", Icon: ApprovalsIcon },
    { key: "pullRequests", label: "Pull Requests", Icon: PullRequestIcon },
    { key: "storage", label: "Artifacts & Images", Icon: StorageIcon },
    { key: "analytics", label: "Analytics", Icon: AnalyticsIcon },
    { key: "timeline", label: "Timeline", Icon: TimelineIcon },
    { key: "history", label: "History", Icon: HistoryIcon },
    { key: "environments", label: "Environments", Icon: EnvironmentsIcon },
    { key: "templates", label: "Template Tester", Icon: TemplatesIcon },
    { key: "services", label: "Services", Icon: ServicesIcon },
    { key: "docker", label: "Docker", Icon: DockerIcon },
    { key: "codeQuality", label: "Code Quality", Icon: CodeQualityIcon },
    { key: "settings", label: "Settings", Icon: SettingsIcon }
];

// Admin-only, same as Settings > Sidebar Access / Activity Log — there's
// one shared Sonar project for the whole repo (not scoped per PAT user),
// and the backend rejects a non-admin outright (see SonarController), so
// showing this tab to anyone else would just be a dead end. Services is
// admin-only for the same reason: its Users/Audit Log tabs now read the
// real PAT-users list and activity log (see AdminUsersController/
// SecurityAuditLogController), both already admin-gated server-side.
export const ADMIN_ONLY_TABS = new Set(["codeQuality", "services"]);

const STORAGE_KEY = "sidebar-collapsed";

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
    const { canApproveReleases, isAdminSession } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const toast = useToast();

    const [collapsed, setCollapsed] = useState(() => {

        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === null ? true : stored === "true";

    });

    const visibleTabs = TABS
        .filter((t) => !GATED_TABS.has(t.key) || canApproveReleases)
        .filter((t) => !ADMIN_ONLY_TABS.has(t.key) || isAdminSession)
        .filter((t) => sidebarAccess[t.key] !== "hidden");

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

                    {visibleTabs.map(({ key, label, Icon }) => {

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
