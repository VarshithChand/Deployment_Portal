import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";
import { motion, AnimatePresence } from "framer-motion";

// Boot sequence overlay - a 2D HTML layer (not inside the Canvas), shown
// before the room becomes interactive. The room is built entirely from
// primitives (no textures/GLB models), so nothing ever runs through
// three's LoadingManager - useProgress's `progress` never leaves 0 in
// that case, it does NOT jump to 100 just because there was nothing to
// load. So readiness is paced purely by the line-by-line text reveal;
// `progress` is only used to drive the bar's fill for the (currently
// unused, future-proofing) case where a station does load an asset.
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

    const { progress, total } = useProgress();
    const [visibleLines, setVisibleLines] = useState(reducedMotion ? LINES.length : 0);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {

        if (reducedMotion) return;

        if (visibleLines >= LINES.length) return;

        const timer = setTimeout(() => setVisibleLines((n) => n + 1), LINE_INTERVAL_MS);
        return () => clearTimeout(timer);

    }, [visibleLines, reducedMotion]);

    // total === 0 means nothing was ever handed to the LoadingManager -
    // there's nothing to wait on, so only the text reveal gates readiness.
    const ready = (total === 0 || progress >= 100) && visibleLines >= LINES.length;
    const barProgress = total === 0 ? (visibleLines / LINES.length) * 100 : progress;

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
                        <div className="p3d-loader-bar-fill" style={{ width: `${Math.min(barProgress, 100)}%` }} />
                    </div>

                </motion.div>

            )}
        </AnimatePresence>

    );

}
