import { createContext, useContext, useMemo, useState } from "react";

// Plain React context, not Zustand - this app has zero existing state-
// management libraries anywhere (every other page just uses useState/
// context), and the state here is small enough (which station is active,
// whether the boot sequence has finished) that adding a new dependency
// for it isn't justified. Shared by the 3D room (stations set
// activeSection on click) and the 2D panel/nav layer (reads it to know
// what to render, and can set it directly for keyboard/fallback nav).
const SceneContext = createContext(null);

export const SECTIONS = ["about", "skills", "projects", "experience", "dashboard", "contact"];

export function SceneProvider({ children }) {

    const [activeSection, setActiveSection] = useState(null);
    const [loaded, setLoaded] = useState(false);

    const value = useMemo(
        () => ({ activeSection, setActiveSection, loaded, setLoaded }),
        [activeSection, loaded]
    );

    return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;

}

export function useScene() {

    const ctx = useContext(SceneContext);

    if (!ctx) throw new Error("useScene must be used within a SceneProvider");

    return ctx;

}
