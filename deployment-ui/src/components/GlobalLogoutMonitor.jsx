import { useRef } from "react";

import { getSessionEpoch } from "../services/authService";
import usePolling from "../hooks/usePolling";
import performLogout from "../utils/performLogout";

const POLL_MS = 15000;

// Runs for every visitor, logged in or not - unlike IdleLogoutMonitor
// (which only has an OAuth `user` to expire), this reacts to a portal-
// wide signal: GET /api/auth/session-epoch returns a timestamp that
// DeploymentController bumps every time someone triggers a deployment
// (see SettingsService.BumpForceLogoutEpochAsync). The first fetch just
// establishes a baseline; any later poll that returns a DIFFERENT value
// means a pipeline ran since this tab loaded, so every tab - not just
// the one that triggered it - signs itself out within one poll interval.
export default function GlobalLogoutMonitor() {

    const baselineRef = useRef(undefined);

    async function checkEpoch() {

        let epoch;

        try {
            epoch = await getSessionEpoch();
        }
        catch {
            return;
        }

        if (baselineRef.current === undefined) {
            baselineRef.current = epoch;
            return;
        }

        if (epoch !== baselineRef.current) {
            performLogout("deploy");
        }

    }

    usePolling(checkEpoch, POLL_MS);

    return null;

}
