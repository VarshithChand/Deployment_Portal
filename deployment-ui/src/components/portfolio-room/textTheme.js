// Theme-aware colors for the floating 3D labels/titles that sit in open
// air against the room's own wall/floor (the pendant light's skill
// labels, the rack's project names + "PROJECTS" title, the wall
// timeline's year stops + "EXPERIENCE" title). Deliberately NOT used for
// the monitor/wall-screen "screen" text (MonitorAbout, WallDashboard) -
// a real monitor's screen doesn't turn white just because the room
// around it is bright, so that text stays fixed in both themes.
export function labelTextColors(theme) {

    return theme === "light"
        ? { title: "#0891b2", idle: "#0e7490", selected: "#0f172a", outline: "#f4f6f9" }
        : { title: "#67e8f9", idle: "#9fd8e0", selected: "#eafaff", outline: "#05141a" };

}

// Same idea for the pendant light's own purple identity.
export function purpleTitleColors(theme) {

    return theme === "light"
        ? { title: "#7c3aed", outline: "#f4f6f9" }
        : { title: "#c4b5fd", outline: "#0a0518" };

}
