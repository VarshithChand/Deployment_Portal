import { useEffect, useRef, useState } from "react";

// Animates from whatever it last displayed to the new `value` — not
// always from 0 — so a poll-driven number (rate limit, PR count) glides
// to its new figure instead of resetting and re-counting from scratch
// every refresh, which would read as the number glitching rather than
// updating. On first mount `display` starts at 0, so the very first
// render still gets the classic count-up-from-zero feel.
export default function CountUp({ value, duration = 900, className }) {

    const numericValue = Number(value) || 0;

    const [display, setDisplay] = useState(0);
    const prevRef = useRef(0);
    const frameRef = useRef(null);

    useEffect(() => {

        const from = prevRef.current;
        const to = numericValue;

        if (from === to) {
            setDisplay(to);
            return;
        }

        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            setDisplay(to);
            prevRef.current = to;
            return;
        }

        const start = performance.now();
        cancelAnimationFrame(frameRef.current);

        function tick(now) {

            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            setDisplay(Math.round(from + (to - from) * eased));

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(tick);
            }
            else {
                prevRef.current = to;
            }

        }

        frameRef.current = requestAnimationFrame(tick);

        return () => cancelAnimationFrame(frameRef.current);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [numericValue, duration]);

    return (
        <span className={className}>
            {display.toLocaleString()}
        </span>
    );

}
