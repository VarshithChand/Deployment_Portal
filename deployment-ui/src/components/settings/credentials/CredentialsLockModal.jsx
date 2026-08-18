import { useState } from "react";
import { createPortal } from "react-dom";

import { unlockMyCredential } from "../../../services/settingsService";
import performSelfClear from "../../../utils/performSelfClear";

const MAX_ATTEMPTS = 5;

// Same padlock glyph PinLockScreen.jsx already draws for the portal-wide
// idle lock - duplicated locally rather than imported, matching that
// file's own precedent (a tiny hand-drawn SVG local to the one screen that
// needs this exact look, not centralized). Coordinates shifted up 1.75
// units from a naive "rect at y=11" layout - see PinLockScreen.jsx's own
// copy of this comment for why the glyph itself (not its container) needed
// recentring within its 24-unit viewBox.
function LockIcon({ size = 24 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="5" y="9.25" width="14" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M8 9.25 V5.75 a4 4 0 0 1 8 0 V9.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="12" cy="13.45" r="1.4" fill="currentColor" />
        </svg>
    );
}

// Whole-Credentials-page lock popup, shown on open whenever a screen-lock
// PIN is set (see CredentialsView's showLockModal). Deliberately NOT the
// real security boundary - every individual credential form below is
// already wrapped in its own CredentialPinGate regardless of whether this
// modal was ever shown, so this exists purely so a visitor doesn't have to
// click into a tab just to be asked for the PIN they'd have to enter
// anyway; unlocking here (like unlocking any one CredentialPinGate)
// satisfies every other gate on the page at once, via the same
// unlockMyCredential call and the same server-side "grant every provider
// together" behavior (CredentialGate.AllProviders).
//
// Same 5-wrong-attempts-wipes-everything behavior as PinLockScreen/
// CredentialPinGate (the server's own attempt counter is shared across all
// three entry points, not reset per-component) - "Forgot your PIN?" here
// is different from those two though: instead of the destructive
// self-clear, it jumps straight to the Screen Lock tab, where
// SecurityPinSection already lets you set a brand new PIN using only an
// MFA code (no need to know the old one) - a real recovery path, not a
// wipe-and-start-over one.
export default function CredentialsLockModal({ onUnlock, onForgotPin }) {

    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [checking, setChecking] = useState(false);
    const [attempts, setAttempts] = useState(0);

    async function handleSubmit(e) {

        e.preventDefault();
        setChecking(true);
        setError("");

        try {

            // The provider string here doesn't matter for what gets
            // unlocked - see UnlockMyCredential granting every provider in
            // CredentialGate.AllProviders together regardless of which one
            // was requested - "github" is just a real, always-valid key.
            const result = await unlockMyCredential("github", pin);

            if (result.valid) {
                onUnlock();
                return;
            }

            setPin("");

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

    // Portalled to document.body - same reasoning as PinLockScreen/
    // SwitchRepositoryModal's own createPortal use (position:fixed's
    // containing block becomes the nearest transformed/filtered ancestor,
    // not the viewport, if one exists between this and <body>).
    return createPortal(

        <div className="dialog-backdrop pin-lock-backdrop" role="presentation">

            <div className="dialog pin-lock-dialog" role="alertdialog" aria-modal="true" aria-labelledby="credentials-lock-title">

                <div className="pin-lock-icon">
                    <LockIcon />
                </div>

                <h2 id="credentials-lock-title" style={{ textAlign: "center" }}>
                    Credentials Locked
                </h2>

                <p className="field-hint" style={{ marginTop: 0, textAlign: "center" }}>
                    Enter your screen-lock PIN to view or manage saved credentials.
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
                    onClick={onForgotPin}
                >
                    Forgot your PIN? Set a new one in Screen Lock settings
                </button>

            </div>

        </div>,

        document.body

    );

}
