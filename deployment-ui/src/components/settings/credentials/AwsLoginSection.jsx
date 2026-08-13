import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import ComboBox from "../../common/ComboBox";
import AwsSsoSignIn from "./AwsSsoSignIn";
import useToast from "../../../hooks/useToast";
import { getMyAwsSettings, saveMyAwsSettings, clearMyAwsCredentials } from "../../../services/settingsService";
import AWS_REGIONS from "../../../data/awsRegions";

const EMPTY_FORM = { accessKeyId: "", secretAccessKey: "", region: "", mfaSerialNumber: "", mfaCode: "" };

function getSubmitLabel(saving, mfaCode) {

    if (saving) return "Signing in...";
    return mfaCode ? "Verify Code & Sign In" : "Save AWS Credentials";

}

function MfaStatusBadge({ status }) {

    if (!status?.mfaEnrolled) return null;

    return status.mfaSessionActive
        ? <span className="badge badge-success">MFA Session Active</span>
        : <span className="badge badge-danger">MFA Session Expired</span>;

}

// The IAM-access-key fallback form — pulled out of AwsLoginSection so its
// own internal conditionals (missingSerialForCode, status?.configured)
// don't count toward that component's cognitive complexity too.
function AwsAccessKeyForm({ form, setForm, status, saving, missingSerialForCode, onSave, onClear }) {

    return (

        <form onSubmit={onSave} style={{ marginTop: "16px" }}>

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
                <ComboBox
                    options={AWS_REGIONS}
                    value={form.region}
                    onChange={(region) => setForm({ ...form, region })}
                    placeholder={status?.region ? `Leave blank to keep "${status.region}"` : "us-east-1"}
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
                    {getSubmitLabel(saving, form.mfaCode)}
                </button>

                {status?.configured && (

                    <button type="button" className="btn btn-danger" onClick={onClear}>
                        Clear Credentials
                    </button>

                )}

            </div>

        </form>

    );

}

// Session-scoped (see PortalIdentity) — same isolation as your GitHub
// token, kept only for this browser. Also powers the Environments page's
// live AWS ECS/ECR status panel, which reads the exact same saved
// credentials — entering them once here covers both.
//
// Two ways in: "Sign in with AWS" (AwsSsoSignIn, below) is the real thing
// for orgs on IAM Identity Center — your username/password/MFA happen on
// AWS's own page, never here. The access key + optional MFA-code form
// further down is the fallback for a plain IAM user with no SSO.
export default function AwsLoginSection() {

    const toast = useToast();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [showAccessKeyForm, setShowAccessKeyForm] = useState(false);

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
    const ssoSessionExpired = !loading && status?.requiresSsoSignIn;

    // Fully configured with nothing needing attention - the state the
    // screenshot that prompted this showed: signed in, yet both entry
    // forms still sat wide open for editing, one accidental keystroke away
    // from overwriting a working setup. mfaSessionExpired/ssoSessionExpired
    // are deliberately excluded - those need the form to stay reachable to
    // refresh the session, not blocked behind an extra clear step.
    const isLockedIn = !loading && status?.configured && !mfaSessionExpired && !ssoSessionExpired;

    return (

        <>

        <div className="settings-subsection">

            <h3 className="settings-subhead">
                AWS
                {" "}
                {!loading && status?.configured && (
                    <span className="badge badge-success">Configured</span>
                )}
                {" "}
                {!loading && status?.isSsoSession && (
                    <span className="badge badge-success">
                        SSO: {status.ssoAccountName} / {status.ssoRoleName}
                    </span>
                )}
                {" "}
                {!loading && <MfaStatusBadge status={status} />}
            </h3>

            {/* SSO sessions already show account/role via the badge above -
                this only fires for the plain access-key path, where nothing
                else on screen says which IAM user the key actually belongs
                to (resolved server-side via STS GetCallerIdentity). */}
            {!loading && status?.identityLabel && !status?.isSsoSession && (
                <p className="field-hint field-hint-good">
                    Signed in as: <strong>{status.identityLabel}</strong>
                </p>
            )}

            {ssoSessionExpired && (
                <p className="error-message">
                    Your AWS SSO session expired — sign in again below.
                </p>
            )}

        </div>

        {isLockedIn ? (

            <div className="settings-subsection">

                <p className="field-hint" style={{ marginTop: 0 }}>
                    AWS is already configured for this session. Clear it below before
                    entering different credentials — this avoids partially overwriting a
                    setup that's currently working.
                </p>

                <button type="button" className="btn btn-danger" onClick={handleClear}>
                    Clear AWS Credentials
                </button>

            </div>

        ) : (

            <>

            <div className="settings-subsection">

                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowAccessKeyForm((v) => !v)}
                >
                    {showAccessKeyForm ? "Hide" : "Use an IAM access key instead"}
                </button>

                {mfaSessionExpired && (
                    <p className="error-message" style={{ marginTop: "12px" }}>
                        MFA session expired — enter a fresh code below.
                    </p>
                )}

                {showAccessKeyForm && (

                    loading ? (

                        <p className="field-hint">Loading...</p>

                    ) : (

                        <AwsAccessKeyForm
                            form={form}
                            setForm={setForm}
                            status={status}
                            saving={saving}
                            missingSerialForCode={missingSerialForCode}
                            onSave={handleSave}
                            onClear={handleClear}
                        />

                    )

                )}

            </div>

            <AwsSsoSignIn onConnected={refresh} />

            </>

        )}

        </>

    );

}
