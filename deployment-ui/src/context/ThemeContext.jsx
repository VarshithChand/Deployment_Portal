import { createContext, useEffect, useRef, useState } from "react";

export const ThemeContext = createContext();

const THEME_KEY = "theme";
const MODE_KEY = "themeMode";

// Simple fixed day/night window (6am-6pm local) rather than a real
// sunrise/sunset calculation - an actual astronomical calculation needs
// the visitor's coordinates (a geolocation permission prompt this app
// has no other reason to ask for), so this reads the browser's own local
// clock instead. For a client-side app, "the location it's running in"
// IS the visitor's device - its system clock/timezone already reflects
// that, no permission prompt needed.
function isDaytimeNow() {

    const hour = new Date().getHours();
    return hour >= 6 && hour < 18;

}

function readStored() {

    const storedMode = localStorage.getItem(MODE_KEY);
    const storedTheme = localStorage.getItem(THEME_KEY);

    if (storedMode === "manual" && (storedTheme === "light" || storedTheme === "dark")) {
        return { mode: "manual", theme: storedTheme };
    }

    // No explicit choice yet - a theme value saved before this "auto"
    // concept existed (or synced from another tab) is treated as manual
    // too, so an existing user's prior choice keeps winning rather than
    // being silently overridden by the new time-based default.
    if (storedTheme === "light" || storedTheme === "dark") {
        return { mode: "manual", theme: storedTheme };
    }

    return { mode: "auto", theme: isDaytimeNow() ? "light" : "dark" };

}

export default function ThemeProvider({ children }) {

    const initial = useRef(readStored());
    const [theme, setTheme] = useState(initial.current.theme);
    const [themeMode, setThemeMode] = useState(initial.current.mode);

    useEffect(() => {

        document.documentElement.dataset.theme = theme;
        localStorage.setItem(THEME_KEY, theme);
        localStorage.setItem(MODE_KEY, themeMode);

    }, [theme, themeMode]);

    // While in "auto" mode (no manual choice made yet), re-check the
    // local clock periodically and follow it - so a session left open
    // across a real sunrise/sunset actually crosses over, not just on
    // next page load. Once toggleTheme is ever called this stops
    // mattering: themeMode flips to "manual" and this interval becomes a
    // no-op forever, matching "when I want I'll use it [the toggle],
    // otherwise follow the real time" - a deliberate choice always wins
    // over the automatic one.
    useEffect(() => {

        if (themeMode !== "auto") return;

        const id = setInterval(() => {
            setTheme(isDaytimeNow() ? "light" : "dark");
        }, 60000);

        return () => clearInterval(id);

    }, [themeMode]);

    function toggleTheme() {

        setThemeMode("manual");
        setTheme((prev) => (prev === "dark" ? "light" : "dark"));

    }

    return (

        <ThemeContext.Provider value={{ theme, toggleTheme, themeMode }}>

            {children}

        </ThemeContext.Provider>

    );

}
