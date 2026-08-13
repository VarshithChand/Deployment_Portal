import { lazy, Suspense, useEffect } from "react";

import Dashboard from "./pages/Dashboard";
import TopBar from "./components/layout/TopBar";
import Sidebar from "./components/layout/Sidebar";
import Footer from "./components/layout/Footer";
import ErrorBoundary from "./components/common/ErrorBoundary";
import RequireGitHubSetup from "./components/RequireGitHubSetup";
import PeriodicSignOutMonitor from "./components/PeriodicSignOutMonitor";
import GlobalLogoutMonitor from "./components/GlobalLogoutMonitor";
import AppUpdateMonitor from "./components/AppUpdateMonitor";
import DeploymentCopilot from "./components/copilot/DeploymentCopilot";
import LoadingSpinner from "./components/LoadingSpinner";
import useNavigation from "./hooks/useNavigation";
import useAuth from "./hooks/useAuth";
import useToast from "./hooks/useToast";
import useCardTilt from "./hooks/useCardTilt";
import { reportFrontendHeartbeat } from "./services/appVersionService";
import { APP_COMMIT, APP_VERSION, APP_ENVIRONMENT } from "./utils/buildInfo";

// Dashboard (imported above) is the default landing tab (see
// NavigationContext's readTabFromUrl) - kept as a real, eager import so it
// ships in the same chunk as the app shell instead of costing a second
// network round trip before the very first thing a visitor sees can even
// start loading. Every other page is lazy - none of them are needed until
// the user actually clicks their way there, so there's no reason for their
// code to sit in the initial JS bundle competing with Dashboard for
// parse/execute time.
const Deploy = lazy(() => import("./pages/Deploy"));
const Approvals = lazy(() => import("./pages/Approvals"));
const PullRequests = lazy(() => import("./pages/PullRequests"));
const Storage = lazy(() => import("./pages/Storage"));
const History = lazy(() => import("./pages/History"));
const Environments = lazy(() => import("./pages/Environments"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Timeline = lazy(() => import("./pages/Timeline"));
const TemplateTester = lazy(() => import("./pages/TemplateTester"));
const CloudServices = lazy(() => import("./pages/CloudServices"));
const Services = lazy(() => import("./pages/Services"));
const Docker = lazy(() => import("./pages/Docker"));
const CodeQuality = lazy(() => import("./pages/CodeQuality"));
const Settings = lazy(() => import("./pages/Settings"));

// Admin-only regardless of Sidebar Access state — same guard the Sidebar
// tabs themselves already get (see Sidebar.jsx's ADMIN_ONLY_TABS), needed
// here too so a direct/bookmarked link can't bypass it.
const ADMIN_ONLY_TABS = new Set(["codeQuality", "services"]);

function App(){

    const { tab, setTab, sidebarAccess } = useNavigation();
    const { isAdminSession, oauthStatusChecked } = useAuth();
    const toast = useToast();

    useCardTilt();

    // Fired once per real app load (not polled) - reports this browser's
    // own build-time commit so Services -> Application Support can show
    // an admin which frontend build any given session is actually running
    // (see ApplicationSupportToolsService/AdminUsersController). A failure
    // here is silently non-fatal - it's diagnostic-only, never something
    // that should block or disrupt normal use of the portal.
    useEffect(() => {

        reportFrontendHeartbeat(APP_COMMIT, APP_VERSION, APP_ENVIRONMENT).catch((err) => console.error(err));

    }, []);

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

            <PeriodicSignOutMonitor />
            <GlobalLogoutMonitor />
            <AppUpdateMonitor />
            <DeploymentCopilot />

            <RequireGitHubSetup>

                <div className="app-body">

                    <Sidebar />

                    <div className="app-content-column">

                        <ErrorBoundary key={tab} onRecover={() => setTab("dashboard")}>

                            <Suspense fallback={<LoadingSpinner />}>

                                {tab === "dashboard" && <Dashboard/>}
                                {tab === "deploy" && <Deploy/>}
                                {tab === "approvals" && <Approvals/>}
                                {tab === "pullRequests" && <PullRequests/>}
                                {tab === "storage" && <Storage/>}
                                {tab === "analytics" && <Analytics/>}
                                {tab === "timeline" && <Timeline/>}
                                {tab === "history" && <History/>}
                                {tab === "environments" && <Environments/>}
                                {tab === "templates" && <TemplateTester/>}
                                {tab === "cloudServices" && <CloudServices/>}
                                {tab === "services" && <Services/>}
                                {tab === "docker" && <Docker/>}
                                {tab === "codeQuality" && <CodeQuality/>}
                                {tab === "settings" && <Settings/>}

                            </Suspense>

                        </ErrorBoundary>

                        <Footer />

                    </div>

                </div>

            </RequireGitHubSetup>

        </>

    );

}

export default App;
