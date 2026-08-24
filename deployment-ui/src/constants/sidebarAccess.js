import { FLAT_TABS } from "../components/layout/Sidebar";

// Shared by Settings > Sidebar Access, the Services page's per-PAT-user
// access popup (PatUserAccessModal), and Settings > Admin Access' own
// Service Access tab - all three manage the exact same restriction data
// (see SettingsService.SaveSidebarAccessAsync), just surfaced from
// different entry points.
//
// Derived from Sidebar.jsx's own FLAT_TABS (the same flattened list
// HeaderSearch already reuses for its own "no second copy to drift out
// of sync" reason) instead of a hand-maintained duplicate - this list
// used to be typed out by hand and silently stopped growing while
// Sidebar.jsx kept gaining new sections (Cloud Services, PaaS/
// Microservices, Container Registry, Observability, Code Quality, and
// everything nested under Source Control), so every one of those was
// invisible here despite being real, restrictable pages. Deriving it
// means the next new sidebar leaf is automatically restrictable the
// moment it's added to Sidebar.jsx's TABS - nothing to remember to
// update in a second place.
//
// "settings" and "dashboard" are the only two excluded - the backend
// refuses those two regardless of what's sent (locking Settings would
// strand every admin with no way back in, and Dashboard is where the
// frontend's route guard sends anyone who lands on a restricted tab).
const EXCLUDED_FROM_SIDEBAR_ACCESS = new Set(["settings", "dashboard"]);

export const SIDEBAR_TABS = FLAT_TABS
    .filter((t) => !EXCLUDED_FROM_SIDEBAR_ACCESS.has(t.key))
    .map((t) => ({ key: t.key, label: t.label }));

export const SIDEBAR_STATES = [
    { value: "visible", label: "Visible" },
    { value: "locked", label: "Locked" },
    { value: "hidden", label: "Hidden" }
];
