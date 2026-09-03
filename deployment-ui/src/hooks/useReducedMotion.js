import { useEffect, useState } from "react";

// Live-updating, not a one-time read - someone can toggle this OS setting
// while the 3D portfolio room is open (see components/portfolio-room/), and
// idle drift/heavy transitions should react immediately rather than only
// on next page load.
export default function useReducedMotion() {

    const [reduced, setReduced] = useState(() =>
        typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

    useEffect(() => {

        const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
        const onChange = () => setReduced(mql.matches);

        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);

    }, []);

    return reduced;

}
