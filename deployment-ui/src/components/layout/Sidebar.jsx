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
    SonarQubeIcon,
    SonarCloudIcon,
    CodeQlIcon,
    EslintIcon,
    PylintIcon,
    CheckstyleIcon,
    SettingsIcon,
    GitHubGroupIcon,
    SourceControlIcon,
    GitLabIcon,
    BitbucketIcon,
    AzureDevOpsIcon,
    AzureDevOpsBranchesIcon,
    AzureDevOpsPipelinesIcon,
    AzureDevOpsArtifactsIcon,
    AzureDevOpsFeedsIcon,
    CodeCommitIcon,
    CloudServicesIcon,
    AwsCloudIcon,
    AzureCloudIcon,
    GcpCloudIcon,
    PaasMicroservicesIcon,
    ElasticBeanstalkIcon,
    HostingProvidersIcon,
    ContainerRegistryIcon,
    EcrIcon,
    AcrIcon,
    ArtifactRegistryIcon,
    DockerHubIcon,
    GhcrIcon,
    GitLabRegistryIcon,
    JfrogIcon,
    HarborIcon,
    NexusIcon,
    ObservabilityIcon,
    CloudWatchIcon,
    XRayIcon,
    AzureMonitorIcon,
    CloudMonitoringIcon,
    PrometheusIcon,
    DatadogIcon,
    ElkIcon,
    OpenSearchIcon,
    LokiIcon,
    FluentBitIcon,
    FluentdIcon,
    OpenTelemetryIcon,
    JaegerIcon,
    ZipkinIcon,
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

