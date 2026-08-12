import { useEffect, useRef, useState } from "react";

import useAuth from "../hooks/useAuth";
import performSelfClear from "../utils/performSelfClear";
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
    const [locked, setLocked] = useState(false);

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

            if (timerRef.current) clearTimeout(timerRef.current);
            setWarning(false);
            setLocked(false);
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

        setLocked(false);
        schedulePrompt();

    }

    if (!active) {
        return null;
    }

    if (locked) {
        return <PinLockScreen onUnlock={handleUnlocked} />;
    }

    if (!warning) {
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
