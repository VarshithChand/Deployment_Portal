import { useRef, useState } from "react";

import { getSessionEpoch } from "../services/authService";
import usePolling from "../hooks/usePolling";
import performLogout from "../utils/performLogout";

const POLL_MS = 15000;

// Runs for every visitor, logged in or not - unlike PeriodicSignOutMonitor
// (which only runs for a session with something worth protecting), this
// reacts to two portal-side signals, both surfacing through the same
// poll of GET /api/auth/session-epoch:
//   - mySessionForceLogoutEpoch: scoped to just this caller's own session,
//     set either when an admin uses the Services page's Users tab to sign
//     this specific account out, OR when the same account's PAT gets
//     reconnected from a different device (see SessionActivityService.
//     ForceLogout's reason param, set from SettingsService's one-session-
//     per-account eviction) - mySessionForceLogoutReason distinguishes
//     the two so this tab shows an accurate explanation either way.
//   - a 403 on the poll itself: the block-check middleware in Program.cs
//     rejects every request from a blocked session (see
//     SettingsService.BlockPatUserAsync), including this one - that
//     failure IS the "you're blocked" signal, not something read out of
//     a response body. Renders a full-screen glass overlay for as long as
//     that keeps happening, and clears it the moment a poll succeeds
//     again (i.e. an admin unblocked this session) - no reload either way,
//     just the overlay appearing/disappearing in place.
//
// Used to also force-sign out EVERY active session portal-wide whenever
// anyone ran a pipeline - removed, since that meant the person who just
// triggered the deploy got bounced back to the login page too, which made
// no sense once login became a real account instead of a mostly-anonymous
// PAT session with nothing lost by a reload.
export default function GlobalLogoutMonitor() {

    const baselineRef = useRef({ mySessionForceLogoutEpoch: undefined });
    const [blocked, setBlocked] = useState(false);

    async function checkEpoch() {

        let data;

        try {
            data = await getSessionEpoch();
        }
        catch (err) {
            setBlocked(err.response?.status === 403);
            return;
        }

        setBlocked(false);

        const baseline = baselineRef.current;

        if (baseline.mySessionForceLogoutEpoch === undefined) {
            baselineRef.current = data;
            return;
        }

        if (data.mySessionForceLogoutEpoch !== baseline.mySessionForceLogoutEpoch) {
            performLogout(data.mySessionForceLogoutReason || "admin");
        }

    }

    usePolling(checkEpoch, POLL_MS);

    if (!blocked) {
        return null;
    }

    return (

        <div className="blocked-overlay" role="alertdialog" aria-modal="true" aria-labelledby="blocked-overlay-title">

            <div className="blocked-overlay-content">

                <h2 id="blocked-overlay-title">
                    Access blocked
                </h2>

                <p>
                    The portal admin has blocked this session. You'll regain access automatically,
                    with no need to reload, as soon as they unblock you.
                </p>

            </div>

        </div>

    );

}
