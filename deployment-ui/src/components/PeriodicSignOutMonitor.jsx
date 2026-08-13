import { useEffect, useRef, useState } from "react";

import useAuth from "../hooks/useAuth";
import useNavigation from "../hooks/useNavigation";
import performSignOut from "../utils/performSignOut";
import { isPortalLocked, setPortalLocked, clearPortalLocked } from "../utils/portalLock";
import PinLockScreen from "./PinLockScreen";

const WARNING_AFTER_MS = 10 * 60 * 1000;
const LOGOUT_AFTER_MS = 30 * 60 * 1000;

// Real idle detection, not a fixed schedule - both timers below reset on
// every tab switch (the one activity signal every page in this app
// already reports through useNavigation, without wiring up a separate
// mouse/keyboard listener nobody else here uses). Someone actively
// clicking around the portal never sees the "Still there?" nudge; it only
// shows up after 10 minutes with no page switch, and if genuinely nobody's
// there for a full 30 minutes, this signs them out on its own rather than
// waiting on a response that isn't coming.
//
// What happens depends on whether a screen-lock PIN is set (see
// SecurityPinSection):
// - PIN set: locks the screen (PinLockScreen) - a "fake logout" that
//   blocks interaction but touches nothing. Credentials stay saved; the
//   right PIN just resumes the same idle cycle.
// - No PIN: a real but NON-destructive sign-out (performSignOut) - the
//   token and any AWS/Azure/GCP credentials tied to it are left exactly
//   as they are, only marked "not connected," same as the manual Sign
//   Out button in Settings' Danger Zone. This used to wipe every saved
//   credential outright (performSelfClear) - replaced because 30 minutes
//   of idle time in an open tab isn't evidence anything was actually
//   compromised, just that nobody's looking at the screen right now.
export default function PeriodicSignOutMonitor() {

    const { user, githubTokenConfigured, pinConfigured } = useAuth();
    const { tab } = useNavigation();
    const active = !!user || githubTokenConfigured;

    const [warning, setWarning] = useState(false);

    // Read from localStorage (see utils/portalLock), not just started as
    // false - a lock engaged before a hard refresh (Ctrl+Shift+R) or a
    // closed/reopened tab needs to still be locked the moment this
    // component remounts, not reset back to unlocked along with every
    // other piece of component state.
    const [locked, setLocked] = useState(isPortalLocked);

    const warnTimerRef = useRef(null);
    const logoutTimerRef = useRef(null);

    function clearTimers() {
        if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    }

    // Both timers restart from zero together - there's no separate
    // "you had 20 seconds to answer" countdown anymore. The warning is
    // purely informational; the 30-minute clock is what actually acts,
    // and it keeps running whether or not the warning was ever dismissed.
    function scheduleTimers() {

        clearTimers();

        warnTimerRef.current = setTimeout(() => setWarning(true), WARNING_AFTER_MS);
        logoutTimerRef.current = setTimeout(() => performSignOut("idle"), LOGOUT_AFTER_MS);

    }

    useEffect(() => {

        if (!active) {

            // Deliberately doesn't touch `locked` here - active flips false
            // for two very different reasons (no session worth protecting
            // at all, OR the auth check simply hasn't resolved yet on a
            // fresh reload - see oauthStatusChecked elsewhere) and an
            // engaged lock shouldn't silently lift just because this fired
            // during that resolving window. It only ever lifts via a
            // correct PIN (handleUnlocked) or a self-sign-out clearing it.
            clearTimers();
            setWarning(false);
            return;

        }

        // A tab switch is itself proof someone's there - clears any
        // warning already showing and restarts both clocks from now.
        setWarning(false);
        scheduleTimers();

        return clearTimers;

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, active]);

    function handleStay() {

        setWarning(false);
        scheduleTimers();

    }

    async function handleSignOutNow() {

        setWarning(false);

        if (pinConfigured) {
            setPortalLocked();
            setLocked(true);
            return;
        }

        await performSignOut();

    }

    function handleUnlocked() {

        clearPortalLocked();
        setLocked(false);
        scheduleTimers();

    }

    // Checked before `active` - an engaged lock (manual or via the idle
    // timer) stays up regardless of whether a session still looks
    // "active" at this exact instant, which is also what makes it survive
    // the brief window right after a hard refresh where active hasn't
    // resolved to true yet.
    if (locked) {
        return <PinLockScreen onUnlock={handleUnlocked} />;
    }

    if (!active || !warning) {
        return null;
    }

    return (

        <div className="dialog-backdrop" role="presentation">

            <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="periodic-signout-title">

                <h2 id="periodic-signout-title">
                    Still there?
                </h2>

                <p>
                    {pinConfigured ? (

                        <>
                            You've been idle for a while. Lock the screen now, or keep working and
                            we'll only ask again after another 10 quiet minutes.
                        </>

                    ) : (

                        <>
                            You've been idle for a while. If nothing changes for another 20 minutes,
                            you'll be signed out automatically — nothing you've saved will be cleared.
                        </>

                    )}
                </p>

                <div>

                    <button type="button" className="btn btn-success" onClick={handleStay} autoFocus>
                        Stay
                    </button>

                    <button type="button" className="btn btn-danger" onClick={handleSignOutNow}>
                        {pinConfigured ? "Lock Now" : "Sign Out Now"}
                    </button>

                </div>

            </div>

        </div>

    );

}
