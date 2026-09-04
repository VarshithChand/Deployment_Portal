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
    // Leaving a section resets that section's own "which specific thing
    // did you click" state - without this, arriving back at Projects or
    // Experience via Nav/the WASD loop (rather than clicking a specific
    // rack unit or timeline stop) would still show whatever was selected
    // on your LAST visit, instead of nothing being expanded until you
    // click something fresh this time. Only resets the ones you're
    // actually leaving; the section you're arriving at keeps whatever it
    // already had (relevant when a direct object click sets both active
    // and its own selection in the same tick - see PipelineProjects.jsx/
    // TimelineExperience.jsx's own onSelect handlers).
    setActive: (section) => set((s) => ({
        active: section,
        selectedSkill: section === "skills" ? s.selectedSkill : null,
        selectedProjectId: section === "projects" ? s.selectedProjectId : null,
        selectedExperienceYear: section === "experience" ? s.selectedExperienceYear : null
    })),
    back: () => set({
        active: null, selectedSkill: null,
        selectedProjectId: null, selectedExperienceYear: null
    }),

    loaded: false,
    setLoaded: (loaded) => set({ loaded }),

    reducedMotion: false,
    setReducedMotion: (reducedMotion) => set({ reducedMotion }),

    // Which rack unit (project) or timeline stop (year) was clicked -
    // read by that section's panel to expand/highlight the right entry
    // instead of always defaulting to the first one. setActive above
    // resets these to null on leaving; a direct click on a specific
    // rack unit/timeline stop sets the real id/year right after (two
    // separate store calls in the same click handler, so the final
    // state is the real selection, not null).
    selectedProjectId: null,
    setSelectedProjectId: (id) => set({ selectedProjectId: id }),

    selectedExperienceYear: null,
    setSelectedExperienceYear: (year) => set({ selectedExperienceYear: year }),

    // Which individual skill node ("atom") was clicked - the atoms
    // themselves show by default as soon as you're at the Skills
    // station (see CeilingLightSkills.jsx), but the Skills panel only
    // opens once this is set, not just from being at the station; a
    // specific atom has to be clicked, same as Projects/Experience only
    // opening their panel for a specific rack unit/timeline stop.
    selectedSkill: null,
    setSelectedSkill: (label) => set({ selectedSkill: label }),

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
    toggleSwitch: (name) => set((s) => ({ switches: { ...s.switches, [name]: !s.switches[name] } }))
}));
