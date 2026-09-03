import { useStore, SECTIONS } from "../state/store";

const LABELS = {
    about: "About", contact: "Contact", skills: "Skills",
    dashboard: "Dashboard", projects: "Projects", experience: "Experience"
};

// Real, focusable, keyboard-operable buttons that fly the camera to each
// station and open its panel - the fallback/shortcut path the brief asks
// for, and the entire nav on mobile (see MobileFallback.jsx).
export default function Nav() {

    const active = useStore((s) => s.active);
    const setActive = useStore((s) => s.setActive);

    return (

        <nav className="proom-nav" aria-label="Portfolio sections">

            {SECTIONS.map((section) => (

                <button
                    key={section}
                    type="button"
                    className={`proom-nav-btn${active === section ? " on" : ""}`}
                    onClick={() => setActive(active === section ? null : section)}
                    aria-pressed={active === section}
                >
                    {LABELS[section]}
                </button>

            ))}

        </nav>

    );

}
