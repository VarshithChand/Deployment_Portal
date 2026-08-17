import { useState } from "react";
import { createPortal } from "react-dom";

import { verifyMyPin } from "../services/settingsService";
import performSelfClear from "../utils/performSelfClear";

const MAX_ATTEMPTS = 5;

// Padlock, not the PatLoginPage KeyIcon - same stroke weight/line-cap
// style as the rest of this app's hand-drawn icon set, just a different
// glyph since this screen is about re-entering a lock, not a login. Used
// both large (the top tile) and small (the field prefix, matching
// KeyIcon's own 18px there) via the same size prop.
function LockIcon({ size = 24 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M8 11 V7.5 a4 4 0 0 1 8 0 V11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="12" cy="15.2" r="1.4" fill="currentColor" />
        </svg>
    );
}

// What PeriodicSignOutMonitor shows instead of wiping credentials, once a
// screen-lock PIN is set (see SecurityPinSection) — a "fake logout": the
// screen is fully blocked until the right PIN comes back, but nothing is
// actually cleared. Too many wrong guesses falls back to the ORIGINAL
// behavior (performSelfClear) rather than leaving an unlimited-attempt
// lock screen up forever, since a 4-8 digit PIN has too small a space to
// leave genuinely unlimited guesses against.
export default function PinLockScreen({ onUnlock }) {

    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [checking, setChecking] = useState(false);
    const [attempts, setAttempts] = useState(0);

    async function handleSubmit(e) {

        e.preventDefault();
        setChecking(true);
        setError("");

        try {

            const result = await verifyMyPin(pin);

            if (result.valid) {
                onUnlock();
                return;
            }

            setPin("");

            // The server tracks its own attempt count independently of
            // this component's local `attempts` state (see
            // SettingsController.VerifyMyPin) - `locked` means it already
            // hit the limit and cleared this session's credentials itself,
            // which can happen even on this component's very first attempt
            // after a page reload reset `attempts` back to 0 while the
            // server's own counter kept counting. Deferring to the
            // server's answer here is what closes that gap.
            if (result.locked) {
                performSelfClear();
                return;
            }

            const next = attempts + 1;
            setAttempts(next);

            if (next >= MAX_ATTEMPTS) {
                performSelfClear();
                return;
            }

            const remaining = MAX_ATTEMPTS - next;

            setError(
                `Wrong PIN — ${remaining} attempt${remaining === 1 ? "" : "s"} left before this clears ` +
                "your saved credentials instead."
            );

        }
        catch (err) {

            console.error(err);
            setError("Unable to verify that right now — try again.");

        }
        finally {

            setChecking(false);

        }

    }

    // Portalled to document.body (same fix/reasoning as
    // SwitchRepositoryModal's own createPortal use): position:fixed's
    // containing block becomes the nearest transformed/filtered ancestor,
    // not the viewport, if one exists anywhere between this and <body> -
    // mounting straight onto body sidesteps that regardless of whatever
    // this renders underneath (this component can be triggered from any
    // page in the app, so there's no way to audit every possible ancestor
    // for a stray transform/backdrop-filter and trust that staying true).
    return createPortal(

        <div className="dialog-backdrop pin-lock-backdrop" role="presentation">

            <div className="dialog pin-lock-dialog" role="alertdialog" aria-modal="true" aria-labelledby="pin-lock-title">

                <div className="pin-lock-icon">
                    <LockIcon />
                </div>

                <h2 id="pin-lock-title" style={{ textAlign: "center" }}>
                    Locked
                </h2>

                <p className="field-hint" style={{ marginTop: 0, textAlign: "center" }}>
                    Enter your PIN to keep going — your GitHub/AWS/Azure/GCP credentials are
                    untouched, still saved.
                </p>

                <form onSubmit={handleSubmit}>

                    <div className="auth-page-field">
                        <LockIcon size={18} />
                        <input
                            type="password"
                            inputMode="numeric"
                            maxLength={8}
                            className="pin-lock-input"
                            placeholder="PIN"
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                            autoFocus
                            autoComplete="off"
                        />
                    </div>

                    {error && (
                        <p className="field-hint field-hint-bad">{error}</p>
                    )}

                    <button
                        type="submit"
                        className="btn btn-success"
                        style={{ width: "100%", marginTop: "12px" }}
                        disabled={checking || pin.length < 4}
                    >
                        {checking ? "Checking..." : "Unlock"}
                    </button>

                </form>

                <button
                    type="button"
                    className="btn btn-link"
                    style={{ marginTop: "16px" }}
                    onClick={performSelfClear}
                >
                    Forgot your PIN? Clear all saved credentials instead
                </button>

            </div>

        </div>,

        document.body

    );

}
