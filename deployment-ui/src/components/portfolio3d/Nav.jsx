import { useScene, SECTIONS } from "./sceneStore";

const LABELS = {
    about: "About", skills: "Skills", projects: "Projects",
    experience: "Experience", dashboard: "Dashboard", contact: "Contact"
};

// The visible-on-desktop-too accessibility fallback: real, focusable,
// keyboard-operable buttons that fly the camera to each station, so
// someone who can't or doesn't want to click a 3D object in a WebGL
// canvas has an identical path through every section. Also the ENTIRE
// nav on mobile (see MobileFallback.jsx, which renders this instead of
// the 3D room).
//
// This only moves the camera (setActiveSection) - it deliberately does
// NOT open that station's content panel (setOpenPanel is untouched
// here except to close whatever panel was already open, since you're
// navigating away from whatever it was showing). The panel only opens
// when you click the actual object in the room: the station's hotspot,
// or one of its individual items. That keeps "look around the room"
// and "open this thing's details" as two distinct actions instead of
// every arrival forcing a panel open over the view.
export default function Nav({ minimal = false }) {

    const { activeSection, setActiveSection, setOpenPanel } = useScene();

    return (

        <nav className={`p3d-nav${minimal ? " p3d-nav-minimal" : ""}`} aria-label="Portfolio sections">

            {SECTIONS.map((section) => (

                <button
                    key={section}
                    type="button"
                    className={`p3d-nav-btn${activeSection === section ? " on" : ""}`}
                    onClick={() => {
                        setActiveSection(activeSection === section ? null : section);
                        setOpenPanel(null);
                    }}
                    aria-pressed={activeSection === section}
                >
                    {LABELS[section]}
                </button>

            ))}

        </nav>

    );

}
