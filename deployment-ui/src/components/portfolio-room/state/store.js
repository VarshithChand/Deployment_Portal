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
    setSelectedExperienceYear: (year) => set({ selectedExperienceYear: year })
}));
