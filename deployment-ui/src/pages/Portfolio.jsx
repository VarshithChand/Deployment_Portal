import { useEffect } from "react";
import PortfolioRoom from "../components/portfolio-room/PortfolioRoom";
import { PROFILE } from "../components/portfolio-room/data/profile";

// The login page's Portfolio tool (see LoginSignupPage's toolsMenu) - a
// walk-in-able 3D room (see components/portfolio-room/): every section is
// a real object (monitor, phone, pendant light, wall screen, rack, wall
// timeline) rather than a scrollable page. Still no login, still nothing
// saved.
export default function Portfolio({ onExit }) {

    useEffect(() => {

        const prevTitle = document.title;
        document.title = `${PROFILE.name} | ${PROFILE.role}`;

        return () => { document.title = prevTitle; };

    }, []);

    return <PortfolioRoom onExit={onExit} />;

}
