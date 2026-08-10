import { useEffect, useRef, useState } from "react";

import useAuth from "../hooks/useAuth";
import performSelfClear from "../utils/performSelfClear";

const PROMPT_INTERVAL_MS = 10 * 60 * 1000;
const WARNING_SECONDS = 20;

// Every 10 minutes, on a fixed schedule regardless of activity, asks
// "stay or sign out" - not an idle timeout (clicking around doesn't
// reset it), a mandatory periodic check-in. Choosing "Sign Out" (or not
// responding within WARNING_SECONDS) clears every credential this
// browser has saved - GitHub, AWS, Azure, GCP (see performSelfClear),
// same scope as Settings' own "Clear All Data" - not just ending a
// session. Runs for any session with something worth protecting: an
// OAuth login (`user`) or a PAT-only Public View session that's
// connected a repo (`githubTokenConfigured`).
export default function PeriodicSignOutMonitor() {

    const { user, githubTokenConfigured } = useAuth();
    const active = !!user || githubTokenConfigured;

    const [warning, setWarning] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(WARNING_SECONDS);

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
            return;

        }

        schedulePrompt();

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    // Countdown while the prompt is up — pure state ticking, the actual
    // clear-and-sign-out is a separate effect reacting to it hitting zero.
    useEffect(() => {

        if (!warning) return;

        const interval = setInterval(() => {
            setSecondsLeft((seconds) => Math.max(seconds - 1, 0));
        }, 1000);

        return () => clearInterval(interval);

    }, [warning]);

    useEffect(() => {

        if (warning && secondsLeft === 0) {

            setWarning(false);
            performSelfClear();

        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [warning, secondsLeft]);

    function handleStay() {

        setWarning(false);
        schedulePrompt();

    }

    function handleSignOut() {

        setWarning(false);
        performSelfClear();

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
                    Do you want to stay signed in? For your security, if you don't respond within{" "}
                    <strong>{secondsLeft}s</strong> you'll be signed out and your saved credentials
                    will be cleared.
                </p>

                <div>

                    <button type="button" className="btn btn-success" onClick={handleStay} autoFocus>
                        Stay
                    </button>

                    <button type="button" className="btn btn-danger" onClick={handleSignOut}>
                        Sign Out
                    </button>

                </div>

            </div>

        </div>

    );

}
