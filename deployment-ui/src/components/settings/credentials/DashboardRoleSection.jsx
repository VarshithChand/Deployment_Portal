import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import {
    getObservabilityConfig, saveObservabilityConfig,
    getObservabilityCredentialStatus, saveObservabilityCredentials, clearObservabilityCredentials
} from "../../../services/hostingObservabilityService";

const EMPTY_FORM = { token: "", accountId: "" };

function roleForProvider(targets, provider) {

    if (targets.frontendProvider === provider) return "frontend";
    if (targets.backendProvider === provider) return "backend";
    if (targets.databaseProvider === provider) return "database";

    return "none";

}

// Reassigning this provider to a new role (or to "none") only ever touches
// the role slot(s) it's currently in and the one it's moving to - whichever
// OTHER provider previously held the target role is left with no matching
// field left in `targets` afterwards, which is exactly "unassigned" (see
// roleForProvider above), no explicit clearing needed for it.
function applyRole(targets, provider, role) {

    const next = { ...targets };

    ["frontend", "backend", "database"].forEach((r) => {

        if (next[`${r}Provider`] === provider) {
            next[`${r}Provider`] = "";
            next[`${r}ServiceId`] = "";
        }

    });

    if (role !== "none") {
        next[`${role}Provider`] = provider;
        next[`${role}ServiceId`] = "";
    }

    return next;

}

// Lets a super-admin assign this ONE provider's role in the Hosting
// Providers dashboard (Frontend/Backend/Database/Not used) and connect its
// portal-wide credential, right here on Credentials next to the provider
// they're already looking at - instead of a separate trip to Settings ->
// Hosting Observability (which still exists, for reviewing all 3 roles at
// once, and reads/writes this exact same PortalDeploymentTargetsDto/
// PortalPaasCredentials data, so the two stay in sync automatically).
// Only rendered for isSuperAdminSession - the backend enforces the same
// restriction on every api/observability/* call regardless.
export default function DashboardRoleSection({ provider, label, hasAccountId }) {

    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [targets, setTargets] = useState(null);
    const [status, setStatus] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    function load() {

        setLoading(true);

        Promise.all([
            getObservabilityConfig(),
            getObservabilityCredentialStatus(provider).catch(() => null)
        ]).then(([config, providerStatus]) => {

            setTargets(config.targets || {});
            setStatus(providerStatus);
            setLoading(false);

        }).catch((err) => {

            console.error(err);
            setLoading(false);

        });

    }

    useEffect(load, [provider]);

    async function handleRoleChange(role) {

        const next = applyRole(targets, provider, role);
        setTargets(next);

        try {
            await saveObservabilityConfig(next);
            toast.show(
                role === "none"
                    ? `${label} is no longer used by the Hosting Providers dashboard.`
                    : `${label} set as the dashboard's ${role} target.`,
                "success"
            );
        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save the dashboard target.", "error");
        }

    }

    async function handleServiceIdChange(role, serviceId) {

        const next = { ...targets, [`${role}ServiceId`]: serviceId };
        setTargets(next);

        try {
            await saveObservabilityConfig(next);
        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save the dashboard target.", "error");
        }

    }

    async function handleSaveCredential(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await saveObservabilityCredentials(provider, form);
            toast.show(`Portal-wide ${label} credentials saved.`, "success");
            setForm(EMPTY_FORM);
            load();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Unable to save ${label} credentials.`, "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClearCredential() {

        try {

            await clearObservabilityCredentials(provider);
            toast.show(`Portal-wide ${label} credentials cleared.`, "success");
            load();

        }
        catch (err) {

            console.error(err);
            toast.show(`Unable to clear ${label} credentials.`, "error");

        }

    }

    if (loading || !targets) {
        return <p className="field-hint">Loading dashboard role...</p>;
    }

    const role = roleForProvider(targets, provider);
    const configured = !!status?.configured;
    const hasLiveList = status?.configured && status?.found && status.services?.length > 0;
    const serviceId = role === "none" ? "" : targets[`${role}ServiceId`] || "";

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">Hosting Providers Dashboard</h3>

            <p className="field-hint" style={{ marginBottom: "12px" }}>
                Assign {label} to one of the dashboard's 3 roles — a portal-wide setting shown
                the same way to every visitor of Hosting Providers, separate from your own
                connection above.
            </p>

            <div className="form-group">

                <label>Use {label} as</label>

                <select className="form-control" value={role} onChange={(e) => handleRoleChange(e.target.value)}>
                    <option value="none">Not used</option>
                    <option value="frontend">Frontend</option>
                    <option value="backend">Backend</option>
                    <option value="database">Database (only meaningful for a Render-managed database)</option>
                </select>

            </div>

            {role !== "none" && (

                <div className="form-group">

                    <label>Service</label>

                    {hasLiveList ? (

                        <select
                            className="form-control"
                            value={serviceId}
                            onChange={(e) => handleServiceIdChange(role, e.target.value)}
                        >
                            <option value="">Select a service…</option>
                            {status.services.map((s) => (
                                <option key={s.id || s.name} value={s.id || s.name}>{s.name}</option>
                            ))}
                        </select>

                    ) : (

                        <input
                            className="form-control"
                            placeholder="Service/site id"
                            value={serviceId}
                            onChange={(e) => handleServiceIdChange(role, e.target.value)}
                        />

                    )}

                    {!hasLiveList && (
                        <p className="field-hint">
                            {configured
                                ? "Unable to reach this provider with the portal-wide credential below right now."
                                : "Save the portal-wide credential below to pick from a live list instead of typing an id."}
                        </p>
                    )}

                </div>

            )}

            {role !== "none" && (

                <>

                <h4 style={{ margin: "16px 0 8px" }}>
                    Portal-Wide {label} Credential
                    {" "}
                    {configured && (
                        <span className={`badge ${status.found ? "badge-success" : "badge-warning"}`}>
                            {status.found ? "Connected" : "Configured"}
                        </span>
                    )}
                </h4>

                {configured && !status.found && (
                    <p className="error-message">{status.error || `Unable to reach ${label}.`}</p>
                )}

                <p className="field-hint" style={{ marginBottom: "10px" }}>
                    Used only by the dashboard — separate from your own {label} connection above,
                    never sent to the browser once saved.
                </p>

                <form onSubmit={handleSaveCredential}>

                    <div className="form-group">
                        <label>API Token</label>
                        <ClearableInput
                            type="password"
                            placeholder={configured ? "Leave blank to keep current token" : ""}
                            value={form.token}
                            onChange={(e) => setForm({ ...form, token: e.target.value })}
                            onClear={() => setForm({ ...form, token: "" })}
                            autoComplete="new-password"
                        />
                    </div>

                    {hasAccountId && (

                        <div className="form-group">
                            <label>Account ID</label>
                            <ClearableInput
                                placeholder={configured ? "Leave blank to keep current Account ID" : ""}
                                value={form.accountId}
                                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                                onClear={() => setForm({ ...form, accountId: "" })}
                                autoComplete="off"
                            />
                        </div>

                    )}

                    <div className="button-row">

                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? "Saving..." : `Save Portal-Wide ${label} Credentials`}
                        </button>

                        {configured && (
                            <button type="button" className="btn btn-danger" onClick={handleClearCredential}>
                                Clear Credentials
                            </button>
                        )}

                    </div>

                </form>

                </>

            )}

        </div>

    );

}
