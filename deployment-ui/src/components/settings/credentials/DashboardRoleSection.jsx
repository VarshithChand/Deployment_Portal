import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import {
    getObservabilityConfig, saveObservabilityConfig,
    getObservabilityCredentialStatus, saveObservabilityCredentials, clearObservabilityCredentials,
    getRenderDatabases
} from "../../../services/hostingObservabilityService";

const EMPTY_FORM = { token: "", accountId: "" };

const ROLES = [
    { key: "frontend", label: "Frontend" },
    { key: "backend", label: "Backend" },
    { key: "database", label: "Database (only meaningful for a Render-managed database)" }
];

// Toggling ONE role only ever touches that role's provider/serviceId
// fields - it deliberately does NOT clear this provider's OTHER roles,
// since a single provider can legitimately fill more than one role at
// once (the common case: Render hosting both the backend web service AND
// a separate Render Postgres resource - Backend and Database both
// "render", two different ServiceIds). Checking a role that's currently
// held by a DIFFERENT provider simply displaces it - that provider no
// longer has a matching field afterwards, which is exactly "unassigned".
function toggleRole(targets, provider, role, active) {

    const next = { ...targets };

    if (active) {
        next[`${role}Provider`] = provider;
        next[`${role}ServiceId`] = "";
    }
    else if (next[`${role}Provider`] === provider) {
        next[`${role}Provider`] = "";
        next[`${role}ServiceId`] = "";
    }

    return next;

}

// Lets a super-admin assign this ONE provider to any combination of the
// Hosting Providers dashboard's 3 roles (Frontend/Backend/Database - a
// provider can hold more than one, e.g. Render as both Backend and
// Database) and connect its portal-wide credential, right here on
// Credentials next to the provider they're already looking at - instead
// of a separate trip to Settings -> Hosting Observability (which still
// exists, for reviewing all 3 roles at once, and reads/writes this exact
// same PortalDeploymentTargetsDto/PortalPaasCredentials data, so the two
// stay in sync automatically). Only rendered for isSuperAdminSession -
// the backend enforces the same restriction on every api/observability/*
// call regardless.
//
// Note: the Database role here only controls the OPTIONAL CPU/Memory/
// Storage graph linkage (Render's Metrics API against a Postgres
// resource) - the Database tab's health/size/tables/connection-pool
// always come straight from DATABASE_URL and need no connection step at
// all, on this page or anywhere else.
export default function DashboardRoleSection({ provider, label, hasAccountId }) {

    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [targets, setTargets] = useState(null);
    const [status, setStatus] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    // The Database role's service list can't reuse `status` for Render -
    // GetStatusAsync's /v1/services list never includes Postgres instances
    // (a completely separate Render resource type), which is why that
    // dropdown was always empty. Fetched separately, only for provider ===
    // "render", once its portal-wide credential is confirmed configured.
    const [renderDatabaseStatus, setRenderDatabaseStatus] = useState(null);

    function load() {

        setLoading(true);

        Promise.all([
            getObservabilityConfig(),
            getObservabilityCredentialStatus(provider).catch(() => null)
        ]).then(([config, providerStatus]) => {

            setTargets(config.targets || {});
            setStatus(providerStatus);
            setLoading(false);

            if (provider === "render" && providerStatus?.configured) {

                getRenderDatabases().then((data) => {

                    setRenderDatabaseStatus({
                        configured: true,
                        found: true,
                        services: (Array.isArray(data) ? data : []).map((d) => ({ id: d.id, name: `${d.name} — ${d.status}` }))
                    });

                }).catch(() => setRenderDatabaseStatus(null));

            }

        }).catch((err) => {

            console.error(err);
            setLoading(false);

        });

    }

    useEffect(load, [provider]);

    async function persist(next) {

        setTargets(next);

        try {
            await saveObservabilityConfig(next);
        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save the dashboard target.", "error");
        }

    }

    async function handleRoleToggle(role, active) {

        const next = toggleRole(targets, provider, role, active);

        await persist(next);

        toast.show(
            active
                ? `${label} added as the dashboard's ${role} target.`
                : `${label} removed from the dashboard's ${role} target.`,
            "success"
        );

    }

    function handleServiceIdChange(role, serviceId) {
        persist({ ...targets, [`${role}ServiceId`]: serviceId });
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

    const configured = !!status?.configured;
    const activeRoles = ROLES.filter((r) => targets[`${r.key}Provider`] === provider);
    const anyActive = activeRoles.length > 0;

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">Hosting Providers Dashboard</h3>

            <p className="field-hint" style={{ marginBottom: "12px" }}>
                Assign {label} to any of the dashboard's roles — a portal-wide setting shown the
                same way to every visitor of Hosting Providers, separate from your own connection
                above. One provider can hold more than one role (e.g. Render as both Backend and
                Database, if your Postgres is a separate Render resource under the same account).
                The Database tab's health/size/tables always come straight from this backend's
                DATABASE_URL regardless — nothing to connect for that part.
            </p>

            {ROLES.map((r) => {

                const active = targets[`${r.key}Provider`] === provider;

                const effectiveStatus = r.key === "database" && provider === "render" ? renderDatabaseStatus : status;
                const roleHasLiveList = effectiveStatus?.configured && effectiveStatus?.found && effectiveStatus.services?.length > 0;

                return (

                    <div key={r.key} className="form-group" style={{ marginBottom: active ? "6px" : "12px" }}>

                        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "normal" }}>
                            <input
                                type="checkbox"
                                checked={active}
                                onChange={(e) => handleRoleToggle(r.key, e.target.checked)}
                            />
                            Use {label} as {r.label}
                        </label>

                        {active && (

                            <div style={{ marginTop: "8px", marginLeft: "24px" }}>

                                {roleHasLiveList ? (

                                    <select
                                        className="form-control"
                                        value={targets[`${r.key}ServiceId`] || ""}
                                        onChange={(e) => handleServiceIdChange(r.key, e.target.value)}
                                    >
                                        <option value="">Select a service…</option>
                                        {effectiveStatus.services.map((s) => (
                                            <option key={s.id || s.name} value={s.id || s.name}>{s.name}</option>
                                        ))}
                                    </select>

                                ) : (

                                    <input
                                        className="form-control"
                                        placeholder="Service/site id"
                                        value={targets[`${r.key}ServiceId`] || ""}
                                        onChange={(e) => handleServiceIdChange(r.key, e.target.value)}
                                    />

                                )}

                                {!roleHasLiveList && (
                                    <p className="field-hint">
                                        {configured
                                            ? "Unable to reach this provider with the portal-wide credential below right now."
                                            : "Save the portal-wide credential below to pick from a live list instead of typing an id."}
                                    </p>
                                )}

                            </div>

                        )}

                    </div>

                );

            })}

            {anyActive && (

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
