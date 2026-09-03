import { create } from "zustand";

// SECTIONS order is the sequence Nav and the WASD/arrow-key/scroll loop
// (see PortfolioRoom.jsx's useSectionLoop) all walk through, in the
// order explicitly requested: about -> skills -> projects -> experience
// -> dashboard -> contact, wrapping back to about.
export const SECTIONS = ["about", "skills", "projects", "experience", "dashboard", "contact"];

// A single `active` field drives BOTH the camera fly-to and the 2D panel
// - unlike the previous build (which kept "where the camera is looking"
// and "which panel is open" as two separate pieces of state), this spec
// has no nav-only browsing mode: clicking any object always flies the
// camera to it AND opens its panel in one action, so one field covers
// both. `null` is the room overview / doorway view.
export const useStore = create((set) => ({
    active: null,
    setActive: (section) => set({ active: section }),
    back: () => set({ active: null }),

    loaded: false,
    setLoaded: (loaded) => set({ loaded }),

    reducedMotion: false,
    setReducedMotion: (reducedMotion) => set({ reducedMotion }),

    // Which rack unit (project) or timeline stop (year) was clicked -
    // read by that section's panel to expand/highlight the right entry
    // instead of always defaulting to the first one.
    selectedProjectId: null,
    setSelectedProjectId: (id) => set({ selectedProjectId: id }),

    selectedExperienceYear: null,
    setSelectedExperienceYear: (year) => set({ selectedExperienceYear: year }),

    // The switchboard's 3 physical switches (SwitchBoard.jsx) - fan
    // (Fan.jsx, over the bed, on by default per the explicit request),
    // bedLight (BedLight.jsx) and cluster (the Skills pendant light's
    // own master power, gating it independently of whether the Skills
    // station is open/hovered - see CeilingLightSkills.jsx). setSwitch
    // sets an explicit value (for the o+N/f+N keyboard shortcuts, which
    // mean a specific on/off, not toggle); toggleSwitch flips it (for
    // clicking the physical switch itself).
    switches: { fan: true, bedLight: false, cluster: false },
    setSwitch: (name, value) => set((s) => ({ switches: { ...s.switches, [name]: value } })),
    toggleSwitch: (name) => set((s) => ({ switches: { ...s.switches, [name]: !s.switches[name] } })),

    // Which ABOUT.whoami block the monitor screen is currently showing
    // (MonitorAbout.jsx) - shared with the About panel's own "Next"
    // button (About.jsx) rather than living as the monitor's own local
    // state, because the panel is what's actually reachable: navigating
    // to "about" opens the panel over the same part of the screen the
    // monitor's content sits in, on every visit, for as long as you're
    // close enough to read either one - a click target ON the monitor's
    // face is permanently covered the moment you're there to use it.
    aboutSlide: 0,
    setAboutSlide: (i) => set({ aboutSlide: i })
}));
