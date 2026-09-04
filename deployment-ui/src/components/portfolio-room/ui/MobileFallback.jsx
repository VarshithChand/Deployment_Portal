import { PROFILE } from "../data/profile";
import About from "./sections/About";
import Skills from "./sections/Skills";
import Projects from "./sections/Projects";
import Experience from "./sections/Experience";
import Dashboard from "./sections/Dashboard";
import Contact from "./sections/Contact";
import Resume from "./sections/Resume";

// Mobile doesn't get the full navigable 3D room - a lightweight static
// hero plus a normal scrollable stack of the exact same section
// components the desktop panels use, so there's one source of content,
// not a separately-maintained mobile copy. No 3D avatar/canvas loaded
// here at all, keeping the first view light on a phone.
export default function MobileFallback() {

    return (

        <div className="proom-mobile">

            <section className="proom-mobile-hero">
                <h1>{PROFILE.name}</h1>
                <p className="mono">{PROFILE.role}</p>
                <p className="proom-mobile-hint">{PROFILE.tagline}</p>
            </section>

            <section className="proom-mobile-section">
                <h2>About</h2>
                <About />
            </section>

            <section className="proom-mobile-section">
                <h2>Skills</h2>
                <Skills />
            </section>

            <section className="proom-mobile-section">
                <h2>Projects</h2>
                <Projects />
            </section>

            <section className="proom-mobile-section">
                <h2>Experience</h2>
                <Experience />
            </section>

            <section className="proom-mobile-section">
                <h2>Status</h2>
                <Dashboard />
            </section>

            <section className="proom-mobile-section">
                <h2>Resume</h2>
                <Resume />
            </section>

            <section className="proom-mobile-section">
                <h2>Contact</h2>
                <Contact />
            </section>

        </div>

    );

}
