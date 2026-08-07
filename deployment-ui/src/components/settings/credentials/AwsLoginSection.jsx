import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import { getMyAwsSettings, saveMyAwsSettings, clearMyAwsCredentials } from "../../../services/settingsService";

const EMPTY_FORM = { accessKeyId: "", secretAccessKey: "", region: "", mfaSerialNumber: "", mfaCode: "" };

// Session-scoped (see PortalIdentity) — same isolation as your GitHub
// token, kept only for this browser. Also powers the Environments page's
// live AWS ECS/ECR status panel, which reads the exact same saved
// credentials — entering them once here covers both.
//
// AWS has no username/password sign-in API - that only exists for the
// Console web UI. Access Key ID + Secret Access Key are the real API-side
// login; MFA Device + Code below are optional and, when used, are verified
// against AWS itself (via STS) before anything is saved - a wrong code is
// rejected exactly like a failed login, not silently stored.
export default function AwsLoginSection() {

    const toast = useToast();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    function refresh() {

        setLoading(true);

        getMyAwsSettings().then((result) => {
            setStatus(result);
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    // A code with no serial (and no already-enrolled device to fall back
    // on) can never verify - catching that here, before the request even
    // goes out, is what a plain "optional" label failed to make obvious.
    const missingSerialForCode =
        form.mfaCode.length > 0 && !form.mfaSerialNumber && !status?.mfaEnrolled;

    async function handleSave(e) {

        e.preventDefault();

        if (missingSerialForCode) {
            toast.show("Enter the MFA device's serial number (ARN) along with the code.", "error");
            return;
        }

        setSaving(true);

        try {

            const result = await saveMyAwsSettings(form);

            toast.show(
                result.mfaSessionActive
                    ? "AWS MFA code verified — session active for the next 12 hours."
                    : "AWS credentials saved for this session.",
                "success"
            );

            setForm(EMPTY_FORM);
            refresh();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save AWS credentials.", "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClear() {

        try {

            await clearMyAwsCredentials();
            toast.show("AWS credentials cleared.", "success");
            refresh();

        }
        catch (err) {

            console.error(err);
            toast.show("Unable to clear AWS credentials.", "error");

        }

    }

    const mfaSessionExpired = !loading && status?.mfaEnrolled && !status?.mfaSessionActive;

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">
                AWS
                {" "}
                {!loading && status?.configured && (
                    <span className="badge badge-success">Configured</span>
                )}
                {" "}
                {!loading && status?.mfaEnrolled && (
                    status.mfaSessionActive
                        ? <span className="badge badge-success">MFA Session Active</span>
                        : <span className="badge badge-danger">MFA Session Expired</span>
                )}
            </h3>

            {mfaSessionExpired && (
                <p className="error-message">
                    MFA session expired — enter a fresh code below.
                </p>
            )}

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : (

                <form onSubmit={handleSave}>

                    <div className="form-group">
                        <label>Access Key ID</label>
                        <ClearableInput
                            placeholder={status?.configured ? "Leave blank to keep current key" : ""}
                            value={form.accessKeyId}
                            onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })}
                            onClear={() => setForm({ ...form, accessKeyId: "" })}
                            autoComplete="off"
                            name="aws-access-key-id"
                        />
                    </div>

                    <div className="form-group">
                        <label>Secret Access Key</label>
                        <ClearableInput
                            type="password"
                            placeholder={status?.configured ? "Leave blank to keep current secret" : ""}
                            value={form.secretAccessKey}
                            onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })}
                            onClear={() => setForm({ ...form, secretAccessKey: "" })}
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="form-group">
                        <label>Region</label>
                        <ClearableInput
                            placeholder={status?.region ? `Leave blank to keep "${status.region}"` : "us-east-1"}
                            value={form.region}
                            onChange={(e) => setForm({ ...form, region: e.target.value })}
                            onClear={() => setForm({ ...form, region: "" })}
                            autoComplete="off"
                            name="aws-region"
                        />
                    </div>

                    <div className="form-group">
                        <label>
                            MFA Serial Number (ARN)
                            {" "}
                            <a
                                href="https://console.aws.amazon.com/iam/home#/security_credentials"
                                target="_blank"
                                rel="noreferrer"
                                className="token-help-link"
                            >
                                Find it →
                            </a>
                        </label>
                        <ClearableInput
                            placeholder="arn:aws:iam::123456789012:mfa/your-username"
                            value={form.mfaSerialNumber}
                            onChange={(e) => setForm({ ...form, mfaSerialNumber: e.target.value })}
                            onClear={() => setForm({ ...form, mfaSerialNumber: "" })}
                            autoComplete="off"
                            name="aws-mfa-serial"
                        />
                    </div>

                    <div className="form-group">
                        <label>MFA Code (6 digits)</label>
                        <ClearableInput
                            placeholder="123456"
                            inputMode="numeric"
                            maxLength={6}
                            value={form.mfaCode}
                            onChange={(e) => setForm({ ...form, mfaCode: e.target.value.replace(/\D/g, "") })}
                            onClear={() => setForm({ ...form, mfaCode: "" })}
                            autoComplete="off"
                            name="aws-mfa-code"
                        />
                        {missingSerialForCode && (
                            <p className="field-hint field-hint-bad" style={{ marginTop: "4px" }}>
                                Enter the serial number above too.
                            </p>
                        )}
                    </div>

                    <div className="button-row">

                        <button type="submit" className="btn btn-primary" disabled={saving || missingSerialForCode}>
                            {saving
                                ? "Signing in..."
                                : form.mfaCode
                                    ? "Verify Code & Sign In"
                                    : "Save AWS Credentials"}
                        </button>

                        {status?.configured && (

                            <button type="button" className="btn btn-danger" onClick={handleClear}>
                                Clear Credentials
                            </button>

                        )}

                    </div>

                </form>

            )}

        </div>

    );

}
