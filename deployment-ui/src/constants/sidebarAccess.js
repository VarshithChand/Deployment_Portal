// Shared by Settings > Sidebar Access and the Services page's per-PAT-user
// access popup (PatUserAccessModal) - both manage the exact same
// restriction data (see SettingsService.SaveSidebarAccessAsync), just
// surfaced from two different entry points. "settings" and "dashboard"
// are deliberately excluded - the backend refuses those two regardless of
// what's sent (locking Settings would strand every admin with no way
// back in, and Dashboard is where the frontend's route guard sends anyone
// who lands on a restricted tab). Labels mirror Sidebar.jsx's own TABS.
export const SIDEBAR_TABS = [
    { key: "deploy", label: "Deploy" },
    { key: "approvals", label: "Approvals" },
    { key: "pullRequests", label: "Pull Requests" },
    { key: "storage", label: "Artifacts & Images" },
    { key: "analytics", label: "Analytics" },
    { key: "timeline", label: "Timeline" },
    { key: "history", label: "History" },
    { key: "environments", label: "Environments" },
    { key: "templates", label: "Template Tester" },
    { key: "services", label: "Services" },
    { key: "docker", label: "Docker" }
];

export const SIDEBAR_STATES = [
    { value: "visible", label: "Visible" },
    { value: "locked", label: "Locked" },
    { value: "hidden", label: "Hidden" }
];
