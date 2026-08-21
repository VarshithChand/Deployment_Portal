import { useEffect, useState } from "react";

import useToast from "../../../hooks/useToast";
import useAuth from "../../../hooks/useAuth";
import useLockoutCountdown from "../../../hooks/useLockoutCountdown";
import { getMyPinStatus, saveMyPin, clearMyPin } from "../../../services/settingsService";

const EMPTY_FORM = { pin: "", confirmPin: "" };

// Session-scoped like AWS/Azure/GCP/API Key above — this is what
// PeriodicSignOutMonitor's 10-minute idle prompt checks for: set a PIN
// here and that prompt locks the screen instead of wiping GitHub/AWS/
// Azure/GCP credentials the way it always used to. Leave this unset and
// nothing changes — the original wipe-everything behavior is still
// exactly what happens.
export default function SecurityPinSection() {

    const toast = useToast();
    const { refreshOauthStatus } = useAuth();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [removing, setRemoving] = useState(false);

    // Setting/changing AND removing the PIN both require a fresh MFA code
    // when this session's GitHub identity has MFA enabled (a no-op
    // otherwise - see SettingsController.DenyUnlessPinActionVerifiedAsync).
    // Deliberately no recovery-code field on either - unlike Disable MFA,
    // neither of these is a "lost my phone, last resort" action, so a live
    // code is required outright. `mfaAction` tracks WHICH action is
    // currently waiting on a code ("save" | "remove" | null) since only
    // one can be in flight at a time; the lockout itself is shared between
    // them (same per-login cooldown either way).
    const [mfaAction, setMfaAction] = useState(null);
    const [mfaCode, setMfaCode] = useState("");
    const [lockedUntilUtc, setLockedUntilUtc] = useState(null);
    const { isLocked, formatted: lockoutFormatted } = useLockoutCountdown(lockedUntilUtc);

    function refresh() {

        setLoading(true);

        getMyPinStatus()
            .then((result) => setStatus(result))
            .finally(() => setLoading(false));

    }

    useEffect(refresh, []);

    function cancelMfa() {
        setMfaAction(null);
        setMfaCode("");
    }

    function handleMfaError(err) {

        if (err.response?.data?.code === "MFA_LOCKED") {
            setLockedUntilUtc(err.response.data.lockedUntilUtc);
            return true;
        }

        return false;

    }

    async function handleSave(e) {

        e.preventDefault();

        if (form.pin !== form.confirmPin) {
            toast.show("PINs don't match.", "error");
            return;
        }

        if (!/^\d{4,8}$/.test(form.pin)) {
            toast.show("PIN must be 4 to 8 digits.", "error");
            return;
        }

        setSaving(true);

        try {

            await saveMyPin(form.pin, mfaCode);

            toast.show("Screen-lock PIN saved — the 10-minute idle prompt will lock instead of clearing your credentials.", "success");
            setForm(EMPTY_FORM);
            cancelMfa();
            setLockedUntilUtc(null);
            refresh();
            refreshOauthStatus();

        }
        catch (err) {

            if (err.response?.data?.code === "MFA_REQUIRED") {
                setMfaAction("save");
                return;
            }

            console.error(err);
            setMfaCode("");

            if (!handleMfaError(err)) {
                toast.show(err.response?.data?.message || "Unable to save PIN.", "error");
            }

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClear(e) {

        e?.preventDefault();
        setRemoving(true);

        try {

            await clearMyPin(mfaCode);

            toast.show("Screen-lock PIN removed — the 10-minute idle prompt will clear your credentials again, same as before.", "success");
            cancelMfa();
            setLockedUntilUtc(null);
            refresh();
            refreshOauthStatus();

        }
        catch (err) {

            if (err.response?.data?.code === "MFA_REQUIRED") {
                setMfaAction("remove");
                return;
            }

            console.error(err);
            setMfaCode("");

            if (!handleMfaError(err)) {
                toast.show(err.response?.data?.message || "Unable to remove PIN.", "error");
            }

        }
        finally {

            setRemoving(false);

        }

    }

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">
                Screen Lock
                {" "}
                {!loading && status?.configured && (
                    <span className="badge badge-success">PIN set</span>
                )}
            </h3>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                {status?.configured
                    ? "The 10-minute idle prompt locks the screen and asks for this PIN instead of clearing your saved credentials — set a new one below to change it, or remove it to go back to the original clear-everything behavior."
                    : "Without a PIN, the 10-minute idle prompt clears your GitHub/AWS/Azure/GCP credentials, same as it always has. Set a PIN here to lock the screen instead — your credentials stay saved, you just re-enter this PIN to keep going."}
            </p>

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : (

                <form onSubmit={mfaAction === "remove" ? handleClear : handleSave}>

                    <div className="form-group">
                        <label htmlFor="security-pin">{status?.configured ? "New PIN" : "PIN"} (4–8 digits)</label>
                        <input
                            id="security-pin"
                            type="password"
                            inputMode="numeric"
                            maxLength={8}
                            className="form-control"
                            value={form.pin}
                            onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
                            autoComplete="new-password"
                            disabled={mfaAction === "remove"}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="security-pin-confirm">Confirm PIN</label>
                        <input
                            id="security-pin-confirm"
                            type="password"
                            inputMode="numeric"
                            maxLength={8}
                            className="form-control"
                            value={form.confirmPin}
                            onChange={(e) => setForm({ ...form, confirmPin: e.target.value.replace(/\D/g, "") })}
                            autoComplete="new-password"
                            disabled={mfaAction === "remove"}
                        />
                    </div>

                    {mfaAction && (

                        <div className="form-group">

                            <label htmlFor="security-pin-mfa-code">6-digit authenticator code</label>
                            <input
                                id="security-pin-mfa-code"
                                className="form-control"
                                inputMode="numeric"
                                maxLength={6}
                                value={mfaCode}
                                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                                autoComplete="off"
                                autoFocus
                                disabled={isLocked}
                            />

                            {isLocked && (
                                <p className="field-hint field-hint-bad">Too many wrong codes — try again in {lockoutFormatted}.</p>
                            )}

                        </div>

                    )}

                    <div className="button-row">

                        {mfaAction === "remove" ? (

                            <>
                                <button type="submit" className="btn btn-danger" disabled={removing || isLocked || !mfaCode}>
                                    {removing ? "Removing..." : "Confirm Remove PIN"}
                                </button>
                                <button type="button" className="btn" onClick={cancelMfa} disabled={removing}>
                                    Cancel
                                </button>
                            </>

                        ) : (

                            <>

                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={saving || isLocked || (mfaAction === "save" && !mfaCode)}
                                >
                                    {saving
                                        ? "Saving..."
                                        : mfaAction === "save"
                                            ? "Confirm Code"
                                            : status?.configured ? "Change PIN" : "Set PIN"}
                                </button>

                                {mfaAction === "save" ? (
                                    <button type="button" className="btn" onClick={cancelMfa} disabled={saving}>
                                        Cancel
                                    </button>
                                ) : status?.configured && (
                                    <button type="button" className="btn btn-danger" onClick={handleClear} disabled={removing}>
                                        {removing ? "Removing..." : "Remove PIN"}
                                    </button>
                                )}

                            </>

                        )}

                    </div>

                </form>

            )}

        </div>

    );

}
