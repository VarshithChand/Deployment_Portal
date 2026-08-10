import { useEffect, useRef, useState } from "react";

import useAuth from "../hooks/useAuth";
import useNavigation from "../hooks/useNavigation";

const IDLE_TIMEOUT_MS = 2 * 60 * 1000;
const WARNING_SECONDS = 30;

// Deliberately narrow: a click (covers touch taps too, via the browser's
// own synthesized click event) or switching tabs — not mouse movement,
// scrolling, or keystrokes. Just having the page open and glancing at it
// doesn't count as "still here."
const ACTIVITY_EVENTS = ["click"];

// Auto-logout after 2 minutes with no activity — but not silently: a
// warning dialog appears first, giving 30s to click "Stay signed in"
// before it actually happens. No response (or an explicit "Log out now")
// ends the session the same way the account menu's own Logout does.
// Only runs at all for an OAuth-logged-in session (`user`) - there's no
// login state to expire for anonymous/Public View browsing.
export default function IdleLogoutMonitor() {

    const { user, logout } = useAuth();
    const { tab } = useNavigation();

    const [warning, setWarning] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(WARNING_SECONDS);

    const idleTimerRef = useRef(null);

    // Read from the activity listener below instead of `warning` itself,
    // so that listener never needs to be torn down and re-attached just
    // because the warning toggled — it's set up once per login and reads
    // the latest value through this ref.
    const warningRef = useRef(false);

    useEffect(() => {
        warningRef.current = warning;
    }, [warning]);

    function scheduleWarning() {

        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

        idleTimerRef.current = setTimeout(() => {
            setSecondsLeft(WARNING_SECONDS);
            setWarning(true);
        }, IDLE_TIMEOUT_MS);

    }

    // Set up once per login session (not per warning toggle) - activity
    // while the warning is already showing is deliberately ignored here so
    // an incidental mouse movement over the backdrop can't silently cancel
    // a warning the user hasn't actually acknowledged; only the explicit
    // "Stay signed in" button (see handleStay) does that.
    useEffect(() => {

        if (!user) {

            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            setWarning(false);
            return;

        }

        function handleActivity() {
            if (!warningRef.current) scheduleWarning();
        }

        scheduleWarning();
        ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handleActivity));

        return () => {

            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));

        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    // Switching tabs counts as activity too, same click-only guard as
    // handleActivity above (in practice a tab switch only ever happens via
    // a sidebar click anyway, which that click listener already covers -
    // this catches any other way `tab` might change).
    useEffect(() => {

        if (!user || warningRef.current) return;
        scheduleWarning();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    // Countdown while the warning is up — pure state ticking, the actual
    // logout is a separate effect reacting to it hitting zero.
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
            logout();

        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [warning, secondsLeft]);

    function handleStay() {

        setWarning(false);
        scheduleWarning();

    }

    function handleLogoutNow() {

        setWarning(false);
        logout();

    }

    if (!user || !warning) {
        return null;
    }

    return (

        <div className="dialog-backdrop" role="presentation">

            <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="idle-logout-title">

                <h2 id="idle-logout-title">
                    Still there?
                </h2>

                <p>
                    You've been inactive for a while. For your security, you'll be signed out in{" "}
                    <strong>{secondsLeft}s</strong> unless you choose to stay.
                </p>

                <div>

                    <button type="button" className="btn btn-success" onClick={handleStay} autoFocus>
                        Stay signed in
                    </button>

                    <button type="button" className="btn btn-danger" onClick={handleLogoutNow}>
                        Log out now
                    </button>

                </div>

            </div>

        </div>

    );

}
