import { lazy, Suspense, useEffect, useState } from "react";

// Lazy, not the eager import this used to be - that traded a real cost
// (every visitor, including 100% of anonymous ones who only ever see
// LoginSignupPage, downloaded Dashboard's full JS as part of the same
// critical bundle, since a static import gets bundled by import graph
// regardless of which JSX branch actually renders) for a benefit
// (no second network round trip before an already-authenticated user's
// first tab renders) that only ever mattered for the authenticated
// branch. The preload effect below (see `dashboardPreloaded`) gets that
// same benefit back WITHOUT the anonymous-visitor cost - it starts
// fetching this chunk in parallel the moment a real session is known to
// exist, well before Dashboard's own render is reached.
const Dashboard = lazy(() => import("./pages/Dashboard"));
import TopBar from "./components/layout/TopBar";
import Sidebar from "./components/layout/Sidebar";
import Footer from "./components/layout/Footer";
import ErrorBoundary from "./components/common/ErrorBoundary";
import LoginSignupPage from "./pages/LoginSignupPage";
import MfaVerifyPage from "./pages/MfaVerifyPage";
import PeriodicSignOutMonitor from "./components/PeriodicSignOutMonitor";
import GlobalLogoutMonitor from "./components/GlobalLogoutMonitor";
import MfaEnforcementGate from "./components/MfaEnforcementGate";
import AppUpdateMonitor from "./components/AppUpdateMonitor";
import DeploymentCopilot from "./components/copilot/DeploymentCopilot";
import LoadingSpinner from "./components/LoadingSpinner";
import useNavigation from "./hooks/useNavigation";
import useAuth from "./hooks/useAuth";
import useToast from "./hooks/useToast";
import useCardTilt from "./hooks/useCardTilt";
import { reportFrontendHeartbeat } from "./services/appVersionService";
import { getMfaPendingStatus } from "./services/authLoginService";
import { APP_COMMIT, APP_VERSION, APP_ENVIRONMENT } from "./utils/buildInfo";

