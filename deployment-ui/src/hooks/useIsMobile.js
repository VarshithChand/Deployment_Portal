import { useEffect, useState } from "react";

// The 3D command center (see components/portfolio3d/) deliberately doesn't
// try to cram the full navigable-room experience onto a phone - this is
// the single switch that decides "full 3D room" vs. the lighter mobile
// fallback (see MobileFallback.jsx), checked once on mount plus on resize/
// orientation change (a tablet rotated to landscape, or a desktop window
// resized narrow, should get a consistent answer either way).
const BREAKPOINT_PX = 820;

export default function useIsMobile() {

    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== "undefined" && window.innerWidth < BREAKPOINT_PX);

    useEffect(() => {

        function onResize() {
            setIsMobile(window.innerWidth < BREAKPOINT_PX);
        }

        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);

    }, []);

    return isMobile;

}
