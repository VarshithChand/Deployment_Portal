import { useStore } from "../../state/store";
import { ABOUT } from "../../data/profile";

// Shows every block (identity, tagline, education) at once, same as
// before, but now with a "Next" control that advances `aboutSlide` -
// shared with MonitorAbout.jsx's 3D screen, which shows only the
// current one at a time. This panel is the actual control for that: a
// click target living on the monitor's own face would sit exactly where
// this panel opens on top of it the moment you're close enough to reach
// it, so the panel - the layer that's actually on top - is what drives
// it instead. The currently-showing block is highlighted here so it's
// clear what "Next" is advancing.
export default function About() {

    const slideIndex = useStore((s) => s.aboutSlide);
    const setAboutSlide = useStore((s) => s.setAboutSlide);

    return (

        <div className="proom-terminal mono">

            {ABOUT.whoami.map((block, i) => (
                <div key={i} className={`proom-terminal-block${i === slideIndex ? " on-screen" : ""}`}>
                    {block.prompt && <div className="proom-terminal-prompt">{block.prompt}</div>}
                    {block.lines.map((line) => <div key={line} className="proom-terminal-line">{line}</div>)}
                </div>
            ))}

            <div className="proom-terminal-block">
                <div className="proom-terminal-prompt">&gt; Explore my work</div>
            </div>

            <div className="proom-monitor-control">
                <span>On the monitor: {slideIndex + 1} / {ABOUT.whoami.length}</span>
                <button
                    type="button"
                    className="proom-btn"
                    onClick={() => setAboutSlide((slideIndex + 1) % ABOUT.whoami.length)}
                >
                    Next &gt;
                </button>
            </div>

        </div>

    );

}
