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

    // Removing the PIN also turns off idle-timeout protection for your
    // saved credentials (see the copy below), so - when this session's
    // GitHub identity has MFA enabled - the backend requires a fresh code
    // before it takes effect (same requirement disabling MFA itself
    // already has). The first click tries with no code; a 403
    // "MFA_REQUIRED" is what reveals this inline form rather than
    // showing it unconditionally, since most sessions won't have MFA
    // enabled at all and the field would just be noise.
    const [showRemoveMfa, setShowRemoveMfa] = useState(false);
    const [removeCode, setRemoveCode] = useState("");
    const [removeRecoveryCode, setRemoveRecoveryCode] = useState("");
    const [removing, setRemoving] = useState(false);
    const [lockedUntilUtc, setLockedUntilUtc] = useState(null);
    const { isLocked, formatted: lockoutFormatted } = useLockoutCountdown(lockedUntilUtc);

    function refresh() {

        setLoading(true);

        getMyPinStatus()
            .then((result) => setStatus(result))
            .finally(() => setLoading(false));

    }

    useEffect(refresh, []);

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

            await saveMyPin(form.pin);
            toast.show("Screen-lock PIN saved — the 10-minute idle prompt will lock instead of clearing your credentials.", "success");
            setForm(EMPTY_FORM);
            refresh();
            refreshOauthStatus();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save PIN.", "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClear(e) {

        e?.preventDefault();
        setRemoving(true);

        try {

            await clearMyPin({ code: removeCode, recoveryCode: removeRecoveryCode });

            toast.show("Screen-lock PIN removed — the 10-minute idle prompt will clear your credentials again, same as before.", "success");
            setShowRemoveMfa(false);
            setRemoveCode("");
            setRemoveRecoveryCode("");
            setLockedUntilUtc(null);
            refresh();
            refreshOauthStatus();

        }
        catch (err) {

            if (err.response?.data?.code === "MFA_REQUIRED") {
                setShowRemoveMfa(true);
                return;
            }

            console.error(err);
            setRemoveCode("");
            setRemoveRecoveryCode("");

            if (err.response?.data?.code === "MFA_LOCKED") {
                setLockedUntilUtc(err.response.data.lockedUntilUtc);
            }
            else {
                toast.show(err.response?.data?.message || "Unable to remove PIN.", "error");
            }

        }
        finally {

            setRemoving(false);

        }

    }

    function cancelRemove() {
        setShowRemoveMfa(false);
        setRemoveCode("");
        setRemoveRecoveryCode("");
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

                <form onSubmit={handleSave}>

                    <div className="form-group">
                        <label>{status?.configured ? "New PIN" : "PIN"} (4–8 digits)</label>
                        <input
                            type="password"
                            inputMode="numeric"
                            maxLength={8}
                            className="form-control"
                            value={form.pin}
                            onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="form-group">
                        <label>Confirm PIN</label>
                        <input
                            type="password"
                            inputMode="numeric"
                            maxLength={8}
                            className="form-control"
                            value={form.confirmPin}
                            onChange={(e) => setForm({ ...form, confirmPin: e.target.value.replace(/\D/g, "") })}
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="button-row">

                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? "Saving..." : status?.configured ? "Change PIN" : "Set PIN"}
                        </button>

                        {status?.configured && !showRemoveMfa && (

                            <button type="button" className="btn btn-danger" onClick={handleClear} disabled={removing}>
                                {removing ? "Removing..." : "Remove PIN"}
                            </button>

                        )}

                    </div>

                </form>

            )}

            {showRemoveMfa && (

                <form onSubmit={handleClear} style={{ marginTop: "16px" }}>

                    <p className="field-hint field-hint-bad" style={{ marginTop: 0 }}>
                        Removing the PIN also turns off idle-timeout protection for your saved
                        credentials — enter your authenticator code to confirm.
                    </p>

                    <div className="form-group">
                        <label>6-digit code</label>
                        <input
                            className="form-control"
                            inputMode="numeric"
                            maxLength={6}
                            value={removeCode}
                            onChange={(e) => setRemoveCode(e.target.value.replace(/\D/g, ""))}
                            autoComplete="off"
                            disabled={isLocked}
                        />
                    </div>

                    <div className="form-group">
                        <label>Or a recovery code</label>
                        <input
                            className="form-control"
                            value={removeRecoveryCode}
                            onChange={(e) => setRemoveRecoveryCode(e.target.value.trim())}
                            autoComplete="off"
                            disabled={isLocked}
                        />
                    </div>

                    {isLocked && (
                        <p className="field-hint field-hint-bad">Too many wrong codes — try again in {lockoutFormatted}.</p>
                    )}

                    <div className="button-row">

                        <button
                            type="submit"
                            className="btn btn-danger"
                            disabled={removing || isLocked || (!removeCode && !removeRecoveryCode)}
                        >
                            {removing ? "Removing..." : "Confirm Remove PIN"}
                        </button>

                        <button type="button" className="btn" onClick={cancelRemove} disabled={removing}>
                            Cancel
                        </button>

                    </div>

                </form>

            )}

        </div>

    );

}
