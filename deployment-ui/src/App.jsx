import { useEffect } from "react";

import Dashboard from "./pages/Dashboard";
import Deploy from "./pages/Deploy";
import Approvals from "./pages/Approvals";
import PullRequests from "./pages/PullRequests";
import Storage from "./pages/Storage";
import History from "./pages/History";
import Analytics from "./pages/Analytics";
import Timeline from "./pages/Timeline";
import TemplateTester from "./pages/TemplateTester";
import Services from "./pages/Services";
import Docker from "./pages/Docker";
import CodeQuality from "./pages/CodeQuality";
import Settings from "./pages/Settings";

import TopBar from "./components/layout/TopBar";
import Sidebar from "./components/layout/Sidebar";
import Footer from "./components/layout/Footer";
import ErrorBoundary from "./components/common/ErrorBoundary";
import RequireGitHubSetup from "./components/RequireGitHubSetup";
import useNavigation from "./hooks/useNavigation";
import useAuth from "./hooks/useAuth";
import useToast from "./hooks/useToast";

// Admin-only regardless of Sidebar Access state — there's one shared Sonar
// project for the whole repo, and the backend rejects a non-admin outright
// (see SonarController), so a direct/bookmarked link needs the same guard
// the Sidebar tab itself already gets (see Sidebar.jsx's ADMIN_ONLY_TABS).
const ADMIN_ONLY_TABS = new Set(["codeQuality"]);

function App(){

    const { tab, setTab, sidebarAccess } = useNavigation();
    const { isAdminSession, oauthStatusChecked } = useAuth();
    const toast = useToast();

    // Locking/hiding a tab (see Settings > Sidebar Access) has to actually
    // block it, not just grey out its Sidebar entry — otherwise a direct
    // link or an already-open tab in another window still reaches it.
    // "settings" itself is never restrictable (see SettingsService), so
    // there's always a way back regardless of what's locked.
    useEffect(() => {

        const state = sidebarAccess[tab];

        if (tab !== "settings" && (state === "locked" || state === "hidden")) {

            toast.show("This section has been restricted by the portal admin.", "error");
            setTab("dashboard");
            return;

        }

        // isAdminSession starts false and only becomes reliable once
        // oauthStatusChecked flips true (see AuthContext) - enforcing this
        // before then would bounce a real admin on every hard reload of an
        // admin-only tab, since the check hasn't resolved yet.
        if (ADMIN_ONLY_TABS.has(tab) && oauthStatusChecked && !isAdminSession) {

            toast.show("This section is admin-only.", "error");
            setTab("dashboard");

        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, sidebarAccess, isAdminSession, oauthStatusChecked]);

    return(

        <>

            <TopBar />

            <RequireGitHubSetup>

                <div className="app-body">

                    <Sidebar />

                    <div className="app-content-column">

                        <ErrorBoundary key={tab} onRecover={() => setTab("dashboard")}>

                            {tab === "dashboard" && <Dashboard/>}
                            {tab === "deploy" && <Deploy/>}
                            {tab === "approvals" && <Approvals/>}
                            {tab === "pullRequests" && <PullRequests/>}
                            {tab === "storage" && <Storage/>}
                            {tab === "analytics" && <Analytics/>}
                            {tab === "timeline" && <Timeline/>}
                            {tab === "history" && <History/>}
                            {tab === "templates" && <TemplateTester/>}
                            {tab === "services" && <Services/>}
                            {tab === "docker" && <Docker/>}
                            {tab === "codeQuality" && <CodeQuality/>}
                            {tab === "settings" && <Settings/>}

                        </ErrorBoundary>

                        <Footer />

                    </div>

                </div>

            </RequireGitHubSetup>

        </>

    );

}

export default App;
