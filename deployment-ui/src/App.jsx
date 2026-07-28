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
import Settings from "./pages/Settings";

import TopBar from "./components/layout/TopBar";
import Sidebar from "./components/layout/Sidebar";
import Footer from "./components/layout/Footer";
import ErrorBoundary from "./components/common/ErrorBoundary";
import RequireGitHubSetup from "./components/RequireGitHubSetup";
import useNavigation from "./hooks/useNavigation";
import useToast from "./hooks/useToast";

function App(){

    const { tab, setTab, sidebarAccess } = useNavigation();
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

        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, sidebarAccess]);

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