// Every page (Dashboard included, see its own import above) is lazy -
// none of them are needed until the user actually reaches that tab, so
// there's no reason for any of their code to sit in the initial JS
// bundle a first-time (possibly still-anonymous) visitor has to
// download before anything renders.
const Deploy = lazy(() => import("./pages/Deploy"));
const Approvals = lazy(() => import("./pages/Approvals"));
const PullRequests = lazy(() => import("./pages/PullRequests"));
const Storage = lazy(() => import("./pages/Storage"));
const History = lazy(() => import("./pages/History"));
const Environments = lazy(() => import("./pages/Environments"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Timeline = lazy(() => import("./pages/Timeline"));
const TemplateTester = lazy(() => import("./pages/TemplateTester"));
const AzureDevOpsBranches = lazy(() => import("./pages/AzureDevOpsBranches"));
const AzureDevOpsPipelines = lazy(() => import("./pages/AzureDevOpsPipelines"));
const AzureDevOpsHistory = lazy(() => import("./pages/AzureDevOpsHistory"));
const AzureDevOpsArtifacts = lazy(() => import("./pages/AzureDevOpsArtifacts"));
const AzureDevOpsPullRequests = lazy(() => import("./pages/AzureDevOpsPullRequests"));
const AzureDevOpsFeeds = lazy(() => import("./pages/AzureDevOpsFeeds"));
const CodeCommit = lazy(() => import("./pages/CodeCommit"));
const GitLab = lazy(() => import("./pages/GitLab"));
const Bitbucket = lazy(() => import("./pages/Bitbucket"));
const CloudServicesOverview = lazy(() => import("./pages/CloudServicesOverview"));
const CloudServicesAws = lazy(() => import("./pages/CloudServicesAws"));
const CloudServicesAzure = lazy(() => import("./pages/CloudServicesAzure"));
const CloudServicesGcp = lazy(() => import("./pages/CloudServicesGcp"));
const PaasHub = lazy(() => import("./pages/PaasHub"));
const PaasElasticBeanstalk = lazy(() => import("./pages/PaasElasticBeanstalk"));
const PaasAzureAppService = lazy(() => import("./pages/PaasAzureAppService"));
const PaasHosting = lazy(() => import("./pages/PaasHosting"));
const Ecr = lazy(() => import("./pages/Ecr"));
const Acr = lazy(() => import("./pages/Acr"));
const ArtifactRegistry = lazy(() => import("./pages/ArtifactRegistry"));
const DockerHub = lazy(() => import("./pages/DockerHub"));
const Ghcr = lazy(() => import("./pages/Ghcr"));
const GitLabRegistry = lazy(() => import("./pages/GitLabRegistry"));
const Jfrog = lazy(() => import("./pages/Jfrog"));
const Harbor = lazy(() => import("./pages/Harbor"));
const Nexus = lazy(() => import("./pages/Nexus"));
const CloudWatch = lazy(() => import("./pages/CloudWatch"));
const XRay = lazy(() => import("./pages/XRay"));
const AzureMonitor = lazy(() => import("./pages/AzureMonitor"));
const CloudMonitoring = lazy(() => import("./pages/CloudMonitoring"));
const Prometheus = lazy(() => import("./pages/Prometheus"));
const Datadog = lazy(() => import("./pages/Datadog"));
const Elk = lazy(() => import("./pages/Elk"));
const OpenSearch = lazy(() => import("./pages/OpenSearch"));
const Loki = lazy(() => import("./pages/Loki"));
const FluentBit = lazy(() => import("./pages/FluentBit"));
const Fluentd = lazy(() => import("./pages/Fluentd"));
const OpenTelemetry = lazy(() => import("./pages/OpenTelemetry"));
const Jaeger = lazy(() => import("./pages/Jaeger"));
const Zipkin = lazy(() => import("./pages/Zipkin"));
const Services = lazy(() => import("./pages/Services"));
const Docker = lazy(() => import("./pages/Docker"));
const CodeQuality = lazy(() => import("./pages/CodeQuality"));
const SonarCloud = lazy(() => import("./pages/SonarCloud"));
const CodeQl = lazy(() => import("./pages/CodeQl"));
const Eslint = lazy(() => import("./pages/Eslint"));
const Pylint = lazy(() => import("./pages/Pylint"));
const Checkstyle = lazy(() => import("./pages/Checkstyle"));
const Settings = lazy(() => import("./pages/Settings"));

// Admin-only regardless of Sidebar Access state — same guard the Sidebar
// tabs themselves already get (see Sidebar.jsx's ADMIN_ONLY_TABS), needed
// here too so a direct/bookmarked link can't bypass it.
const ADMIN_ONLY_TABS = new Set(["codeQuality", "sonarcloud", "services"]);

function App(){

    const { tab, setTab, sidebarAccess } = useNavigation();
    const { user, isAdminSession, grantedPages, oauthStatusChecked, bootstrapError } = useAuth();
    const toast = useToast();

    useCardTilt();

    // Which of the two pre-auth pages to show — null (still checking)
    // until a real GET api/auth/login-mfa/pending answers it, so a browser
    // refresh that lands mid-MFA goes straight back to the MFA page
    // instead of bouncing to the login page first (the server's pending
    // state is what decides this, never an assumption).
    //
    // Fired immediately on mount, in PARALLEL with AuthContext's own
    // bootstrap fetch below (not sequenced after it, which is what this
    // used to do via a "wait for oauthStatusChecked, THEN start this"
    // effect) - a Lighthouse run against a first-time visitor showed a
    // weak Speed Index, and chaining two network round trips back-to-back
    // before ANY real content could paint was a real, fixable part of
    // that. Racing them instead means the pre-auth gate's total wait is
    // max(bootstrap, mfa-pending) rather than their sum. The extra
    // GET mfa/pending call this now fires even for an already-configured
    // returning visitor (whose result never ends up used) is a trivial
    // in-memory dictionary lookup server-side - cheap enough that always
    // firing it is simpler and safer than adding a second gate to skip it.
    const [mfaPending, setMfaPending] = useState(null);

    useEffect(() => {

        getMfaPendingStatus()
            .then((result) => setMfaPending(!!result.pending))
            .catch(() => setMfaPending(false));

    }, []);


    const checking = !oauthStatusChecked;
    // "configured" now means "a real account session exists" - user is set
    // exactly when the bootstrap response's auth.authenticated is true
    // (see AuthContext), true for all 3 login methods alike since they all
    // issue the same JWT shape.
    const configured = bootstrapError || !!user;

    // Starts fetching Dashboard's chunk the moment a real session is known
    // to exist - well before its own render is reached (tab still has to
    // switch away from whatever the app boots into) - so an authenticated
    // visitor landing on their default tab gets the same "no extra round
    // trip" feel the old eager import gave them, without that cost being
    // paid by every anonymous visitor too (see Dashboard's own import
    // comment above). Guarded so this only ever fires once.
    const [dashboardPreloaded, setDashboardPreloaded] = useState(false);

    useEffect(() => {

        if (configured && user && !dashboardPreloaded) {
            setDashboardPreloaded(true);
            import("./pages/Dashboard");
        }

    }, [configured, user, dashboardPreloaded]);

    // Fired once per real app load (not polled) - reports this browser's
    // own build-time commit so Services -> Application Support can show
    // an admin which frontend build any given session is actually running
    // (see ApplicationSupportToolsService/AdminUsersController). A failure
    // here is silently non-fatal - it's diagnostic-only, never something
    // that should block or disrupt normal use of the portal.
    useEffect(() => {

        reportFrontendHeartbeat(APP_COMMIT, APP_VERSION, APP_ENVIRONMENT).catch((err) => console.error(err));

    }, []);

    // A successful mount means this tab is now running fresh, current
    // assets - reset ErrorBoundary's stale-chunk reload guard so a LATER
    // deploy's staleness (a tab left open again for a long time) still
    // gets its own single auto-reload attempt instead of the guard from
    // an earlier recovery blocking it for the rest of this tab's life.
    useEffect(() => {

        sessionStorage.removeItem("chunkErrorAutoReloaded");

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
        // admin-only tab, since the check hasn't resolved yet. Also lets
        // through anyone individually granted scoped access to just this
        // one page (see Settings' "Page Access" / grantedPages) - without
        // that check, a page-scoped (not full-admin) grantee got bounced
        // back to Dashboard before ever reaching the page the backend's
        // own AdminGate check had already agreed they could use.
        if (ADMIN_ONLY_TABS.has(tab) && oauthStatusChecked && !isAdminSession && !grantedPages.includes(tab)) {

            toast.show("This section is admin-only.", "error");
            setTab("dashboard");

        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, sidebarAccess, isAdminSession, grantedPages, oauthStatusChecked]);

    // Gated BEFORE any app chrome renders — TopBar/Sidebar must not appear
    // at all until a real credential exists (see the mockups: bare pages,
    // no chrome). A deliberate, scoped reversal of the "app shell mounts
    // immediately" LCP optimization, for this one pre-auth moment only —
    // an already-connected returning visitor is unaffected either way,
    // since bootstrap resolves configured before anything below renders.
    // mfaPending is deliberately NOT part of this first check - an
    // authenticated/configured visitor never needs its answer at all, so
    // making them wait on it too (as an earlier version of this gate
    // briefly did) would reintroduce exactly the kind of unnecessary
    // sequential wait this change set out to remove.
    if (checking) return <LoadingSpinner />;

    if (!configured) {

        if (mfaPending === null) return <LoadingSpinner />;

        if (mfaPending) {

            return (
                <MfaVerifyPage
                    onBack={(message) => {
                        if (message) toast.show(message, "error");
                        setMfaPending(false);
                    }}
                />
            );

        }

        return (
            <LoginSignupPage
                onMfaRequired={() => setMfaPending(true)}
            />
        );

    }

    return(

        <>

            <TopBar />

            <PeriodicSignOutMonitor />
            <GlobalLogoutMonitor />
            <MfaEnforcementGate />
            <AppUpdateMonitor />
            <DeploymentCopilot />

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
                            {tab === "azureDevOpsBranches" && <AzureDevOpsBranches/>}
                            {tab === "azureDevOpsPipelines" && <AzureDevOpsPipelines/>}
                            {tab === "azureDevOpsHistory" && <AzureDevOpsHistory/>}
                            {tab === "azureDevOpsArtifacts" && <AzureDevOpsArtifacts/>}
                            {tab === "azureDevOpsPullRequests" && <AzureDevOpsPullRequests/>}
                            {tab === "azureDevOpsFeeds" && <AzureDevOpsFeeds/>}
                            {tab === "codeCommit" && <CodeCommit/>}
                            {tab === "gitlab" && <GitLab/>}
                            {tab === "bitbucket" && <Bitbucket/>}
                            {tab === "cloudServicesOverview" && <CloudServicesOverview/>}
                            {tab === "cloudServicesAws" && <CloudServicesAws/>}
                            {tab === "cloudServicesAzure" && <CloudServicesAzure/>}
                            {tab === "cloudServicesGcp" && <CloudServicesGcp/>}
                            {tab === "paasHub" && <PaasHub/>}
                            {tab === "paasElasticBeanstalk" && <PaasElasticBeanstalk/>}
                            {tab === "paasAzureAppService" && <PaasAzureAppService/>}
                            {tab === "paasHosting" && <PaasHosting/>}
                            {tab === "ecr" && <Ecr/>}
                            {tab === "acr" && <Acr/>}
                            {tab === "artifactRegistry" && <ArtifactRegistry/>}
                            {tab === "dockerHub" && <DockerHub/>}
                            {tab === "ghcr" && <Ghcr/>}
                            {tab === "gitlabRegistry" && <GitLabRegistry/>}
                            {tab === "jfrog" && <Jfrog/>}
                            {tab === "harbor" && <Harbor/>}
                            {tab === "nexus" && <Nexus/>}
                            {tab === "cloudwatch" && <CloudWatch/>}
                            {tab === "xray" && <XRay/>}
                            {tab === "azuremonitor" && <AzureMonitor/>}
                            {tab === "cloudmonitoring" && <CloudMonitoring/>}
                            {tab === "prometheus" && <Prometheus/>}
                            {tab === "datadog" && <Datadog/>}
                            {tab === "elk" && <Elk/>}
                            {tab === "opensearch" && <OpenSearch/>}
                            {tab === "loki" && <Loki/>}
                            {tab === "fluentbit" && <FluentBit/>}
                            {tab === "fluentd" && <Fluentd/>}
                            {tab === "opentelemetry" && <OpenTelemetry/>}
                            {tab === "jaeger" && <Jaeger/>}
                            {tab === "zipkin" && <Zipkin/>}
                            {tab === "services" && <Services/>}
                            {tab === "docker" && <Docker/>}
                            {tab === "codeQuality" && <CodeQuality/>}
                            {tab === "sonarcloud" && <SonarCloud/>}
                            {tab === "codeql" && <CodeQl/>}
                            {tab === "eslint" && <Eslint/>}
                            {tab === "pylint" && <Pylint/>}
                            {tab === "checkstyle" && <Checkstyle/>}
                            {tab === "settings" && <Settings/>}

                        </Suspense>

                    </ErrorBoundary>

                    <Footer />

                </div>

            </div>

        </>

    );

}

export default App;