// Every source-control provider lives grouped under one collapsible
// "Source Control" section, itself containing two NESTED groups (its own
// "GitHub" - 9 pipeline/repo pages - and "Azure DevOps" - 4 sub-pages) plus
// GitLab/Bitbucket/AWS CodeCommit as siblings - the Sidebar supports
// arbitrarily nested groups (see renderNavItem/filterTree/flattenTabs
// below), a generalization of the single-level grouping GitHub itself
// introduced first. A "group" entry is purely a Sidebar-side
// grouping - it has no tab key of its own and never appears in App.jsx's
// tab switch; only leaf children (at any depth) do.
export const TABS = [
    { key: "dashboard", label: "Dashboard", Icon: DashboardIcon },
    {
        key: "sourceControlGroup",
        type: "group",
        label: "Source Control",
        Icon: SourceControlIcon,
        children: [
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
            // Azure DevOps - one Organization + PAT credential (see
            // Settings → Credentials → Azure DevOps) powering six real,
            // independently-navigable sub-pages. The project picker (see
            // AzureDevOpsProjectContext.jsx) used to be its own "Dashboard"
            // sub-page here; it now lives on the main portal Dashboard
            // instead (see components/dashboard/AzureDevOpsCard.jsx) - one
            // less click than leaving the portal's own Overview to pick a
            // project, and that same selection still applies to Pipelines/
            // History/Build Artifacts/Pull Requests exactly as before.
            // Branches and Package Feeds are unaffected (both already
            // org-wide). Pull Requests reuses this app's own
            // PullRequestIcon rather than a new glyph - same concept,
            // deliberately consistent iconography across providers, and
            // not adjacent to its GitHub counterpart in the rail (different
            // groups) so it doesn't repeat Round 63's "looks the same at a
            // glance" problem.
            {
                key: "azureDevOpsGroup",
                type: "group",
                label: "Azure DevOps",
                Icon: AzureDevOpsIcon,
                children: [
                    { key: "azureDevOpsBranches", label: "Branches", Icon: AzureDevOpsBranchesIcon },
                    { key: "azureDevOpsPipelines", label: "Pipelines", Icon: AzureDevOpsPipelinesIcon },
                    { key: "azureDevOpsHistory", label: "History", Icon: HistoryIcon },
                    { key: "azureDevOpsArtifacts", label: "Build Artifacts", Icon: AzureDevOpsArtifactsIcon },
                    { key: "azureDevOpsPullRequests", label: "Pull Requests", Icon: PullRequestIcon },
                    { key: "azureDevOpsFeeds", label: "Package Feeds", Icon: AzureDevOpsFeedsIcon }
                ]
            },
            // AWS CodeCommit reuses this session's own AWS credentials,
            // same as ECR does, no new credential to set up.
            { key: "codeCommit", label: "AWS CodeCommit", Icon: CodeCommitIcon },
            // Not built yet - neither provider's exact credential shape
            // (GitLab: Host URL + PAT; Bitbucket: Workspace + App
            // Password, a materially different model from either GitLab
            // or Azure DevOps) was specified, so these are real, navigable
            // pages showing an honest "not built yet" state - same
            // posture as Harbor/Nexus/ESLint before they were built out
            // (see pages/GitLab.jsx/Bitbucket.jsx) - not a guessed
            // integration, and not a disabled/unreachable sidebar entry.
            { key: "gitlab", label: "GitLab", Icon: GitLabIcon },
            { key: "bitbucket", label: "Bitbucket", Icon: BitbucketIcon }
        ]
    },
    // Not a GitHub sub-group - it browses each cloud provider's own service
    // catalog, not anything about this repo's pipeline. Deliberately NOT
    // called "Services" either way - the top-level "services" tab below is
    // a different, pre-existing admin feature (PAT user management + audit
    // log). AWS (pages/CloudServicesAws.jsx, ~100 services, live inventory,
    // region picker, per-service drill-down) and Azure (pages/
    // CloudServicesAzure.jsx, ~45 services, live account-wide inventory via
    // ARM's own generic resource list, per-service drill-down - see that
    // page's own comment on why it deliberately has no per-service
    // management actions the way AWS's EC2/ECS/ECR/Lambda/RDS/S3/VPC do)
    // both have real, built catalogs now - GCP is still a real, visible
    // "not built yet" page rather than a guessed integration, the same
    // posture as GitLab/Bitbucket/ESLint/Pylint/Checkstyle. Same self-
    // service posture as Hosting Providers below - each provider's own
    // session credential (or, for AWS, none at all needed to browse the
    // catalog itself) is the auth boundary, not a portal admin gate, so
    // none of these 3 belong in ADMIN_ONLY_TABS.
    {
        key: "cloudServicesGroup",
        type: "group",
        label: "Cloud Services",
        Icon: CloudServicesIcon,
        children: [
            { key: "cloudServicesOverview", label: "Overview", Icon: CloudServicesIcon },
            { key: "cloudServicesAws", label: "AWS", Icon: AwsCloudIcon },
            { key: "cloudServicesAzure", label: "Azure", Icon: AzureCloudIcon },
            { key: "cloudServicesGcp", label: "GCP", Icon: GcpCloudIcon },
            // PaaS/Microservices nested here, not a top-level group of its
            // own - lifecycle management for customer-deployed PaaS apps
            // (AWS Elastic Beanstalk / Azure App Service + slots / GCP
            // Cloud Run), a real sub-concern of Cloud Services rather than
            // a separate top-level category. Still NOT the same thing as
            // "Hosting Providers" below (this portal's own hosting) -
            // that stays its own distinct nav item, same reasoning as
            // before, just no longer needing a whole extra top-level
            // group to keep that distinction clear.
            {
                key: "paasMicroservicesGroup",
                type: "group",
                label: "PaaS / Microservices",
                Icon: PaasMicroservicesIcon,
                children: [
                    { key: "paasHub", label: "All Applications", Icon: PaasMicroservicesIcon },
                    { key: "paasElasticBeanstalk", label: "Elastic Beanstalk", Icon: ElasticBeanstalkIcon },
                    { key: "paasAzureAppService", label: "App Service", Icon: AzureCloudIcon },
                    { key: "cloudServicesGcp", label: "Cloud Run (GCP)", Icon: GcpCloudIcon }
                ]
            }
        ]
    },
    // Session-scoped Render/Cloudflare/Netlify/Vercel connections (see
    // pages/PaasHosting.jsx) - same open, self-service posture as Cloud
    // Services above: not in GATED_TABS/ADMIN_ONLY_TABS below, and not in
    // SettingsService.GrantablePageKeys, since this is the visitor's own
    // account credential, not a portal-admin-gated feature.
    { key: "paasHosting", label: "Hosting Providers", Icon: HostingProvidersIcon },
    // Every container image registry provider as its own nested sidebar
    // page, same "collapsible group" treatment as GitHub/Code Quality above
    // - each child is a real, independently-navigable page (own tab key,
    // own App.jsx route), not a tile inside one shared hub page (the
    // earlier design, see git history for pages/ContainerRegistry.jsx's
    // prior tile-grid version - fully retired, no tab key survives it).
    // Kept deliberately separate from "docker" below, which is Docker
    // *Engine* management (containers/images/volumes on the host) - a
    // different concept from a container *registry*, and reusing that nav
    // item would have recreated the exact naming confusion Hosting
    // Providers' own redesign already hit once this session. Same self-
    // service posture as Cloud Services/Hosting Providers above for the 3
    // cloud-native providers (each one's own session credential is the
    // auth boundary); the 6 standalone registries (Docker Hub/GHCR/GitLab/
    // JFrog/Harbor/Nexus) use a portal-wide shared credential instead, but
    // VIEWING them is still open to everyone - only saving/clearing that
    // shared credential (in Settings → Credentials) is admin-gated, so
    // none of these 9 children belong in ADMIN_ONLY_TABS below.
    {
        key: "containerRegistryGroup",
        type: "group",
        label: "Container Registry",
        Icon: ContainerRegistryIcon,
        children: [
            { key: "ecr", label: "AWS ECR", Icon: EcrIcon },
            { key: "acr", label: "Azure ACR", Icon: AcrIcon },
            { key: "artifactRegistry", label: "Artifact Registry", Icon: ArtifactRegistryIcon },
            { key: "dockerHub", label: "Docker Hub", Icon: DockerHubIcon },
            { key: "ghcr", label: "GHCR", Icon: GhcrIcon },
            { key: "gitlabRegistry", label: "GitLab Registry", Icon: GitLabRegistryIcon },
            { key: "jfrog", label: "JFrog Artifactory", Icon: JfrogIcon },
            { key: "harbor", label: "Harbor", Icon: HarborIcon },
            { key: "nexus", label: "Nexus", Icon: NexusIcon }
        ]
    },
    // Observability - 4 CSP-native tools (CloudWatch/X-Ray/Azure Monitor/
    // Cloud Monitoring) with real, live data reusing this session's
    // already-connected AWS/Azure/GCP credential (same self-service
    // posture as Cloud Services/Container Registry's own cloud-native
    // providers above - no separate connect step); 10 standalone tools
    // (Prometheus/Datadog/ELK/OpenSearch/Loki/Fluent Bit/Fluentd/
    // OpenTelemetry/Jaeger/Zipkin) each with their own session-scoped
    // credential, reusing PortalHostCredentials' generic (Host URL/
    // Username/Password) storage - the exact same mechanism Harbor/Nexus
    // already use above, just under Observability's own provider set and
    // routes (see ObservabilityController.cs) rather than Container
    // Registry's, since none of these 10 are a container registry.
    {
        key: "observabilityGroup",
        type: "group",
        label: "Observability",
        Icon: ObservabilityIcon,
        children: [
            { key: "cloudwatch", label: "CloudWatch", Icon: CloudWatchIcon },
            { key: "xray", label: "AWS X-Ray", Icon: XRayIcon },
            { key: "azuremonitor", label: "Azure Monitor", Icon: AzureMonitorIcon },
            { key: "cloudmonitoring", label: "Cloud Monitoring", Icon: CloudMonitoringIcon },
            { key: "prometheus", label: "Prometheus", Icon: PrometheusIcon },
            { key: "datadog", label: "Datadog", Icon: DatadogIcon },
            { key: "elk", label: "ELK", Icon: ElkIcon },
            { key: "opensearch", label: "OpenSearch", Icon: OpenSearchIcon },
            { key: "loki", label: "Loki", Icon: LokiIcon },
            { key: "fluentbit", label: "Fluent Bit", Icon: FluentBitIcon },
            { key: "fluentd", label: "Fluentd", Icon: FluentdIcon },
            { key: "opentelemetry", label: "OpenTelemetry", Icon: OpenTelemetryIcon },
            { key: "jaeger", label: "Jaeger", Icon: JaegerIcon },
            { key: "zipkin", label: "Zipkin", Icon: ZipkinIcon }
        ]
    },
    { key: "services", label: "Services", Icon: ServicesIcon },
    { key: "docker", label: "Docker", Icon: DockerIcon },
    // Every code-quality/static-analysis tool as its own nested sidebar
    // page, same "collapsible group" treatment as GitHub above - each
    // child is a real, independently-navigable page (own tab key, own
    // App.jsx route), not a tile inside one shared page. SonarQube and
    // SonarCloud are now two fully independent credentials/pages (split
    // per explicit request - previously one shared connection covered
    // both). "codeQuality" is kept as SonarQube's own key specifically so
    // the existing backend admin gate (AdminGate.DenyUnlessAdminAsync(...,
    // "codeQuality") in SonarController) and the existing grantable-page-
    // key list both keep working unchanged for it; "sonarcloud" is a new
    // key added to ADMIN_ONLY_TABS below (same admin-only reasoning - one
    // shared team credential, not per-user - just now its own credential
    // too). CodeQL reuses this session's own GitHub token as ITS auth
    // boundary the same way Artifacts/Analytics/History do, so it stays
    // open like they are, not grouped into the same admin-only bucket.
    {
        key: "codeQualityGroup",
        type: "group",
        label: "Code Quality",
        Icon: CodeQualityIcon,
        children: [
            { key: "codeQuality", label: "SonarQube", Icon: SonarQubeIcon },
            { key: "sonarcloud", label: "SonarCloud", Icon: SonarCloudIcon },
            { key: "codeql", label: "CodeQL", Icon: CodeQlIcon },
            { key: "eslint", label: "ESLint", Icon: EslintIcon },
            { key: "pylint", label: "Pylint", Icon: PylintIcon },
            { key: "checkstyle", label: "Checkstyle", Icon: CheckstyleIcon }
        ]
    },
    { key: "settings", label: "Settings", Icon: SettingsIcon }
];

