// Deliberately simple geometric icons (rects/circles/lines only, no
// hand-authored curve paths) so nothing risks rendering as a garbled
// shape — each one is legible even at 18px.

const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 18 18",
    fill: "none",
    "aria-hidden": true
};

export function DashboardIcon() {
    return (
        <svg {...common}>
            <rect x="2" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
            <rect x="10" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
            <rect x="2" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
            <rect x="10" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
        </svg>
    );
}

export function DeployIcon() {
    return (
        <svg {...common}>
            <line x1="9" y1="15" x2="9" y2="4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <polyline points="4,9 9,3 14,9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function ApprovalsIcon() {
    return (
        <svg {...common}>
            <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.4" />
            <polyline points="5.5,9.2 8,11.7 12.5,6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// Simplified git-merge glyph: two connected nodes on the left (the PR's
// source branch) with a right-angle line merging into a third node (the
// base branch) — built from circles/line/polyline only, no curves.
export function PullRequestIcon() {
    return (
        <svg {...common}>
            <circle cx="5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="5" cy="13.5" r="2" stroke="currentColor" strokeWidth="1.4" />
            <line x1="5" y1="6.5" x2="5" y2="11.5" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="13" cy="13.5" r="2" stroke="currentColor" strokeWidth="1.4" />
            <polyline points="7,4.5 13,4.5 13,11.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// Shackle (circle) sitting above the case (rect) — the rect's top edge
// crosses the circle's lower half, reading as a padlock from rects/circles
// alone with no hand-authored curve path.
export function LockIcon() {
    return (
        <svg {...common}>
            <circle cx="9" cy="7" r="3.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
            <rect x="4" y="8" width="10" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
        </svg>
    );
}

// Two stacked boxes (a small one atop a larger one) — a shipping-container
// metaphor distinct from both DashboardIcon's 2x2 grid and StorageIcon's
// single rect-with-divider.
export function DockerIcon() {
    return (
        <svg {...common}>
            <rect x="4.5" y="3" width="9" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="2.5" y="9.5" width="13" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        </svg>
    );
}

// A shield (flat top, pointed bottom — straight-line polygon, no curves)
// with a checkmark inside — distinct from ApprovalsIcon's plain circle by
// outline shape alone, reading as "quality/passed" rather than "one item
// approved."
export function CodeQualityIcon() {
    return (
        <svg {...common}>
            <polygon
                points="9,2 14.5,4 14.5,9 9,16 3.5,9 3.5,4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
            />
            <polyline points="6,8.7 8.3,11 12,6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// A dial with a needle (circle rim + line + small filled pivot) - reads as
// a "quality rating gauge," distinct from CodeQualityIcon's shield-and-
// checkmark now that shield is the Code Quality GROUP header rather than
// this specific child. Used for self-hosted SonarQube specifically now
// that it and SonarCloud are two separate sidebar items/credentials.
export function SonarQubeIcon() {
    return (
        <svg {...common}>
            <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
            <line x1="9" y1="9" x2="12.2" y2="5.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="9" cy="9" r="1.1" fill="currentColor" />
        </svg>
    );
}

// A single round "bump" over a wide rounded-rect base - a simplified,
// stroked cloud silhouette distinct from CloudServicesIcon's filled,
// three-circle version (a different page entirely), with a small checkmark
// on the base for "hosted quality check" - distinguishing it from
// SonarQubeIcon's dial by silhouette alone.
export function SonarCloudIcon() {
    return (
        <svg {...common}>
            <circle cx="9" cy="6.8" r="3.3" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <rect x="3.5" y="9" width="11" height="5.5" rx="2.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <polyline points="6.8,11.7 8.3,13.1 11.2,10.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// A magnifying glass - "scanning code for issues," distinct from
// ApprovalsIcon's plain checkmark-in-circle by shape (handle + smaller
// rim) alone.
export function CodeQlIcon() {
    return (
        <svg {...common}>
            <circle cx="8" cy="8" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <line x1="11.2" y1="11.2" x2="15" y2="15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
}

// Three left-aligned bars of decreasing length - a simple "lint rule list"
// glyph, distinct from PullRequestIcon's node-and-line graph.
export function EslintIcon() {
    return (
        <svg {...common}>
            <line x1="3.5" y1="5" x2="14.5" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="3.5" y1="9" x2="11.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="3.5" y1="13" x2="8.5" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

// A hexagon outline with a center dot - distinct silhouette from EslintIcon's
// bars and CheckstyleIcon's document, still a simple "linter" stand-in.
export function PylintIcon() {
    return (
        <svg {...common}>
            <polygon
                points="9,2.5 14.5,5.75 14.5,12.25 9,15.5 3.5,12.25 3.5,5.75"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
            />
            <circle cx="9" cy="9" r="1.3" fill="currentColor" />
        </svg>
    );
}

// A document (rect) with a checkmark - "style guide compliance," distinct
// from ApprovalsIcon's checkmark-in-CIRCLE by using a rect instead.
export function CheckstyleIcon() {
    return (
        <svg {...common}>
            <rect x="4" y="2.5" width="10" height="13" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
            <polyline points="6.5,9.2 8.3,11 11.5,6.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function StorageIcon() {
    return (
        <svg {...common}>
            <rect x="2.5" y="4.5" width="13" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
            <line x1="2.5" y1="8" x2="15.5" y2="8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
    );
}

export function AnalyticsIcon() {
    return (
        <svg {...common}>
            <rect x="3" y="10" width="3" height="5" stroke="currentColor" strokeWidth="1.4" />
            <rect x="7.5" y="6" width="3" height="9" stroke="currentColor" strokeWidth="1.4" />
            <rect x="12" y="3" width="3" height="12" stroke="currentColor" strokeWidth="1.4" />
        </svg>
    );
}

export function TimelineIcon() {
    return (
        <svg {...common}>
            <line x1="2.5" y1="9" x2="15.5" y2="9" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="4.5" cy="9" r="1.6" fill="currentColor" />
            <circle cx="9" cy="9" r="1.6" fill="currentColor" />
            <circle cx="13.5" cy="9" r="1.6" fill="currentColor" />
        </svg>
    );
}

export function HistoryIcon() {
    return (
        <svg {...common}>
            <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.4" />
            <polyline points="9,5 9,9 12,11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// Three stacked bars — reads as "a list of services", distinct from
// Dashboard's 2x2 grid, Docker's two different-size boxes, and
// Analytics's ascending bars.
export function ServicesIcon() {
    return (
        <svg {...common}>
            <rect x="2.5" y="2.5" width="13" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="2.5" y="7.25" width="13" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="2.5" y="12" width="13" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        </svg>
    );
}

// Three ascending step bars — reads as "stages/tiers" (Dev < Staging <
// Prod) rather than ServicesIcon's evenly-stacked rows, which already
// means "list of equal peers."
export function EnvironmentsIcon() {
    return (
        <svg {...common}>
            <rect x="2.5" y="11" width="4" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="7" y="7" width="4" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="11.5" y="2.5" width="4" height="13" rx="1" stroke="currentColor" strokeWidth="1.3" />
        </svg>
    );
}

export function TemplatesIcon() {
    return (
        <svg {...common}>
            <polyline points="6.5,5 2.5,9 6.5,13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="11.5,5 15.5,9 11.5,13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// A hex-bolt shape (hexagon outline + center hole) — deliberately not a
// circle-with-radiating-lines, since that's the Sun icon's own shape and
// the two were reading as the same icon in the nav.
// Three sliders — a horizontal track per row with a filled knob at a
// different point on each, the common "settings/preferences" glyph in
// dashboard apps (built the same way as TimelineIcon: plain lines plus
// filled circles, no curve paths). Rendered a size up from the other nav
// icons (width/height only — the viewBox stays the shared 18x18
// coordinate space) so the active Settings item stays easy to pick out
// at a glance in the collapsed rail.
export function SettingsIcon() {
    return (
        <svg width="23" height="23" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <line x1="2.5" y1="5" x2="15.5" y2="5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="6.5" cy="5" r="1.9" fill="currentColor" />

            <line x1="2.5" y1="9" x2="15.5" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="12.5" cy="9" r="1.9" fill="currentColor" />

            <line x1="2.5" y1="13" x2="15.5" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="9" cy="13" r="1.9" fill="currentColor" />
        </svg>
    );
}

export function SunIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
            <line x1="8" y1="0.8" x2="8" y2="2.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="8" y1="13.7" x2="8" y2="15.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="0.8" y1="8" x2="2.3" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="13.7" y1="8" x2="15.2" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="2.86" y1="2.86" x2="3.92" y2="3.92" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="12.08" y1="12.08" x2="13.14" y2="13.14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="12.08" y1="3.92" x2="13.14" y2="2.86" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="2.86" y1="13.14" x2="3.92" y2="12.08" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
    );
}

// Crescent built from two plain circles via a mask (not a hand-authored
// curve path), so the shape is guaranteed correct rather than guessed.
export function MoonIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <mask id="sidebar-moon-mask">
                <rect width="16" height="16" fill="white" />
                <circle cx="10.5" cy="5.5" r="4.5" fill="black" />
            </mask>
            <circle cx="8" cy="8" r="6" fill="currentColor" mask="url(#sidebar-moon-mask)" />
        </svg>
    );
}

// A rounded rectangle with a spine down the left edge - the same
// "repository" glyph already used everywhere a repo picker appears
// (SwitchRepositoryModal, AllRepositoriesCard, HeaderSearch), reused here
// for the sidebar's "GitHub" group header rather than inventing a
// separate GitHub mark.
export function GitHubGroupIcon() {
    return (
        <svg {...common}>
            <rect x="3" y="3" width="12" height="12" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
            <line x1="6.5" y1="3" x2="6.5" y2="15" stroke="currentColor" strokeWidth="1.4" />
        </svg>
    );
}

// Source Control's 5 providers - GitHub reuses its own existing
// GitHubGroupIcon (repo-with-spine glyph) unchanged, now nested one level
// deeper; the other 4 share PullRequestIcon's node-and-merge-line
// vocabulary (already established as "this is a repo/branching concept" in
// this file) with a small distinguishing accent each, same "one base
// shape, one accent" economy as Container Registry's/Code Quality's icons.

// The group header itself - a repo-spine rect (like GitHubGroupIcon) but
// wider/plainer, reading as "any repository host" rather than GitHub
// specifically.
export function SourceControlIcon() {
    return (
        <svg {...common}>
            <rect x="2" y="4" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <line x1="6" y1="4" x2="6" y2="14" stroke="currentColor" strokeWidth="1.3" />
        </svg>
    );
}

// Same branch-merge vocabulary as PullRequestIcon, but rotated/mirrored
// (merging from the right instead of the left) so it doesn't read as a
// literal duplicate.
export function GitLabIcon() {
    return (
        <svg {...common}>
            <circle cx="13" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="13" cy="13.5" r="2" stroke="currentColor" strokeWidth="1.4" />
            <line x1="13" y1="6.5" x2="13" y2="11.5" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="5" cy="13.5" r="2" stroke="currentColor" strokeWidth="1.4" />
            <polyline points="11,4.5 5,4.5 5,11.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// A rounded rect (repo) with a small notch cut from the top-right corner -
// distinct silhouette from GitHubGroupIcon's plain spine-rect.
export function BitbucketIcon() {
    return (
        <svg {...common}>
            <rect x="3" y="3" width="12" height="12" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
            <polygon points="10.5,3 15,3 15,7.5" fill="currentColor" />
        </svg>
    );
}

// A repo-spine rect (same base as GitHubGroupIcon/SourceControlIcon) with a
// small triangular "cloud provider" accent at the bottom-right - Azure
// Repos, keeping the same visual family Azure ACR's own icon already
// established for this app's Azure integrations.
export function AzureReposIcon() {
    return (
        <svg {...common}>
            <rect x="3" y="3" width="12" height="12" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
            <line x1="6.5" y1="3" x2="6.5" y2="15" stroke="currentColor" strokeWidth="1.4" />
            <polygon points="10.5,15 15,15 15,10.5" fill="currentColor" />
        </svg>
    );
}

// A repo-spine rect with a small "commit dot on a line" accent (a single
// filled circle on a short line) - AWS CodeCommit.
export function CodeCommitIcon() {
    return (
        <svg {...common}>
            <rect x="3" y="3" width="12" height="12" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
            <line x1="6.5" y1="3" x2="6.5" y2="15" stroke="currentColor" strokeWidth="1.4" />
            <line x1="9" y1="9" x2="14" y2="9" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="11.5" cy="9" r="1.6" fill="currentColor" />
        </svg>
    );
}

// Three overlapping filled circles capped by a rounded rect "ground line" -
// the same filled-shapes-overlapping technique MoonIcon already uses above
// (rather than a hand-authored curve path), reading as a simple cloud
// silhouette for the Cloud Services nested page.
export function CloudServicesIcon() {
    return (
        <svg {...common}>
            <circle cx="6.5" cy="10.5" r="3" fill="currentColor" />
            <circle cx="10.5" cy="8.3" r="3.7" fill="currentColor" />
            <circle cx="13" cy="10.5" r="2.6" fill="currentColor" />
            <rect x="3.5" y="10" width="12" height="4" rx="2" fill="currentColor" />
        </svg>
    );
}

// Two connected nodes — reads as "connect an account," distinct from
// CloudServicesIcon's cloud silhouette.
export function HostingProvidersIcon() {
    return (
        <svg {...common}>
            <rect x="2" y="7" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
            <rect x="11" y="7" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
            <line x1="7" y1="9.5" x2="11" y2="9.5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
    );
}

// A grid of 3 boxes - "a collection of stored images", distinct from
// DockerIcon's two-rect Engine glyph (a completely different concept -
// see Container Registry's own page comment) and HostingProvidersIcon's
// two-linked-boxes shape.
export function ContainerRegistryIcon() {
    return (
        <svg {...common}>
            <rect x="2" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
            <rect x="10" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
            <rect x="6" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
        </svg>
    );
}

// Container Registry's 9 providers, each sharing one common "image" base (a
// single rounded rect - the group header's own 3-box cluster, simplified to
// one box per provider since these are now individual pages) plus one small
// accent distinguishing each - same "one base shape, one distinguishing
// mark" economy this file already uses for the Code Quality group's
// ESLint/Pylint/Checkstyle icons.

// Box + a "lid" line near the top - AWS ECR, the simplest/first one.
export function EcrIcon() {
    return (
        <svg {...common}>
            <rect x="3" y="4" width="12" height="11" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
            <line x1="3" y1="7.5" x2="15" y2="7.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>
    );
}

// Box + a small triangle accent at the top-right corner - Azure ACR.
export function AcrIcon() {
    return (
        <svg {...common}>
            <rect x="3" y="4" width="12" height="11" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
            <polygon points="11,4 15,4 15,8" fill="currentColor" />
        </svg>
    );
}

// Box + a small circle "tag" badge at the bottom-right - GCP Artifact
// Registry.
export function ArtifactRegistryIcon() {
    return (
        <svg {...common}>
            <rect x="3" y="3" width="11" height="10" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="14.2" cy="13.8" r="2.4" stroke="currentColor" strokeWidth="1.3" fill="none" />
        </svg>
    );
}

// Box with a smaller filled square nested inside - Docker Hub, distinct
// from DockerIcon's two-stacked-rects "Engine" glyph elsewhere in the
// sidebar (a different concept entirely - see ContainerRegistry.jsx's own
// comment on why the two nav items stay separate).
export function DockerHubIcon() {
    return (
        <svg {...common}>
            <rect x="3" y="3" width="12" height="12" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
            <rect x="6.5" y="6.5" width="5" height="5" rx="0.8" fill="currentColor" />
        </svg>
    );
}

// Box + a vertical "spine" on the left edge - GHCR, echoing
// GitHubGroupIcon's own repository spine to tie it visually back to GitHub.
export function GhcrIcon() {
    return (
        <svg {...common}>
            <rect x="3" y="3" width="12" height="12" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
            <line x1="6.2" y1="3" x2="6.2" y2="15" stroke="currentColor" strokeWidth="1.4" />
        </svg>
    );
}

// Box + a small diamond accent at the top - GitLab Registry.
export function GitLabRegistryIcon() {
    return (
        <svg {...common}>
            <rect x="3" y="4" width="12" height="11" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
            <polygon points="9,1.8 11,4 9,6.2 7,4" fill="currentColor" />
        </svg>
    );
}

// Box + two small dots near the top - JFrog Artifactory.
export function JfrogIcon() {
    return (
        <svg {...common}>
            <rect x="3" y="4" width="12" height="11" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="6.8" cy="7.5" r="1" fill="currentColor" />
            <circle cx="11.2" cy="7.5" r="1" fill="currentColor" />
        </svg>
    );
}

// Box + a short horizontal line with two downward ticks at the base - an
// anchor stand-in for Harbor.
export function HarborIcon() {
    return (
        <svg {...common}>
            <rect x="3" y="3" width="12" height="10" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
            <line x1="5.5" y1="16" x2="12.5" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="6.5" y1="13" x2="6.5" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="11.5" y1="13" x2="11.5" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
    );
}

// Box + a small row of three connected dots - a "junction point" stand-in
// for Nexus.
export function NexusIcon() {
    return (
        <svg {...common}>
            <rect x="3" y="4" width="12" height="11" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
            <line x1="6" y1="7.5" x2="12" y2="7.5" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="6" cy="7.5" r="1" fill="currentColor" />
            <circle cx="9" cy="7.5" r="1" fill="currentColor" />
            <circle cx="12" cy="7.5" r="1" fill="currentColor" />
        </svg>
    );
}

export function ChevronIcon({ direction = "left" }) {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"
            style={{ transform: direction === "right" ? "rotate(180deg)" : "none" }}>
            <polyline points="9,2 4,7 9,12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
