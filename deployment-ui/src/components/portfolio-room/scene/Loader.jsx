import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";
import { motion, AnimatePresence } from "framer-motion";

// Boot overlay shown before the room becomes interactive. Unlike an
// all-primitives room, this one has a real asset to wait on (the Greeter
// avatar's GLB), so useProgress's `progress` genuinely moves and reaches
// 100 through drei's own LoadingManager tracking - the bar isn't purely
// decorative. `total === 0` is kept as a fallback for the (unlikely) case
// the GLB fails to register with the manager at all, so the loader can't
// get stuck waiting on a load that will never report progress.
const LINES = [
    "INITIALIZING PORTFOLIO...",
    "Infrastructure: ONLINE",
    "Deployments: READY",
    "Systems: OPERATIONAL"
];

const LINE_INTERVAL_MS = 380;

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

    const ready = (total === 0 || progress >= 100) && visibleLines >= LINES.length;

    useEffect(() => {

        if (!ready) return;

        const timer = setTimeout(() => setDismissed(true), reducedMotion ? 0 : 350);
        return () => clearTimeout(timer);

    }, [ready, reducedMotion]);

    useEffect(() => {

        if (dismissed) onDone();

    }, [dismissed, onDone]);

    return (

        <AnimatePresence>
            {!dismissed && (

                <motion.div
                    className="proom-loader"
                    role="status"
                    aria-live="polite"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                >

                    <div className="proom-loader-lines mono">
                        {LINES.slice(0, visibleLines).map((line) => (
                            <div key={line} className="proom-loader-line">{line}</div>
                        ))}
                    </div>

                    <div className="proom-loader-bar">
                        <div className="proom-loader-bar-fill" style={{ width: `${Math.min(total === 0 ? (visibleLines / LINES.length) * 100 : progress, 100)}%` }} />
                    </div>

                </motion.div>

            )}
        </AnimatePresence>

    );

}
