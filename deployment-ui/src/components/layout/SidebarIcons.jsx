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

export function ChevronIcon({ direction = "left" }) {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"
            style={{ transform: direction === "right" ? "rotate(180deg)" : "none" }}>
            <polyline points="9,2 4,7 9,12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
