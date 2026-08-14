// Settings' own sub-pages ("view", see Settings.jsx's ?view= URL param) —
// pulled out to its own file (rather than only living inside Settings.jsx)
// so HeaderSearch can list every sub-page as its own searchable result
// without a layout component reaching into a page component's internals.
export const VIEWS = ["hub", "credentials", "activity-log", "access-levels", "branches", "sidebar-access", "smoke-tests", "external-apis", "environments", "appearance", "database", "admin-access", "security-testing"];

// Every one of these requires Admin server-side (LogsController,
// SmokeTestController, ExternalHealthController, and the /sidebar/*
// endpoints all run through AdminGate) - showing any of them to a
// non-admin would just be an empty/failed page. "environments" is
// deliberately NOT here: GET /api/environments has always been open to
// any visitor (it's the same data the Dashboard card and Environments
// page already show everyone) - only saving changes is admin-gated
// server-side, which EnvironmentsAdminView enforces itself by disabling
// its edit controls for non-admins rather than hiding the whole page.
export const ADMIN_ONLY_VIEWS = new Set(["sidebar-access", "activity-log", "smoke-tests", "external-apis"]);

// Restricted to the single GitHub identity Database Management is locked to
// (see AdminGate.DenyUnlessSuperAdminAsync) - a strictly narrower gate than
// ADMIN_ONLY_VIEWS above, which every general admin passes. The backend
// enforces the real 403 on every api/database/* (and, for admin-access,
// every api/settings/admins + api/admin/users/*/mfa/recovery-code) call
// regardless of this - this only decides whether Settings shows/keeps the
// tile and sub-page.
export const SUPER_ADMIN_ONLY_VIEWS = new Set(["database", "admin-access", "security-testing"]);

export const VIEW_TITLES = {
    credentials: "Credentials",
    "activity-log": "Activity Log",
    "access-levels": "Access Levels",
    branches: "Branches",
    "sidebar-access": "Sidebar Access",
    "smoke-tests": "Smoke Tests",
    "external-apis": "External APIs",
    environments: "Environments",
    appearance: "Appearance",
    database: "Database",
    "admin-access": "Admin Access",
    "security-testing": "Security Testing Lab"
};