// Flattened view of TABS - every real (leaf) page with none of the
// Sidebar-only grouping structure, at any nesting depth - for anything
// that just needs "the list of pages" (HeaderSearch's results) rather than
// how Sidebar happens to nest them.
function flattenTabs(items) {
    return items.flatMap((t) => (t.type === "group" ? flattenTabs(t.children) : [t]));
}

export const FLAT_TABS = flattenTabs(TABS);

// Admin-only, same as Settings > Sidebar Access / Activity Log — there's
// one shared Sonar project for the whole repo (not scoped per PAT user),
// and the backend rejects a non-admin outright (see SonarController), so
// showing this tab to anyone else would just be a dead end. Services is
// admin-only for the same reason: its Users/Audit Log tabs now read the
// real PAT-users list and activity log (see AdminUsersController/
// SecurityAuditLogController), both already admin-gated server-side.
export const ADMIN_ONLY_TABS = new Set(["codeQuality", "sonarcloud", "services"]);

const STORAGE_KEY = "sidebar-collapsed";
const GROUP_STORAGE_KEY = "sidebar-groups-collapsed";

// Left-hand nav. On tablet/desktop (>=768px, see global.css) it's a
// persistent rail, expanded with full labels by default, with a small
// arrow to collapse it to icons-only. (An earlier version defaulted to
// collapsed, matching a Google Keep-style rail per an explicit request at
// the time - reversed on later, equally explicit feedback that a bare
// icon column with no labels, and every nested group inside it ALSO
// collapsed by default, read as broken rather than intentional.) Below
// 768px the same markup instead becomes an off-canvas drawer — hidden
// until TopBar's hamburger opens it, always full-width/full-label there
// regardless of the desktop collapse state, since an icon-only overlay
// makes little sense when it's not saving any persistent layout space to
// begin with. Settings lives as the last nav item rather than only being
// reachable through the account badge in TopBar.
export default function Sidebar() {

    const { tab, setTab, mobileNavOpen, setMobileNavOpen, sidebarAccess } = useNavigation();
    const { canApproveReleases, isAdminSession, grantedPages } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const toast = useToast();

    const [collapsed, setCollapsed] = useState(() => {

        // No stored preference (first visit, or localStorage cleared) now
        // defaults to expanded, not collapsed - see the comment above this
        // component. Anyone who's ever actually clicked the collapse
        // toggle keeps exactly whatever they chose, either direction.
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === null ? false : stored === "true";

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
    // rather than showing an empty, useless header. Recursive so a group
    // nested inside another group (Source Control > GitHub) is filtered
    // the same way at every depth.
    function filterTree(items) {
        return items
            .map((t) => t.type === "group" ? { ...t, children: filterTree(t.children) } : t)
            .filter((t) => t.type === "group" ? t.children.length > 0 : itemVisible(t));
    }

    const visibleTabs = filterTree(TABS);

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

        setGroupsCollapsed((prev) => {

            const next = { ...prev, [key]: !prev[key] };
            localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(next));
            return next;

        });

    }

    // A single nav row - shared by leaf tabs at any nesting depth so they
    // never visually drift apart.
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

    // Whether the currently active tab lives anywhere under this item -
    // for a leaf, just an equality check; for a group, recurse into its
    // children at any depth. Drives both the header's "active" styling and
    // its forced-expanded state, so a group (or a group nested inside
    // another group) can never end up collapsed while the page you're
    // actually on lives inside it.
    function containsActiveTab(item) {
        return item.type === "group"
            ? item.children.some(containsActiveTab)
            : item.key === tab;
    }

    // One nav item, recursively - a leaf renders as a button; a group
    // renders its own header (toggling that group's own collapse state,
    // keyed independently per group so a nested group and its parent
    // collapse/expand separately) plus its children rendered the same way,
    // however deep that nesting goes. This is what makes Source Control >
    // GitHub > Deploy/Approvals/... work as a real 3-level tree using the
    // exact same rendering code as every 2-level group already uses.
    function renderNavItem(item) {

        if (item.type !== "group") {
            return renderTabButton(item);
        }

        const groupActive = containsActiveTab(item);

        // groupsCollapsed[key] is undefined until a visitor explicitly
        // clicks this group's own header at least once - before that,
        // the DEFAULT expanded state depends on the rail itself: expanded
        // when it's the full labeled rail (nothing to hide, matches how
        // grouping originally behaved), collapsed when it's icon-only
        // (four nested groups now between them hold 30+ leaf pages - all
        // of them stacking up as bare icons with no labels to tell them
        // apart made the icon rail unusably long). Either way, a group
        // that contains the active page is always forced open, so
        // collapsing one can never hide where you currently are - and an
        // explicit prior click always wins over both defaults.
        const hasExplicitState = Object.prototype.hasOwnProperty.call(groupsCollapsed, item.key);
        const defaultExpanded = !collapsed;
        const isExpanded = groupActive || (hasExplicitState ? !groupsCollapsed[item.key] : defaultExpanded);

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
                        {item.children.map((child) => renderNavItem(child))}
                    </div>
                )}

            </div>

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

                    {visibleTabs.map((item) => renderNavItem(item))}

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
