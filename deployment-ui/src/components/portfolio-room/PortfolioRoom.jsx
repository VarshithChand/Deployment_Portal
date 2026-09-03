import { Suspense, lazy, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { X, Sun, Moon } from "lucide-react";
import { useStore, SECTIONS } from "./state/store";
import Loader from "./scene/Loader";
import Nav from "./ui/Nav";
import Panel from "./ui/Panel";
import MobileFallback from "./ui/MobileFallback";
import useReducedMotion from "../../hooks/useReducedMotion";
import useIsMobile from "../../hooks/useIsMobile";
import useTheme from "../../hooks/useTheme";
import About from "./ui/sections/About";
import Skills from "./ui/sections/Skills";
import Projects from "./ui/sections/Projects";
import Experience from "./ui/sections/Experience";
import Dashboard from "./ui/sections/Dashboard";
import Contact from "./ui/sections/Contact";

// The Canvas itself is lazy - it pulls in @react-three/fiber, drei, three
// and postprocessing, real weight that shouldn't cost anything for a
// mobile visitor who gets the lighter MobileFallback instead.
const SceneExperience = lazy(() => import("./scene/Experience"));

const SECTION_TITLES = {
    about: "About", contact: "Contact", skills: "Skills",
    dashboard: "Status", projects: "Projects", experience: "Experience"
};

const SECTION_CONTENT = {
    about: About, contact: Contact, skills: Skills,
    dashboard: Dashboard, projects: Projects, experience: Experience
};

// WASD/arrow keys and mouse-scroll both step through SECTIONS as one
// closed loop (about -> skills -> projects -> experience -> dashboard ->
// contact -> about...), independent of the room overview - stepping from
// the overview always lands on "about" first, and there's no wraparound
// back to the overview itself (Escape/Exit/a panel's own close button
// already cover "go back to looking at the whole room"). W/D/Up/Right
// step forward, S/A/Down/Left step back, matching how a slideshow or
// carousel would read those keys even though they're not literal
// movement here. Scroll direction mirrors that: scrolling down (like
// scrolling down a page) advances, scrolling up goes back.
function useSectionLoop(enabled) {

    const active = useStore((s) => s.active);
    const setActive = useStore((s) => s.setActive);
    const wheelLockRef = useRef(false);

    useEffect(() => {

        if (!enabled) return;

        function step(direction) {
            const currentIndex = active ? SECTIONS.indexOf(active) : -1;
            const nextIndex = (currentIndex + direction + SECTIONS.length) % SECTIONS.length;
            setActive(SECTIONS[nextIndex]);
        }

        function onKeyDown(e) {

            if (e.repeat) return;
            if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;

            const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            const forward = key === "w" || key === "d" || key === "ArrowUp" || key === "ArrowRight";
            const back = key === "s" || key === "a" || key === "ArrowDown" || key === "ArrowLeft";

            if (!forward && !back) return;

            e.preventDefault();
            step(forward ? 1 : -1);

        }

        function onWheel(e) {

            if (e.target.closest && e.target.closest(".proom-panel")) return;
            if (wheelLockRef.current) return;
            if (Math.abs(e.deltaY) < 12) return;

            step(e.deltaY > 0 ? 1 : -1);
            wheelLockRef.current = true;
            setTimeout(() => { wheelLockRef.current = false; }, 700);

        }

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("wheel", onWheel, { passive: true });

        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("wheel", onWheel);
        };

    }, [active, enabled, setActive]);

}

function DesktopRoom({ reducedMotion, theme }) {

    const active = useStore((s) => s.active);
    const back = useStore((s) => s.back);
    const loaded = useStore((s) => s.loaded);
    const setLoaded = useStore((s) => s.setLoaded);
    const ActiveContent = active && SECTION_CONTENT[active];

    useSectionLoop(loaded);

    return (

        <>

            {!loaded && (
                <Suspense fallback={null}>
                    <Loader reducedMotion={reducedMotion} onDone={() => setLoaded(true)} />
                </Suspense>
            )}

            <div className="proom-canvas-wrap">
                <Suspense fallback={null}>
                    <SceneExperience reducedMotion={reducedMotion} theme={theme} />
                </Suspense>
            </div>

            <div className="proom-grain" aria-hidden="true" />
            <div className="proom-vignette" aria-hidden="true" />

            <Nav />

            <AnimatePresence>
                {ActiveContent && (
                    <Panel key={active} title={SECTION_TITLES[active]} onClose={back}>
                        <ActiveContent />
                    </Panel>
                )}
            </AnimatePresence>

        </>

    );

}

