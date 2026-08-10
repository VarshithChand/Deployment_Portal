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

    // A plain `logout()` only clears the auth cookie and flips `user` to
    // null in React state - anything already loaded on screen (deployment
    // history, credentials forms, etc.) stays rendered until its own
    // component happens to unmount. For an idle/background timeout that's
    // not enough: the whole point is that walking away shouldn't leave
    // your data sitting there for the next person, so this forces a real
    // navigation after the cookie clears, wiping all in-memory state and
    // landing back on Dashboard with TopBar's "Login with GitHub" showing
    // - the same clean-slate landing Settings' own "Clear All Data" uses.
    async function performLogout() {

        try {
            await logout();
        }
        finally {

            const url = new URL(window.location.href);
            url.searchParams.set("tab", "dashboard");
            url.searchParams.delete("view");
            window.location.href = url.toString();

        }

    }

    const idleTimerRef = useRef(null);

    // Read from the activity listener below instead of `warning` itself,
    // so that listener never needs to be torn down and re-attached just
    // because the warning toggled — it's set up once per login and reads
    // the latest value through this ref.
    const warningRef = useRef(false);

    useEffect(() => {
        warningRef.current = warning;
    }, [warning]);

    // Separate from the foreground idle timer above: while the tab is
    // hidden (switched to another app/window) nobody is there to see the
    // "Still there?" dialog or respond to it, so backgrounding logs out
    // directly on its own 2-minute clock instead of routing through the
    // warning. hiddenSinceRef also covers the case where the device itself
    // was asleep/suspended and the background setTimeout never got to fire
    // - visibility returning re-checks real elapsed wall-clock time rather
    // than trusting the timer alone.
    const backgroundTimerRef = useRef(null);
    const hiddenSinceRef = useRef(null);

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

    // Backgrounding the tab (switching to another app/window) starts its
    // own plain 2-minute clock, independent of clicks or the warning
    // dialog - there's no point warning someone who isn't looking at the
    // screen, so this logs out directly the moment it elapses. Coming back
    // within the window cancels it; coming back after it (e.g. the laptop
    // was asleep, so the setTimeout itself never got to fire) catches up
    // by comparing real elapsed time instead.
    useEffect(() => {

        if (!user) return;

        function handleVisibilityChange() {

            if (document.hidden) {

                hiddenSinceRef.current = Date.now();

                backgroundTimerRef.current = setTimeout(() => {
                    setWarning(false);
                    performLogout();
                }, IDLE_TIMEOUT_MS);

                return;

            }

            if (backgroundTimerRef.current) {
                clearTimeout(backgroundTimerRef.current);
                backgroundTimerRef.current = null;
            }

            const hiddenSince = hiddenSinceRef.current;
            hiddenSinceRef.current = null;

            if (hiddenSince && Date.now() - hiddenSince >= IDLE_TIMEOUT_MS) {
                performLogout();
            }

        }

        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {

            document.removeEventListener("visibilitychange", handleVisibilityChange);
            if (backgroundTimerRef.current) clearTimeout(backgroundTimerRef.current);
            hiddenSinceRef.current = null;

        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

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
            performLogout();

        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [warning, secondsLeft]);

    function handleStay() {

        setWarning(false);
        scheduleWarning();

    }

    function handleLogoutNow() {

        setWarning(false);
        performLogout();

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
