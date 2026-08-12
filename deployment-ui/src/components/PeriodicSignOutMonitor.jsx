import { useEffect, useRef, useState } from "react";

import useAuth from "../hooks/useAuth";
import performSelfClear from "../utils/performSelfClear";
import { isPortalLocked, setPortalLocked, clearPortalLocked } from "../utils/portalLock";
import PinLockScreen from "./PinLockScreen";

const PROMPT_INTERVAL_MS = 10 * 60 * 1000;
const WARNING_SECONDS = 20;

// Every 10 minutes, on a fixed schedule regardless of activity, asks
// "stay or sign out" - not an idle timeout (clicking around doesn't
// reset it), a mandatory periodic check-in. Runs for any session with
// something worth protecting: an OAuth login (`user`) or a PAT-only
// Public View session that's connected a repo (`githubTokenConfigured`).
//
// What happens when it's not answered (or "Sign Out" is chosen)
// branches on whether a screen-lock PIN is set (see SecurityPinSection):
// - PIN set: locks the screen (PinLockScreen) - a "fake logout" that
//   blocks interaction but touches nothing. Credentials stay saved;
//   the right PIN just resumes the same 10-minute cycle.
// - No PIN: the original behavior, unchanged - performSelfClear wipes
//   every credential this browser has saved (GitHub, AWS, Azure, GCP),
//   same scope as Settings' own "Clear All Data".
export default function PeriodicSignOutMonitor() {

    const { user, githubTokenConfigured, pinConfigured } = useAuth();
    const active = !!user || githubTokenConfigured;

    const [warning, setWarning] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(WARNING_SECONDS);

    // Read from localStorage (see utils/portalLock), not just started as
    // false - a lock engaged before a hard refresh (Ctrl+Shift+R) or a
    // closed/reopened tab needs to still be locked the moment this
    // component remounts, not reset back to unlocked along with every
    // other piece of component state.
    const [locked, setLocked] = useState(isPortalLocked);

    const timerRef = useRef(null);

    function schedulePrompt() {

        if (timerRef.current) clearTimeout(timerRef.current);

        timerRef.current = setTimeout(() => {
            setSecondsLeft(WARNING_SECONDS);
            setWarning(true);
        }, PROMPT_INTERVAL_MS);

    }

    useEffect(() => {

        if (!active) {

            // Deliberately doesn't touch `locked` here - active flips false
            // for two very different reasons (no session worth protecting
            // at all, OR the auth check simply hasn't resolved yet on a
            // fresh reload - see oauthStatusChecked elsewhere) and an
            // engaged lock shouldn't silently lift just because this fired
            // during that resolving window. It only ever lifts via a
            // correct PIN (handleUnlocked) or a full data wipe
            // (performSelfClear, which also clears the persisted flag).
            if (timerRef.current) clearTimeout(timerRef.current);
            setWarning(false);
            return;

        }

        schedulePrompt();

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    // Countdown while the prompt is up — pure state ticking, the actual
    // lock-or-clear is a separate effect reacting to it hitting zero.
    useEffect(() => {

        if (!warning) return;

        const interval = setInterval(() => {
            setSecondsLeft((seconds) => Math.max(seconds - 1, 0));
        }, 1000);

        return () => clearInterval(interval);

    }, [warning]);

    function endCheckIn() {

        setWarning(false);

        if (pinConfigured) {
            setPortalLocked();
            setLocked(true);
        }
        else {
            performSelfClear();
        }

    }

    useEffect(() => {

        if (warning && secondsLeft === 0) {
            endCheckIn();
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [warning, secondsLeft]);

    function handleStay() {

        setWarning(false);
        schedulePrompt();

    }

    function handleUnlocked() {

        clearPortalLocked();
        setLocked(false);
        schedulePrompt();

    }

    // Checked before `active` - an engaged lock (manual or via the 10-
    // minute prompt) stays up regardless of whether a session still looks
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
                            Do you want to stay signed in? If you don't respond within{" "}
                            <strong>{secondsLeft}s</strong> the screen will lock — you'll need your
                            PIN to continue, but nothing gets cleared.
                        </>

                    ) : (

                        <>
                            Do you want to stay signed in? For your security, if you don't respond within{" "}
                            <strong>{secondsLeft}s</strong> you'll be signed out and your saved credentials
                            will be cleared.
                        </>

                    )}
                </p>

                <div>

                    <button type="button" className="btn btn-success" onClick={handleStay} autoFocus>
                        Stay
                    </button>

                    <button type="button" className="btn btn-danger" onClick={endCheckIn}>
                        {pinConfigured ? "Lock Now" : "Sign Out"}
                    </button>

                </div>

            </div>

        </div>

    );

}
