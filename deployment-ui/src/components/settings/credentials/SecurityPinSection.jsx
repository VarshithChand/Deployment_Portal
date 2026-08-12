import { useEffect, useState } from "react";

import useToast from "../../../hooks/useToast";
import useAuth from "../../../hooks/useAuth";
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

    async function handleClear() {

        try {

            await clearMyPin();
            toast.show("Screen-lock PIN removed — the 10-minute idle prompt will clear your credentials again, same as before.", "success");
            refresh();
            refreshOauthStatus();

        }
        catch (err) {

            console.error(err);
            toast.show("Unable to remove PIN.", "error");

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

                        {status?.configured && (

                            <button type="button" className="btn btn-danger" onClick={handleClear}>
                                Remove PIN
                            </button>

                        )}

                    </div>

                </form>

            )}

        </div>

    );

}
