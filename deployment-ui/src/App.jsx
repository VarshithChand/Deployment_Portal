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

function App(){

    const { tab, setTab } = useNavigation();

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
