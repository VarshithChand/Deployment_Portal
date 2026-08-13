import { useState } from "react";

import useAuth from "../../../hooks/useAuth";
import { unlockMyCredential } from "../../../services/settingsService";
import performSelfClear from "../../../utils/performSelfClear";

const MAX_ATTEMPTS = 5;

// Per-credential counterpart to PinLockScreen — same screen-lock PIN, same
// 5-wrong-attempts-wipes-everything behavior (see UnlockMyCredential on the
// backend). One correct PIN entry here unlocks every gated provider at
// once (CredentialGate.AllProviders on the backend), not just the tab that
// happened to prompt - `onUnlocked` is CredentialsView's markAllUnlocked,
// not a per-provider callback. Skips the prompt entirely when no
// screen-lock PIN is set at all (pinConfigured is false) - Screen Lock is
// opt-in, and this rides on top of it rather than becoming a second,
// separate "must set a PIN to use this app" requirement. `unlocked`/
// `onUnlocked` are lifted to CredentialsView so switching tabs and back
// doesn't re-prompt once any provider has been unlocked this visit.
export default function CredentialPinGate({ provider, unlocked, onUnlocked, children }) {

    const { pinConfigured } = useAuth();

    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [checking, setChecking] = useState(false);
    const [attempts, setAttempts] = useState(0);

    if (!pinConfigured || unlocked) {
        return children;
    }

    async function handleSubmit(e) {

        e.preventDefault();
        setChecking(true);
        setError("");

        try {

            const result = await unlockMyCredential(provider, pin);

            if (result.valid) {
                onUnlocked();
                return;
            }

            setPin("");

            // Same reasoning as PinLockScreen - the server's own attempt
            // counter (shared with the portal-wide PIN, see
            // SettingsController.UnlockMyCredential) is authoritative, so a
            // `locked` response is honored even on this component's first
            // local attempt.
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

        <div className="settings-subsection">

            <h3 className="settings-subhead">Locked</h3>

            <p className="field-hint" style={{ marginTop: 0 }}>
                Enter your screen-lock PIN to manage this credential.
            </p>

            <form onSubmit={handleSubmit}>

                <div className="form-group">
                    <input
                        type="password"
                        inputMode="numeric"
                        maxLength={8}
                        className="form-control"
                        placeholder="PIN"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                        autoComplete="off"
                    />
                </div>

                {error && (
                    <p className="field-hint field-hint-bad">{error}</p>
                )}

                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={checking || pin.length < 4}
                >
                    {checking ? "Checking..." : "Unlock"}
                </button>

            </form>

        </div>

    );

}
