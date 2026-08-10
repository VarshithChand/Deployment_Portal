import { useRef } from "react";

import { getSessionEpoch } from "../services/authService";
import usePolling from "../hooks/usePolling";
import performLogout from "../utils/performLogout";

const POLL_MS = 15000;

// Runs for every visitor, logged in or not - unlike IdleLogoutMonitor
// (which only has an OAuth `user` to expire), this reacts to two portal-
// side signals from GET /api/auth/session-epoch:
//   - forceLogoutEpoch: portal-wide, bumped whenever someone triggers a
//     deployment (see SettingsService.BumpForceLogoutEpochAsync).
//   - mySessionForceLogoutEpoch: scoped to just this caller's own session,
//     set when an admin uses the Services page's Users tab to sign this
//     specific PAT user out (or blocks them) - see SessionActivityService.
// The first poll just establishes a baseline for both; any later poll
// where either value differs from its baseline means "sign out now."
export default function GlobalLogoutMonitor() {

    const baselineRef = useRef({ forceLogoutEpoch: undefined, mySessionForceLogoutEpoch: undefined });

    async function checkEpoch() {

        let data;

        try {
            data = await getSessionEpoch();
        }
        catch {
            return;
        }

        const baseline = baselineRef.current;

        if (baseline.forceLogoutEpoch === undefined) {
            baselineRef.current = data;
            return;
        }

        if (data.forceLogoutEpoch !== baseline.forceLogoutEpoch) {
            performLogout("deploy");
            return;
        }

        if (data.mySessionForceLogoutEpoch !== baseline.mySessionForceLogoutEpoch) {
            performLogout("admin");
        }

    }

    usePolling(checkEpoch, POLL_MS);

    return null;

}
