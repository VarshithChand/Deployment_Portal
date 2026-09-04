import { useEffect, useState } from "react";
import { motion } from "framer-motion";

// Mirrors Loader.jsx's own boot-sequence look (same CSS classes, same
// mono/mono-line rhythm) but for leaving instead of arriving - reusing
// that visual language so the two read as one coherent pair rather than
// two unrelated transitions. Renders on TOP of the still-visible room
// (fades in over it, doesn't replace it outright) so leaving reads as a
// deliberate shutdown rather than an abrupt cut to the login page - the
// room was previously torn down the instant Exit/the door was clicked,
// with no transition at all.
const LINES = [
    "SHUTTING DOWN...",
    "Closing session...",
    "Powering down...",
    "See you soon."
];

const LINE_INTERVAL_MS = 260;

export default function ExitOverlay({ reducedMotion, onDone }) {

    const [visibleLines, setVisibleLines] = useState(reducedMotion ? LINES.length : 0);

    useEffect(() => {

        if (reducedMotion) return;
        if (visibleLines >= LINES.length) return;

        const timer = setTimeout(() => setVisibleLines((n) => n + 1), LINE_INTERVAL_MS);
        return () => clearTimeout(timer);

    }, [visibleLines, reducedMotion]);

    useEffect(() => {

        if (visibleLines < LINES.length) return;

        const timer = setTimeout(onDone, reducedMotion ? 0 : 340);
        return () => clearTimeout(timer);

    }, [visibleLines, reducedMotion, onDone]);

    return (

        <motion.div
            className="proom-loader"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reducedMotion ? 0.01 : 0.4 }}
            style={{ zIndex: 30 }}
        >

            <div className="proom-loader-lines mono">
                {LINES.slice(0, visibleLines).map((line) => (
                    <div key={line} className="proom-loader-line">{line}</div>
                ))}
            </div>

        </motion.div>

    );

}
