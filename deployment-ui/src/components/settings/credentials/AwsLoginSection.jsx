import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import { getMyAwsSettings, saveMyAwsSettings, clearMyAwsCredentials } from "../../../services/settingsService";

const EMPTY_FORM = { accessKeyId: "", secretAccessKey: "", region: "" };

// Session-scoped (see PortalIdentity) — same isolation as your GitHub
// token, kept only for this browser. Also powers the Environments page's
// live AWS ECS/ECR status panel, which reads the exact same saved
// credentials — entering them once here covers both.
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

    async function handleSave(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await saveMyAwsSettings(form);
            toast.show("AWS credentials saved for this session.", "success");
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

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">
                AWS
                {" "}
                {!loading && status?.configured && (
                    <span className="badge badge-success">Configured</span>
                )}
            </h3>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Powers the Environments page's live ECS service and ECR image status. An IAM
                user's access key with read access to ECS/ECR is enough — never sent anywhere
                except this backend's own AWS calls made on your behalf.
            </p>

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

                    <div className="button-row">

                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? "Saving..." : "Save AWS Credentials"}
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
