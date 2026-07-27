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
    TemplatesIcon,
    ServicesIcon,
    DockerIcon,
    SettingsIcon,
    ChevronIcon,
    SunIcon,
    MoonIcon
} from "./SidebarIcons";

// Approvals and Pull Requests are both gated on the same repo-admin
// permission (canApproveReleases) — listed together so the filter below
// can hide either with one check.
const GATED_TABS = new Set(["approvals", "pullRequests"]);

const TABS = [
    { key: "dashboard", label: "Dashboard", Icon: DashboardIcon },
    { key: "deploy", label: "Deploy", Icon: DeployIcon },
    { key: "approvals", label: "Approvals", Icon: ApprovalsIcon },
    { key: "pullRequests", label: "Pull Requests", Icon: PullRequestIcon },
    { key: "storage", label: "Artifacts & Images", Icon: StorageIcon },
    { key: "analytics", label: "Analytics", Icon: AnalyticsIcon },
    { key: "timeline", label: "Timeline", Icon: TimelineIcon },
    { key: "history", label: "History", Icon: HistoryIcon },
    { key: "templates", label: "Template Tester", Icon: TemplatesIcon },
    { key: "services", label: "Services", Icon: ServicesIcon },
    { key: "docker", label: "Docker", Icon: DockerIcon },
    { key: "settings", label: "Settings", Icon: SettingsIcon }
];

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

    const { tab, setTab, mobileNavOpen, setMobileNavOpen } = useNavigation();
    const { canApproveReleases } = useAuth();
    const { theme, toggleTheme } = useTheme();

    const [collapsed, setCollapsed] = useState(() => {

        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === null ? true : stored === "true";

    });

    const visibleTabs = TABS.filter((t) => !GATED_TABS.has(t.key) || canApproveReleases);

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

                    {visibleTabs.map(({ key, label, Icon }) => (

                        <button
                            key={key}
                            type="button"
                            className={`app-sidebar-item ${tab === key ? "active" : ""}`}
                            onClick={() => setTab(key)}
                            title={collapsed ? label : undefined}
                        >
                            <span className="app-sidebar-item-icon"><Icon /></span>
                            <span className="app-sidebar-item-label">{label}</span>
                        </button>

                    ))}

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
