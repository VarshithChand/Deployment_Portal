import { Suspense, lazy, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { SceneProvider, useScene, SECTIONS } from "./sceneStore";
import Loader from "./Loader";
import Nav from "./Nav";
import Panel from "./Panel";
import MobileFallback from "./MobileFallback";
import useReducedMotion from "../../hooks/useReducedMotion";
import useIsMobile from "../../hooks/useIsMobile";
import { AboutContent } from "./stations/TerminalAbout";
import { SkillsContent } from "./stations/CloudSkills";
import { ProjectsContent } from "./stations/PipelineProjects";
import { ExperienceContent } from "./stations/TimelineExperience";
import { DashboardContent } from "./stations/WallDashboard";
import { ContactContent } from "./stations/ContactConsole";

// The 3D Canvas itself is lazy - it pulls in @react-three/fiber, drei,
// and three, real weight that shouldn't cost anything for a mobile
// visitor who never opts into it (see MobileFallback) or for the moment
// before the boot sequence even needs it.
const Experience = lazy(() => import("./Experience"));

const SECTION_TITLES = {
    about: "About", skills: "Skills", projects: "Projects",
    experience: "Experience", dashboard: "Status", contact: "Contact"
};

const SECTION_CONTENT = {
    about: AboutContent, skills: SkillsContent, projects: ProjectsContent,
    experience: ExperienceContent, dashboard: DashboardContent, contact: ContactContent
};

// [null (room overview), about, skills, ...] - null is a real stop in the
// sequence so scrolling forward from the room lands on the first station,
// and scrolling back from "about" returns to the room instead of jumping
// straight to "contact".
const SCROLL_ORDER = [null, ...SECTIONS];

function DesktopCommandCenter({ reducedMotion }) {

    const { activeSection, setActiveSection, loaded, setLoaded } = useScene();
    const ActiveContent = activeSection && SECTION_CONTENT[activeSection];
    const wheelLockRef = useRef(false);

    // Mouse-wheel/trackpad scroll steps through stations one at a time,
    // matching the camera's own fly-to pacing, rather than free-scrolling
    // through 3D space (which has no natural "scroll distance" in a room
    // you fly around, not one you scroll down). A short lock after each
    // step absorbs the rest of a single scroll gesture so one flick moves
    // exactly one station, not three. Scrolling while the pointer is over
    // an open panel is left alone so it scrolls the panel's own content
    // instead of changing station.
    useEffect(() => {

        function handleWheel(e) {

            if (!loaded) return;
            if (e.target.closest && e.target.closest(".p3d-panel")) return;
            if (wheelLockRef.current) return;
            if (Math.abs(e.deltaY) < 12) return;

            const currentIndex = SCROLL_ORDER.indexOf(activeSection);
            const nextIndex = currentIndex + (e.deltaY > 0 ? 1 : -1);

            if (nextIndex < 0 || nextIndex >= SCROLL_ORDER.length) return;

            setActiveSection(SCROLL_ORDER[nextIndex]);
            wheelLockRef.current = true;
            setTimeout(() => { wheelLockRef.current = false; }, reducedMotion ? 500 : 1000);

        }

        window.addEventListener("wheel", handleWheel, { passive: true });
        return () => window.removeEventListener("wheel", handleWheel);

    }, [activeSection, loaded, reducedMotion, setActiveSection]);

    return (

        <>

            {!loaded && (
                <Suspense fallback={null}>
                    <Loader reducedMotion={reducedMotion} onDone={() => setLoaded(true)} />
                </Suspense>
            )}

            <div className="p3d-canvas-wrap">
                <Suspense fallback={null}>
                    <Experience reducedMotion={reducedMotion} />
                </Suspense>
            </div>

            <Nav />

            <AnimatePresence>
                {ActiveContent && (
                    <Panel key={activeSection} title={SECTION_TITLES[activeSection]} onClose={() => setActiveSection(null)}>
                        <ActiveContent reducedMotion={reducedMotion} />
                    </Panel>
                )}
            </AnimatePresence>

        </>

    );

}

export default function CommandCenter() {

    const reducedMotion = useReducedMotion();
    const isMobile = useIsMobile();

    return (

        <div className="p3d-root">
            <style>{CSS}</style>

            <SceneProvider>
                {isMobile ? (
                    <MobileFallback reducedMotion={reducedMotion} />
                ) : (
                    <DesktopCommandCenter reducedMotion={reducedMotion} />
                )}
            </SceneProvider>

        </div>

    );

}

const CSS = `
.p3d-root{
  --p3d-bg:#05070b; --p3d-panel:#0b0f16ee; --p3d-line:#1b2431; --p3d-text:#e7edf5;
  --p3d-muted:#8b98ab; --p3d-cyan:#22d3ee; --p3d-purple:#a78bfa;
  position:fixed; inset:0; background:var(--p3d-bg); color:var(--p3d-text);
  font-family:'Space Grotesk','Inter',system-ui,sans-serif; overflow:hidden;
}
.p3d-root *{box-sizing:border-box;}
.p3d-root .mono{font-family:'JetBrains Mono',ui-monospace,monospace;}
.p3d-root button{font-family:inherit; cursor:pointer;}
.p3d-root a{color:inherit;}
.p3d-root :focus-visible{outline:2px solid var(--p3d-cyan); outline-offset:2px; border-radius:6px;}

.p3d-canvas-wrap{position:absolute; inset:0;}
.p3d-canvas-wrap canvas{display:block; width:100% !important; height:100% !important;}

/* loader */
.p3d-loader{
  position:absolute; inset:0; z-index:20; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:22px; background:var(--p3d-bg);
}
.p3d-loader-lines{display:flex; flex-direction:column; gap:8px; text-align:center; min-height:100px;}
.p3d-loader-line{font-size:13px; color:var(--p3d-cyan); letter-spacing:.03em;}
.p3d-loader-bar{width:220px; height:3px; background:#132; border-radius:2px; overflow:hidden;}
.p3d-loader-bar-fill{height:100%; background:var(--p3d-cyan); transition:width .2s ease;}

/* nav */
.p3d-nav{position:absolute; top:20px; left:50%; transform:translateX(-50%); z-index:10;
  display:flex; gap:6px; background:var(--p3d-panel); border:1px solid var(--p3d-line);
  border-radius:12px; padding:6px; backdrop-filter:blur(10px);}
.p3d-nav-btn{background:none; border:0; padding:8px 14px; border-radius:8px; font-size:12.5px;
  color:var(--p3d-muted); font-weight:600;}
.p3d-nav-btn:hover{color:var(--p3d-text);}
.p3d-nav-btn.on{background:color-mix(in srgb, var(--p3d-cyan) 16%, transparent); color:var(--p3d-cyan);}

/* panel */
.p3d-panel{position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); z-index:15;
  width:min(92vw, 560px); max-height:80vh; overflow-y:auto; background:var(--p3d-panel);
  border:1px solid var(--p3d-line); border-radius:16px; padding:0;
  box-shadow:0 30px 80px -20px rgba(0,0,0,.6); backdrop-filter:blur(14px);}
.p3d-panel-head{display:flex; align-items:center; justify-content:space-between; padding:18px 22px;
  border-bottom:1px solid var(--p3d-line); position:sticky; top:0; background:var(--p3d-panel);}
.p3d-panel-head h2{margin:0; font-size:16px; font-weight:600; color:var(--p3d-cyan);}
.p3d-panel-close{background:none; border:1px solid var(--p3d-line); border-radius:8px; padding:6px;
  color:var(--p3d-muted); display:flex;}
.p3d-panel-close:hover{color:var(--p3d-text); border-color:var(--p3d-cyan);}
.p3d-panel-body{padding:22px;}

/* terminal (about) */
.p3d-terminal-block{margin-bottom:10px;}
.p3d-terminal-prompt{color:var(--p3d-cyan); font-size:13px;}
.p3d-terminal-line{font-size:13px; color:var(--p3d-text); padding-left:2px;}
.p3d-terminal-note{margin-top:16px; font-size:12.5px; color:var(--p3d-muted);}

/* skills */
.p3d-skills-group{margin-bottom:16px;}
.p3d-skills-group h3{margin:0 0 8px; font-size:12.5px; color:var(--p3d-purple); text-transform:uppercase; letter-spacing:.04em; transition:color .15s ease;}
.p3d-skills-group.active h3{color:var(--p3d-cyan);}
.p3d-skills-tags{display:flex; flex-wrap:wrap; gap:6px;}
.p3d-tag{font-size:11.5px; padding:5px 9px; border-radius:7px; color:var(--p3d-muted);
  background:#0f1620; border:1px solid var(--p3d-line); transition:border-color .15s ease, color .15s ease;}
.p3d-tag:hover{border-color:var(--p3d-cyan); color:var(--p3d-text);}
.p3d-tag.on{border-color:var(--p3d-cyan); color:var(--p3d-cyan); background:color-mix(in srgb, var(--p3d-cyan) 14%, transparent);}

/* projects */
.p3d-pipeline-strip{display:flex; flex-wrap:wrap; gap:4px; font-size:10.5px; color:var(--p3d-muted);
  margin-bottom:18px; padding-bottom:14px; border-bottom:1px solid var(--p3d-line);}
.p3d-pipeline-stage-wrap{display:inline-flex; align-items:center; gap:4px;}
.p3d-arch-arrow{color:var(--p3d-cyan); margin:0 2px;}
.p3d-project-card{border:1px solid var(--p3d-line); border-radius:10px; margin-bottom:8px; overflow:hidden;}
.p3d-project-head{width:100%; text-align:left; background:#0f1620; border:0; padding:12px 14px;
  font-size:13.5px; font-weight:600; color:var(--p3d-text);}
.p3d-project-body{padding:14px;}
.p3d-project-body p{margin:0 0 12px; font-size:12.5px; color:var(--p3d-muted); line-height:1.6;}
.p3d-arch-diagram{display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px; font-size:11px; color:var(--p3d-cyan);}
.p3d-arch-step-wrap{display:inline-flex; align-items:center; gap:4px;}
.p3d-arch-step{padding:4px 8px; border:1px solid var(--p3d-line); border-radius:6px; background:#0a0e14;}
.p3d-project-links{display:flex; gap:10px; margin-top:12px;}
.p3d-project-link{display:inline-flex; align-items:center; gap:4px; font-size:12px; color:var(--p3d-cyan); text-decoration:none;}
.p3d-project-link:hover{text-decoration:underline;}

/* experience */
.p3d-timeline-entry{display:flex; gap:16px; padding:12px 0; border-top:1px solid var(--p3d-line);}
.p3d-timeline-entry:first-child{border-top:0;}
.p3d-timeline-year{color:var(--p3d-cyan); font-weight:700; flex:0 0 50px;}
.p3d-timeline-entry strong{font-size:13.5px;}
.p3d-timeline-entry p{margin:4px 0 0; font-size:12.5px; color:var(--p3d-muted); line-height:1.55;}

/* dashboard */
.p3d-dashboard-table{width:100%; border-collapse:collapse; margin-bottom:18px; font-size:12px;}
.p3d-dashboard-table th{text-align:left; color:var(--p3d-muted); font-weight:600; padding-bottom:8px; border-bottom:1px solid var(--p3d-line);}
.p3d-dashboard-table td{padding:7px 0; border-bottom:1px solid var(--p3d-line);}
.p3d-status-dot{display:inline-block; width:7px; height:7px; border-radius:50%; background:#3ee08f; margin-right:4px;}
.p3d-dashboard-metrics{display:flex; gap:20px; margin-bottom:14px;}
.p3d-dashboard-metrics > div{display:flex; flex-direction:column; gap:2px;}
.p3d-metric-num{font-size:22px; font-weight:700; color:var(--p3d-cyan);}
.p3d-dashboard-metrics span:last-child{font-size:10px; color:var(--p3d-muted); letter-spacing:.04em;}
.p3d-dashboard-note{margin:0; font-size:11px; color:var(--p3d-muted); font-style:italic;}

/* contact */
.p3d-contact p{font-size:13px; color:var(--p3d-muted); margin:0 0 16px;}
.p3d-contact-actions{display:flex; flex-wrap:wrap; gap:10px; margin-bottom:18px;}
.p3d-btn{display:inline-flex; align-items:center; gap:8px; font-size:13px; font-weight:600; padding:10px 16px;
  border-radius:9px; border:1px solid var(--p3d-line); background:#0f1620; color:var(--p3d-text); text-decoration:none;}
.p3d-btn:hover{border-color:var(--p3d-cyan); color:var(--p3d-cyan);}
.p3d-btn-primary{background:var(--p3d-cyan); border-color:var(--p3d-cyan); color:#04212b;}
.p3d-btn-primary:hover{filter:brightness(1.08); color:#04212b;}
.p3d-contact-socials{display:flex; gap:20px; font-size:12.5px;}
.p3d-contact-socials a{display:flex; align-items:center; gap:6px; text-decoration:none; color:var(--p3d-muted);}
.p3d-contact-socials a:hover{color:var(--p3d-cyan);}

/* mobile fallback */
.p3d-mobile{position:absolute; inset:0; overflow-y:auto; padding:0 20px 60px;}
.p3d-mobile-loading{padding:40px; text-align:center; color:var(--p3d-muted);}
.p3d-mobile-hero{min-height:70vh; display:flex; flex-direction:column; align-items:center; justify-content:center;
  text-align:center; gap:14px;}
.p3d-mobile-hero h1{margin:0; font-size:28px; font-weight:700;}
.p3d-mobile-hero p{margin:0; color:var(--p3d-cyan); font-size:13px;}
.p3d-mobile-hint{color:var(--p3d-muted) !important; font-size:11.5px !important; margin-top:6px !important;}
.p3d-mobile-section{padding:28px 0; border-top:1px solid var(--p3d-line);}
.p3d-mobile-section h2{margin:0 0 16px; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--p3d-purple);}

@media (prefers-reduced-motion: reduce){
  .p3d-root *{animation-duration:.01ms !important; transition-duration:.01ms !important;}
}
`;
