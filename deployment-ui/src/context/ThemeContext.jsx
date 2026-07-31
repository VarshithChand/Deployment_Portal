import { createContext, useEffect, useState } from "react";

export const ThemeContext = createContext();

const STORAGE_KEY = "theme";

function getInitialTheme() {

    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored === "light" || stored === "dark") {
        return stored;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";

}

export default function ThemeProvider({ children }) {

    const [theme, setTheme] = useState(getInitialTheme);

    useEffect(() => {

        document.documentElement.dataset.theme = theme;
        localStorage.setItem(STORAGE_KEY, theme);

    }, [theme]);

    function toggleTheme() {

        setTheme((prev) => (prev === "dark" ? "light" : "dark"));

    }

    return (

        <ThemeContext.Provider value={{ theme, toggleTheme }}>

            {children}

        </ThemeContext.Provider>

    );

}
