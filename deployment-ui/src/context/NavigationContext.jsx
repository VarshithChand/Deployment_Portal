import { createContext, useCallback, useEffect, useState } from "react";

import { getSidebarAccess } from "../services/settingsService";

const TABS = ["dashboard", "deploy", "approvals", "pullRequests", "storage", "analytics", "timeline", "history", "environments", "templates", "cloudServices", "services", "paasHosting", "containerRegistry", "docker", "codeQuality", "settings"];

// Read the starting tab from the URL so a hard reload (or a bookmarked/
// shared link) lands back on the same page instead of always resetting
// to the dashboard.
function readTabFromUrl() {

    const requested = new URLSearchParams(window.location.search).get("tab");

    return TABS.includes(requested) ? requested : "dashboard";

}

export const NavigationContext = createContext();

export default function NavigationProvider({ children }) {

    const [tab, setTabState] = useState(readTabFromUrl);
    const [pendingRepoUrl, setPendingRepoUrl] = useState(null);

    // Which Settings sub-page ("view", see Settings.jsx) to land on once the
    // "settings" tab is active — same hand-off shape as pendingRepoUrl/
    // pendingEnvironmentName below, driven by HeaderSearch's results.
    const [pendingSettingsView, setPendingSettingsView] = useState(null);

    // Which environment the Environments page should open straight into —
    // set when the Dashboard's Environments card is clicked, cleared once
    // the page has consumed it (see Environments.jsx), same hand-off shape
    // as pendingRepoUrl/goToSettingsWithRepo above.
    const [pendingEnvironmentName, setPendingEnvironmentName] = useState(null);

    // Which AWS service the Cloud Services page should open straight into —
    // set when the Dashboard's AWS Services card is clicked, cleared once
    // the page has consumed it (see CloudServices.jsx), same hand-off shape
    // as pendingEnvironmentName above.
    const [pendingCloudService, setPendingCloudService] = useState(null);

    // The mobile drawer (Sidebar becomes an off-canvas panel below the
    // 768px breakpoint — see global.css) and its hamburger trigger (TopBar)
    // are siblings, not parent/child, so this is the shared home for
    // "is the drawer open" rather than prop-drilling between them.
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    // Which sidebar tabs the repo owner has locked/hidden for everyone else
    // — keyed by tab key, value "locked" | "hidden", absent = fully visible.
    // Lives here (not fetched separately by Sidebar and App) so both the
    // nav rendering and the route guard below always agree on the same
    // data without two independent requests racing each other.
    const [sidebarAccess, setSidebarAccess] = useState({});

    const refreshSidebarAccess = useCallback(async () => {

        try {
            setSidebarAccess(await getSidebarAccess());
        }
        catch (err) {
            console.error(err);
        }

    }, []);

    useEffect(() => {
        refreshSidebarAccess();
    }, [refreshSidebarAccess]);

    const setTab = useCallback((nextTab) => {

        setTabState(nextTab);

        // A full reset, not just setting "tab" on top of whatever's already
        // there - several pages own a same-named "view" (or "table") query
        // param for their own internal sub-nav (PaasHosting.jsx, Settings.jsx,
        // Services.jsx, DatabaseView.jsx), read independently on mount with
        // no idea which page last wrote it. Leaving a stale "view=database"
        // in the URL after switching FROM Hosting Providers TO Settings, for
        // example, made Settings misread it as its own view selector and
        // land on its Database sub-page instead of the hub. No page-owned
        // param is ever meant to survive a top-level tab switch, so this
        // clears everything except the new tab itself.
        const url = new URL(window.location.href);
        url.search = `?tab=${encodeURIComponent(nextTab)}`;

        // replaceState, not pushState — switching tabs shouldn't pile up
        // browser history entries, it should just make the current page
        // reload-safe and shareable.
        window.history.replaceState(null, "", url);

        // Picking a page closes the mobile drawer — on desktop/tablet this
        // is a no-op since the drawer state has no visible effect there.
        setMobileNavOpen(false);

    }, []);

    function goToSettingsView(view) {

        setPendingSettingsView(view);
        setTab("settings");

    }

    // Lands directly on the Credentials sub-page (rather than Settings'
    // hub) since that's the only place githubRepoUrl/repoPreview actually
    // render - without this, the field was set but invisible until someone
    // manually clicked into Credentials themselves.
    function goToSettingsWithRepo(url) {

        setPendingRepoUrl(url);
        goToSettingsView("credentials");

    }

    function goToEnvironment(name) {

        setPendingEnvironmentName(name);
        setTab("environments");

    }

    function goToCloudService(serviceId) {

        setPendingCloudService(serviceId);
        setTab("cloudServices");

    }

    return (

        <NavigationContext.Provider
            value={{
                tab, setTab, pendingRepoUrl, setPendingRepoUrl, goToSettingsWithRepo,
                pendingSettingsView, setPendingSettingsView, goToSettingsView,
                pendingEnvironmentName, setPendingEnvironmentName, goToEnvironment,
                pendingCloudService, setPendingCloudService, goToCloudService,
                mobileNavOpen, setMobileNavOpen,
                sidebarAccess, refreshSidebarAccess
            }}
        >

            {children}

        </NavigationContext.Provider>

    );

}
