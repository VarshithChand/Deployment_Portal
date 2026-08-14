import { useEffect, useState } from "react";

// Drives a live "try again in X" display from a server-provided
// lockedUntilUtc timestamp (see MfaLockoutPolicy on the backend - the
// server, not this hook, decides how long a lockout actually lasts; this
// only formats and counts down whatever it's given). Ticks every second
// while locked, and flips isLocked false the moment the deadline passes
// so the form re-enables itself with no reload needed.
export default function useLockoutCountdown(lockedUntilUtc) {

    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {

        if (!lockedUntilUtc) return;

        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);

    }, [lockedUntilUtc]);

    if (!lockedUntilUtc) {
        return { isLocked: false, formatted: "" };
    }

    const remainingMs = new Date(lockedUntilUtc).getTime() - now;

    if (remainingMs <= 0) {
        return { isLocked: false, formatted: "" };
    }

    const totalSeconds = Math.ceil(remainingMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n) => String(n).padStart(2, "0");

    // Scales the display to whatever tier this is - a 2-minute lockout
    // showing "0d 00h" would be noise, and a 1-day lockout showing raw
    // seconds would be unreadable.
    const formatted = days > 0
        ? `${days}d ${pad(hours)}h`
        : hours > 0
            ? `${hours}h ${pad(minutes)}m`
            : `${pad(minutes)}:${pad(seconds)}`;

    return { isLocked: true, formatted };

}
