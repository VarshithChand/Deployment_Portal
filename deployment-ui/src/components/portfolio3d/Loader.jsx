import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";
import { motion, AnimatePresence } from "framer-motion";

// Boot sequence overlay - a 2D HTML layer (not inside the Canvas), shown
// before the room becomes interactive. useProgress reports REAL loading
// progress (there's nothing heavy to load here - the room is built from
// primitives, not GLB models, per the "primitives first" build order -
// so this resolves to 100% almost immediately; the line-by-line reveal
// below is what actually paces the boot sequence, not asset loading).
// Skips straight to done under prefers-reduced-motion instead of running
// the full timed reveal.
const LINES = [
    "INITIALIZING PORTFOLIO...",
    "Infrastructure: ONLINE",
    "Deployments: READY",
    "Systems: OPERATIONAL"
];

const LINE_INTERVAL_MS = 420;

export default function Loader({ reducedMotion, onDone }) {

    const { progress } = useProgress();
    const [visibleLines, setVisibleLines] = useState(reducedMotion ? LINES.length : 0);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {

        if (reducedMotion) return;

        if (visibleLines >= LINES.length) return;

        const timer = setTimeout(() => setVisibleLines((n) => n + 1), LINE_INTERVAL_MS);
        return () => clearTimeout(timer);

    }, [visibleLines, reducedMotion]);

    const ready = progress >= 100 && visibleLines >= LINES.length;

    useEffect(() => {

        if (!ready) return;

        const holdMs = reducedMotion ? 0 : 400;
        const timer = setTimeout(() => setDismissed(true), holdMs);
        return () => clearTimeout(timer);

    }, [ready, reducedMotion]);

    useEffect(() => {

        if (dismissed) onDone();

    }, [dismissed, onDone]);

    return (

        <AnimatePresence>
            {!dismissed && (

                <motion.div
                    className="p3d-loader"
                    role="status"
                    aria-live="polite"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                >

                    <div className="p3d-loader-lines mono">
                        {LINES.slice(0, visibleLines).map((line) => (
                            <div key={line} className="p3d-loader-line">{line}</div>
                        ))}
                    </div>

                    <div className="p3d-loader-bar">
                        <div className="p3d-loader-bar-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
                    </div>

                </motion.div>

            )}
        </AnimatePresence>

    );

}
