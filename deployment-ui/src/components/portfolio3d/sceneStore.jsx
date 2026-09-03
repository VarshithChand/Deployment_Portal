import { createContext, useContext, useMemo, useState } from "react";

// Plain React context, not Zustand - this app has zero existing state-
// management libraries anywhere (every other page just uses useState/
// context), and the state here is small enough that adding a new
// dependency for it isn't justified.
//
// `activeSection` and `openPanel` are deliberately separate. Arriving at
// a station - via the Nav bar or a scroll step - only moves the camera
// (activeSection); it does NOT open that station's content panel. The
// panel (openPanel) opens only when something is actually clicked in the
// 3D scene: the station's own hotspot, or one of its individual items
// (a specific project box, a specific timeline circle). This lets you
// scroll/nav through the room and just look at it without a panel
// popping up over the view every time, matching how someone would
// actually want to browse a physical room versus a slideshow.
const SceneContext = createContext(null);

export const SECTIONS = ["about", "skills", "projects", "experience", "dashboard", "contact"];

export function SceneProvider({ children }) {

    const [activeSection, setActiveSection] = useState(null);
    const [openPanel, setOpenPanel] = useState(null);
    const [loaded, setLoaded] = useState(false);
    // Shared between the 2D Skills panel's tag buttons and the 3D skills
    // node-graph, so clicking a tag highlights its cluster in the room the
    // same way hovering a node already does.
    const [highlightedSkillGroup, setHighlightedSkillGroup] = useState(null);
    // Which individual project/experience item is focused - set by
    // clicking a specific 3D box/circle, read by the 2D panel to expand/
    // highlight that one item instead of always defaulting to the first.
    const [selectedProjectId, setSelectedProjectId] = useState(null);
    const [selectedExperienceYear, setSelectedExperienceYear] = useState(null);

    const value = useMemo(
        () => ({
            activeSection, setActiveSection, openPanel, setOpenPanel, loaded, setLoaded,
            highlightedSkillGroup, setHighlightedSkillGroup,
            selectedProjectId, setSelectedProjectId,
            selectedExperienceYear, setSelectedExperienceYear
        }),
        [activeSection, openPanel, loaded, highlightedSkillGroup, selectedProjectId, selectedExperienceYear]
    );

    return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;

}

export function useScene() {

    const ctx = useContext(SceneContext);

    if (!ctx) throw new Error("useScene must be used within a SceneProvider");

    return ctx;

}
