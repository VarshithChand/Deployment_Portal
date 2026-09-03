import { useScene, SECTIONS } from "./sceneStore";

const LABELS = {
    about: "About", skills: "Skills", projects: "Projects",
    experience: "Experience", dashboard: "Dashboard", contact: "Contact"
};

// The visible-on-desktop-too accessibility fallback: real, focusable,
// keyboard-operable buttons that trigger the exact same camera fly-to +
// panel-open the 3D stations do (both just call setActiveSection - see
// sceneStore.jsx), so someone who can't or doesn't want to click a 3D
// object in a WebGL canvas has an identical path through every section.
// Also the ENTIRE nav on mobile (see MobileFallback.jsx, which renders
// this instead of the 3D room).
export default function Nav({ minimal = false }) {

    const { activeSection, setActiveSection } = useScene();

    return (

        <nav className={`p3d-nav${minimal ? " p3d-nav-minimal" : ""}`} aria-label="Portfolio sections">

            {SECTIONS.map((section) => (

                <button
                    key={section}
                    type="button"
                    className={`p3d-nav-btn${activeSection === section ? " on" : ""}`}
                    onClick={() => setActiveSection(activeSection === section ? null : section)}
                    aria-pressed={activeSection === section}
                >
                    {LABELS[section]}
                </button>

            ))}

        </nav>

    );

}