export default function PortfolioRoom({ onExit }) {

    const reducedMotion = useReducedMotion();
    const isMobile = useIsMobile();
    const setReducedMotion = useStore((s) => s.setReducedMotion);
    // Same shared ThemeContext every other page reads (see main.jsx's
    // ThemeProvider) - not a room-local preference. Toggling here changes
    // the theme for the whole application, and arriving here already
    // reflects whatever was last chosen elsewhere. `themeMode` is "auto"
    // until this toggle (or the one anywhere else in the app) is ever
    // clicked - in auto mode the theme follows the visitor's own local
    // clock (see ThemeContext.jsx, and the room's own Clock prop showing
    // that same time), which is what the tooltip below is explaining.
    const { theme, toggleTheme, themeMode } = useTheme();

    useEffect(() => {
        setReducedMotion(reducedMotion);
    }, [reducedMotion, setReducedMotion]);

    return (

        <div className={`proom-root${theme === "light" ? " proom-light" : ""}`}>
            <style>{CSS}</style>

            {onExit && (
                <button type="button" className="proom-exit" onClick={onExit} aria-label="Exit to login">
                    <X size={15} /> Exit
                </button>
            )}

            <button
                type="button"
                className="proom-theme-toggle"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                title={
                    themeMode === "auto"
                        ? `Auto - following your local time (currently ${theme}). Click to set it yourself.`
                        : (theme === "dark" ? "Light mode" : "Dark mode")
                }
            >
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {isMobile ? <MobileFallback /> : <DesktopRoom reducedMotion={reducedMotion} theme={theme} />}

        </div>

    );

}

