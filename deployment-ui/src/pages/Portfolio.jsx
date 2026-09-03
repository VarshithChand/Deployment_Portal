import { useEffect } from "react";
import CommandCenter from "../components/portfolio3d/CommandCenter";
import { PROFILE } from "../data/portfolio3dData";

// The login page's Portfolio tool (see LoginSignupPage's toolsMenu) - a
// 3D "Command Center" experience (see components/portfolio3d/), replacing
// the earlier flat 2D "build log" version per the user's own explicit
// decision (2026-09-03) to go all-in on full 3D despite the tradeoffs
// (crawlability, bundle weight, accessibility) that were raised and
// accepted going in. Still no login, still nothing saved.
export default function Portfolio() {

    useEffect(() => {

        const prevTitle = document.title;
        document.title = `${PROFILE.name} | ${PROFILE.role}`;

        return () => { document.title = prevTitle; };

    }, []);

    return <CommandCenter />;

}
