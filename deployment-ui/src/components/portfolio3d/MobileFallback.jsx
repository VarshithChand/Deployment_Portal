import { useState, Suspense, lazy } from "react";
import { PROFILE } from "../../data/portfolio3dData";
import { AboutContent } from "./stations/TerminalAbout";
import { SkillsContent } from "./stations/CloudSkills";
import { ProjectsContent } from "./stations/PipelineProjects";
import { ExperienceContent } from "./stations/TimelineExperience";
import { DashboardContent } from "./stations/WallDashboard";
import { ContactContent } from "./stations/ContactConsole";

const Experience = lazy(() => import("./Experience"));

// Mobile doesn't get the full navigable 3D room by default - a static
// hero plus a normal scrollable stack of the exact same content
// components the desktop panels use (so there's genuinely one source of
// content, not a separately-maintained mobile copy), with an explicit
// opt-in button to still load the full 3D experience for anyone who
// wants it on a phone anyway.
export default function MobileFallback({ reducedMotion, theme }) {

    const [enteredCommandCenter, setEnteredCommandCenter] = useState(false);

    if (enteredCommandCenter) {
        return (
            <Suspense fallback={<div className="p3d-mobile-loading mono">Loading 3D scene…</div>}>
                <Experience reducedMotion={reducedMotion} theme={theme} />
            </Suspense>
        );
    }

    return (

        <div className="p3d-mobile">

            <section className="p3d-mobile-hero">
                <h1>{PROFILE.name}</h1>
                <p className="mono">{PROFILE.role}</p>
                <button type="button" className="p3d-btn p3d-btn-primary" onClick={() => setEnteredCommandCenter(true)}>
                    Enter Command Center
                </button>
                <p className="p3d-mobile-hint">or scroll for the full content below ↓</p>
            </section>

            <section className="p3d-mobile-section">
                <h2>About</h2>
                <AboutContent />
            </section>

            <section className="p3d-mobile-section">
                <h2>Skills</h2>
                <SkillsContent />
            </section>

            <section className="p3d-mobile-section">
                <h2>Projects</h2>
                <ProjectsContent />
            </section>

            <section className="p3d-mobile-section">
                <h2>Experience</h2>
                <ExperienceContent />
            </section>

            <section className="p3d-mobile-section">
                <h2>Status</h2>
                <DashboardContent reducedMotion={reducedMotion} />
            </section>

            <section className="p3d-mobile-section">
                <h2>Contact</h2>
                <ContactContent />
            </section>

        </div>

    );

}