const CSS = `
.proom-root{
  --pr-bg:#0a0e14; --pr-panel:#0b0f16ee; --pr-line:#1b2431; --pr-text:#e7edf5;
  --pr-muted:#8b98ab; --pr-cyan:#22d3ee; --pr-purple:#a78bfa; --pr-track:#0f1a26;
  --pr-vignette:rgba(2,4,8,.6);
  position:fixed; inset:0; background:var(--pr-bg); color:var(--pr-text);
  font-family:'Space Grotesk','Inter',system-ui,sans-serif; overflow:hidden;
}
/* Light theme - every 2D piece (nav/panel/loader/mobile fallback) already
   reads these tokens instead of hardcoded colors, so this block alone
   re-themes all of it. The 3D room itself (floor/walls/fog - real
   Three.js material colors, not CSS) is re-themed separately via a theme
   prop threaded into Experience.jsx/Room.jsx and the station objects
   (see textTheme.js); the monitor/wall-screen "screens" stay
   dark-screened in both themes on purpose. */
.proom-root.proom-light{
  --pr-bg:#eef2f7; --pr-panel:#ffffffee; --pr-line:#d7dee8; --pr-text:#0f172a;
  --pr-muted:#5b6b83; --pr-cyan:#0891b2; --pr-purple:#7c3aed; --pr-track:#dde5ef;
  --pr-vignette:rgba(148,163,184,.35);
}
.proom-root *{box-sizing:border-box;}
.proom-root .mono{font-family:'JetBrains Mono',ui-monospace,monospace;}
.proom-root button{font-family:inherit; cursor:pointer;}
.proom-root a{color:inherit;}
.proom-root :focus-visible{outline:2px solid var(--pr-cyan); outline-offset:2px; border-radius:6px;}

.proom-canvas-wrap{position:absolute; inset:0; z-index:0;}
.proom-canvas-wrap canvas{display:block; width:100% !important; height:100% !important;}

.proom-grain{
  position:absolute; inset:0; z-index:1; pointer-events:none;
  opacity:.045; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
}
.proom-vignette{
  position:absolute; inset:0; z-index:1; pointer-events:none;
  background:radial-gradient(ellipse 75% 70% at 50% 55%, transparent 45%, var(--pr-vignette) 100%);
}

.proom-loader{
  position:absolute; inset:0; z-index:20; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:22px; background:var(--pr-bg);
}
.proom-loader-lines{display:flex; flex-direction:column; gap:8px; text-align:center; min-height:100px;}
.proom-loader-line{font-size:13px; color:var(--pr-cyan); letter-spacing:.03em;}
.proom-loader-bar{width:220px; height:3px; background:var(--pr-track); border-radius:2px; overflow:hidden;}
.proom-loader-bar-fill{height:100%; background:var(--pr-cyan); transition:width .2s ease;}

.proom-nav{position:absolute; top:20px; left:50%; transform:translateX(-50%); z-index:10;
  display:flex; gap:6px; background:var(--pr-panel); border:1px solid var(--pr-line);
  border-radius:12px; padding:6px; backdrop-filter:blur(10px);}
.proom-nav-btn{background:none; border:0; padding:8px 14px; border-radius:8px; font-size:12.5px;
  color:var(--pr-muted); font-weight:600;}
.proom-nav-btn:hover{color:var(--pr-text);}
.proom-nav-btn.on{background:color-mix(in srgb, var(--pr-cyan) 16%, transparent); color:var(--pr-cyan);}

.proom-exit{position:absolute; top:20px; left:20px; z-index:10; display:flex; align-items:center; gap:6px;
  background:var(--pr-panel); border:1px solid var(--pr-line); border-radius:12px; padding:9px 14px 9px 12px;
  font-size:12.5px; font-weight:600; color:var(--pr-muted); backdrop-filter:blur(10px);}
.proom-exit:hover{color:var(--pr-cyan); border-color:var(--pr-cyan);}

.proom-theme-toggle{position:absolute; top:20px; right:20px; z-index:10; display:flex; align-items:center;
  justify-content:center; width:36px; height:36px; background:var(--pr-panel); border:1px solid var(--pr-line);
  border-radius:12px; color:var(--pr-muted); backdrop-filter:blur(10px);}
.proom-theme-toggle:hover{color:var(--pr-cyan); border-color:var(--pr-cyan);}

.proom-panel{position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); z-index:15;
  width:min(92vw, 560px); max-height:80vh; overflow-y:auto; background:var(--pr-panel);
  border:1px solid var(--pr-line); border-radius:16px; padding:0;
  box-shadow:0 30px 80px -20px rgba(0,0,0,.6); backdrop-filter:blur(14px);}
.proom-panel-head{display:flex; align-items:center; justify-content:space-between; padding:18px 22px;
  border-bottom:1px solid var(--pr-line); position:sticky; top:0; background:var(--pr-panel);}
.proom-panel-head h2{margin:0; font-size:16px; font-weight:600; color:var(--pr-cyan);}
.proom-panel-close{background:none; border:1px solid var(--pr-line); border-radius:8px; padding:6px;
  color:var(--pr-muted); display:flex;}
.proom-panel-close:hover{color:var(--pr-text); border-color:var(--pr-cyan);}
.proom-panel-body{padding:22px;}

.proom-terminal-block{margin-bottom:10px;}
.proom-terminal-prompt{color:var(--pr-cyan); font-size:13px;}
.proom-terminal-line{font-size:13px; color:var(--pr-text); padding-left:2px;}
.proom-terminal-note{margin-top:16px; font-size:12.5px; color:var(--pr-muted);}

.proom-skills-group{margin-bottom:16px;}
.proom-skills-group h3{margin:0 0 8px; font-size:12.5px; color:var(--pr-purple); text-transform:uppercase; letter-spacing:.04em;}
.proom-skills-tags{display:flex; flex-wrap:wrap; gap:6px;}
.proom-tag{font-size:11.5px; padding:5px 9px; border-radius:7px; color:var(--pr-muted);
  background:var(--pr-track); border:1px solid var(--pr-line);}

.proom-project-card{border:1px solid var(--pr-line); border-radius:10px; margin-bottom:8px; overflow:hidden;}
.proom-project-head{width:100%; text-align:left; background:var(--pr-track); border:0; padding:12px 14px;
  font-size:13.5px; font-weight:600; color:var(--pr-text);}
.proom-project-body{padding:14px;}
.proom-project-body p{margin:0 0 12px; font-size:12.5px; color:var(--pr-muted); line-height:1.6;}
.proom-arch-diagram{display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px; font-size:11px; color:var(--pr-cyan);}
.proom-arch-step-wrap{display:inline-flex; align-items:center; gap:4px;}
.proom-arch-step{padding:4px 8px; border:1px solid var(--pr-line); border-radius:6px; background:var(--pr-track);}
.proom-arch-arrow{color:var(--pr-cyan); margin:0 2px;}
.proom-project-links{display:flex; gap:10px; margin-top:12px;}
.proom-project-link{display:inline-flex; align-items:center; gap:4px; font-size:12px; color:var(--pr-cyan); text-decoration:none;}
.proom-project-link:hover{text-decoration:underline;}

.proom-timeline-entry{display:flex; gap:16px; padding:12px 10px; border-top:1px solid var(--pr-line); border-radius:8px; transition:background .15s ease;}
.proom-timeline-entry:first-child{border-top:0;}
.proom-timeline-entry.active{background:color-mix(in srgb, var(--pr-cyan) 10%, transparent);}
.proom-timeline-year{color:var(--pr-cyan); font-weight:700; flex:0 0 50px;}
.proom-timeline-entry strong{font-size:13.5px;}
.proom-timeline-entry p{margin:4px 0 0; font-size:12.5px; color:var(--pr-muted); line-height:1.55;}

.proom-dashboard-table{width:100%; border-collapse:collapse; margin-bottom:18px; font-size:12px;}
.proom-dashboard-table th{text-align:left; color:var(--pr-muted); font-weight:600; padding-bottom:8px; border-bottom:1px solid var(--pr-line);}
.proom-dashboard-table td{padding:7px 0; border-bottom:1px solid var(--pr-line);}
.proom-status-dot{display:inline-block; width:7px; height:7px; border-radius:50%; background:#3ee08f; margin-right:4px;}
.proom-dashboard-metrics{display:flex; gap:20px; margin-bottom:14px;}
.proom-dashboard-metrics > div{display:flex; flex-direction:column; gap:2px;}
.proom-metric-num{font-size:22px; font-weight:700; color:var(--pr-cyan);}
.proom-dashboard-metrics span:last-child{font-size:10px; color:var(--pr-muted); letter-spacing:.04em;}
.proom-dashboard-note{margin:0; font-size:11px; color:var(--pr-muted); font-style:italic;}

.proom-contact p{font-size:13px; color:var(--pr-muted); margin:0 0 16px;}
.proom-contact-actions{display:flex; flex-wrap:wrap; gap:10px; margin-bottom:18px;}
.proom-btn{display:inline-flex; align-items:center; gap:8px; font-size:13px; font-weight:600; padding:10px 16px;
  border-radius:9px; border:1px solid var(--pr-line); background:var(--pr-track); color:var(--pr-text); text-decoration:none;}
.proom-btn:hover{border-color:var(--pr-cyan); color:var(--pr-cyan);}
.proom-btn-primary{background:var(--pr-cyan); border-color:var(--pr-cyan); color:#04212b;}
.proom-btn-primary:hover{filter:brightness(1.08); color:#04212b;}
.proom-contact-socials{display:flex; gap:20px; font-size:12.5px;}
.proom-contact-socials a{display:flex; align-items:center; gap:6px; text-decoration:none; color:var(--pr-muted);}
.proom-contact-socials a:hover{color:var(--pr-cyan);}

.proom-speech-bubble{background:var(--pr-panel); border:1px solid var(--pr-cyan); color:var(--pr-text);
  padding:6px 10px; border-radius:8px; font-size:12px; white-space:nowrap; pointer-events:none;}

.proom-mobile{position:absolute; inset:0; overflow-y:auto; padding:0 20px 60px;}
.proom-mobile-hero{min-height:60vh; display:flex; flex-direction:column; align-items:center; justify-content:center;
  text-align:center; gap:10px;}
.proom-mobile-hero h1{margin:0; font-size:28px; font-weight:700;}
.proom-mobile-hero p{margin:0; color:var(--pr-cyan); font-size:13px;}
.proom-mobile-hint{color:var(--pr-muted) !important; font-size:12px !important; max-width:420px;}
.proom-mobile-section{padding:28px 0; border-top:1px solid var(--pr-line);}
.proom-mobile-section h2{margin:0 0 16px; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--pr-purple);}

@media (prefers-reduced-motion: reduce){
  .proom-root *{animation-duration:.01ms !important; transition-duration:.01ms !important;}
}
`;
