import { useState } from "react";

import { verifyMyPin } from "../services/settingsService";
import performSelfClear from "../utils/performSelfClear";

const MAX_ATTEMPTS = 5;

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

    return (

        <div className="dialog-backdrop pin-lock-backdrop" role="presentation">

            <div className="dialog pin-lock-dialog" role="alertdialog" aria-modal="true" aria-labelledby="pin-lock-title">

                <h2 id="pin-lock-title">
                    Locked
                </h2>

                <p className="field-hint" style={{ marginTop: 0 }}>
                    Enter your PIN to keep going — your GitHub/AWS/Azure/GCP credentials are
                    untouched, still saved.
                </p>

                <form onSubmit={handleSubmit}>

                    <input
                        type="password"
                        inputMode="numeric"
                        maxLength={8}
                        className="form-control pin-lock-input"
                        placeholder="PIN"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                        autoFocus
                        autoComplete="off"
                    />

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

        </div>

    );

}
