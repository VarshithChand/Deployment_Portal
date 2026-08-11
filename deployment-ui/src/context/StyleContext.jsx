import { createContext, useEffect, useState } from "react";

export const StyleContext = createContext();

const STORAGE_KEY = "appStyle";

export const APP_STYLES = [
    { key: "glass", label: "Glass", description: "Frosted translucent surfaces over an aurora glow." },
    { key: "brutal", label: "Neo-brutalist", description: "Flat color, thick borders, hard offset shadows." },
    { key: "minimal", label: "Minimal", description: "Quiet, understated — Linear/Vercel-style." },
    { key: "neon", label: "Neon Ops", description: "Dark control-room look with glowing cyan accents." },
    { key: "clay", label: "Clay", description: "Soft neumorphic surfaces, pressed into the background." },
    { key: "midnight", label: "Midnight", description: "Flat, focused pro-dark — GitHub/editor-inspired." },
    { key: "sunset", label: "Sunset", description: "Warm editorial glass — peach and pink over cream." },
    { key: "mono", label: "Mono", description: "Ink on paper — monochrome, no color at all." }
];

function getInitialStyle() {

    const stored = localStorage.getItem(STORAGE_KEY);
    return APP_STYLES.some((s) => s.key === stored) ? stored : "glass";

}

// Independent of ThemeContext's light/dark — this picks the visual
// *style* (glass/brutal/minimal/neon), each of which still supports its
// own light/dark pair. Same pattern as ThemeContext: an attribute on
// <html> (data-style instead of data-theme) that global.css's
// [data-style="..."] blocks key off of, persisted the same way.
export default function StyleProvider({ children }) {

    const [style, setStyle] = useState(getInitialStyle);

    useEffect(() => {

        document.documentElement.dataset.style = style;
        localStorage.setItem(STORAGE_KEY, style);

    }, [style]);

    return (

        <StyleContext.Provider value={{ style, setStyle }}>

            {children}

        </StyleContext.Provider>

    );

}
