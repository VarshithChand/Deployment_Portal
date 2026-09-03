// Shared theme-aware colors for the floating 3D labels/titles that sit
// in open space against the room's own wall/floor (not the ones printed
// directly onto a station's dark "screen" face - those stay unlisted
// here since the screen itself never changes color between themes, so
// neither does its text). The dark-theme values are the room's
// original palette (pale cyan/white against a dark wall); light theme
// needed real, separately-tuned values - the exact same pale colors
// that read fine on a dark wall have poor contrast on a light one,
// which is what made a project label unreadable in light mode. Matches
// the CSS --p3d-cyan/--p3d-text tokens (CommandCenter.jsx) so the 3D
// labels and the 2D UI settle on the same two colors per theme rather
// than drifting into a third, uncoordinated pair.
export function labelTextColors(theme) {

    return theme === "light"
        ? { title: "#0891b2", idle: "#0e7490", selected: "#0f172a", outline: "#f4f6f9" }
        : { title: "#67e8f9", idle: "#9fd8e0", selected: "#eafaff", outline: "#05141a" };

}

// Same idea, purple instead of cyan - just the Skills station's own
// title, matching its icosahedron's purple identity rather than
// switching it to the cyan every other station's title uses.
export function purpleTitleColors(theme) {

    return theme === "light"
        ? { title: "#7c3aed", outline: "#f4f6f9" }
        : { title: "#c4b5fd", outline: "#0a0518" };

}
