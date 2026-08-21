import { useEffect, useState } from "react";

import ClearableInput from "../common/ClearableInput";
import DatabaseConnectionSection from "./credentials/DatabaseConnectionSection";
import useToast from "../../hooks/useToast";
import {
    getObservabilityConfig, saveObservabilityConfig,
    getObservabilityCredentialStatus, saveObservabilityCredentials, clearObservabilityCredentials,
    getRenderDatabases
} from "../../services/hostingObservabilityService";

const PROVIDERS = [
    { key: "render", label: "Render", hasAccountId: false },
    { key: "cloudflare", label: "Cloudflare Pages", hasAccountId: true },
    { key: "netlify", label: "Netlify", hasAccountId: false },
    { key: "vercel", label: "Vercel", hasAccountId: false }
];

const EMPTY_FORM = { token: "", accountId: "" };
const EMPTY_TARGETS = {
    frontendProvider: "", frontendServiceId: "",
    backendProvider: "", backendServiceId: "",
    databaseProvider: "", databaseServiceId: ""
};

// One provider's PORTAL-WIDE credential (not the configuring admin's own
// session credential) - mirrors PaasLoginSection.jsx's form conventions
// exactly, just pointed at the observability service's portal-credential
// endpoints instead of paasService.js's session-scoped ones.
function ProviderCredentialSection({ provider, label, hasAccountId, status, onSaved }) {

    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    const configured = !!status?.configured;

    async function handleSave(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await saveObservabilityCredentials(provider, form);
            toast.show(`Portal-wide ${label} credentials saved.`, "success");
            setForm(EMPTY_FORM);
            onSaved();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Unable to save ${label} credentials.`, "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClear() {

        try {

            await clearObservabilityCredentials(provider);
            toast.show(`Portal-wide ${label} credentials cleared.`, "success");
            onSaved();

        }
        catch (err) {

            console.error(err);
            toast.show(`Unable to clear ${label} credentials.`, "error");

        }

    }

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">
                {label}
                {" "}
                {configured && (
                    <span className={`badge ${status.found ? "badge-success" : "badge-warning"}`}>
                        {status.found ? "Connected" : "Configured"}
                    </span>
                )}
            </h3>

            {configured && !status.found && (
                <p className="error-message">{status.error || `Unable to reach ${label}.`}</p>
            )}

            <form onSubmit={handleSave}>

                <div className="form-group">
                    <label htmlFor={`${label}-hosting-token`}>API Token</label>
                    <ClearableInput
                        id={`${label}-hosting-token`}
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
                        <label htmlFor={`${label}-hosting-account-id`}>Account ID</label>
                        <ClearableInput
                            id={`${label}-hosting-account-id`}
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
                        {saving ? "Saving..." : `Save ${label} Credentials`}
                    </button>

                    {configured && (
                        <button type="button" className="btn btn-danger" onClick={handleClear}>
                            Clear Credentials
                        </button>
                    )}

                </div>

            </form>

        </div>

    );

}

// One role's provider + service picker - mirrors EnvironmentsAdminView's
// PaasServiceIdField picker-or-fallback shape, but backed by the PORTAL
// credential's live service list (statusByProvider, from
// getObservabilityCredentialStatus) rather than the configuring admin's own
// session credential - the picker must show services under the credential
// this dashboard will actually use, not whichever account the admin
// personally happens to have connected.
function TargetRoleFields({ label, hint, provider, serviceId, onProviderChange, onServiceIdChange, status, allowEmpty }) {

    const hasLiveList = status?.configured && status?.found && status.services?.length > 0;

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">{label}</h3>

            {hint && <p className="field-hint" style={{ marginBottom: "10px" }}>{hint}</p>}

            <div className="form-group">

                <label htmlFor={`${label}-target-provider`}>Provider</label>

                <select id={`${label}-target-provider`} className="form-control" value={provider || ""} onChange={(e) => onProviderChange(e.target.value)}>
                    {allowEmpty && <option value="">Not configured</option>}
                    {PROVIDERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>

            </div>

            {provider && (

                <div className="form-group">

                    <label htmlFor={`${label}-target-service`}>Service</label>

                    {hasLiveList ? (

                        <select id={`${label}-target-service`} className="form-control" value={serviceId || ""} onChange={(e) => onServiceIdChange(e.target.value)}>
                            <option value="">Select a service…</option>
                            {status.services.map((s) => (
                                <option key={s.id || s.name} value={s.id || s.name}>{s.name}</option>
                            ))}
                        </select>

                    ) : (

                        <input
                            className="form-control"
                            placeholder="Service/site id"
                            value={serviceId || ""}
                            onChange={(e) => onServiceIdChange(e.target.value)}
                        />

                    )}

                    {!hasLiveList && (
                        <p className="field-hint">
                            {status?.configured
                                ? "Unable to reach this provider with the saved portal-wide credential right now."
                                : "Save this provider's portal-wide credential below to pick from a live list instead of typing an id."}
                        </p>
                    )}

                </div>

            )}

        </div>

    );

}

// Settings → Hosting Observability - configures WHICH real Cloudflare/
// Render/Postgres resource the Hosting Providers page's Frontend/Backend/
// Database dashboard monitors, and the portal-wide (not session-scoped)
// credentials it uses to reach them. Restricted server-side to the single
// super-admin identity (see AdminGate.DenyUnlessSuperAdminAsync on every
// api/observability/* action) - only reached after Settings.jsx's own
// isSuperAdminSession gate, same posture as Database Management/Security
// Testing Lab.
export default function HostingObservabilityConfigView() {

    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [targets, setTargets] = useState(EMPTY_TARGETS);
    const [statusByProvider, setStatusByProvider] = useState({});

    // The "Database metrics" role's service list can't reuse
    // statusByProvider.render (GetStatusAsync's /v1/services list) - Render
    // Postgres instances are a completely different resource type, never
    // returned by that call (that's why this dropdown was always empty).
    // Fetched separately, only once a portal-wide Render credential exists.
    const [renderDatabaseStatus, setRenderDatabaseStatus] = useState(null);

    useEffect(() => {

        if (!statusByProvider.render?.configured) {
            setRenderDatabaseStatus(null);
            return;
        }

        getRenderDatabases().then((data) => {

            setRenderDatabaseStatus({
                configured: true,
                found: true,
                services: (Array.isArray(data) ? data : []).map((d) => ({ id: d.id, name: `${d.name} — ${d.status}` }))
            });

        }).catch(() => setRenderDatabaseStatus(null));

    }, [statusByProvider.render?.configured]);

    function refreshProviderStatus(provider) {

        getObservabilityCredentialStatus(provider)
            .then((data) => setStatusByProvider((current) => ({ ...current, [provider]: data })))
            .catch(() => setStatusByProvider((current) => ({ ...current, [provider]: null })));

    }

    function loadAll() {

        setLoading(true);

        Promise.all([
            getObservabilityConfig(),
            ...PROVIDERS.map((p) => getObservabilityCredentialStatus(p.key).catch(() => null))
        ]).then(([config, ...statuses]) => {

            setTargets({
                frontendProvider: config.targets?.frontendProvider || "",
                frontendServiceId: config.targets?.frontendServiceId || "",
                backendProvider: config.targets?.backendProvider || "",
                backendServiceId: config.targets?.backendServiceId || "",
                databaseProvider: config.targets?.databaseProvider || "",
                databaseServiceId: config.targets?.databaseServiceId || ""
            });

            const byProvider = {};
            PROVIDERS.forEach((p, i) => { byProvider[p.key] = statuses[i]; });
            setStatusByProvider(byProvider);

            setLoading(false);

        }).catch((err) => {

            console.error(err);
            setLoading(false);

        });

    }

    useEffect(loadAll, []);

    function updateTarget(field, value) {
        setTargets((current) => ({ ...current, [field]: value }));
    }

    async function handleSave() {

        setSaving(true);

        try {

            await saveObservabilityConfig(targets);
            toast.show("Hosting observability targets saved.", "success");

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save the hosting observability targets.", "error");

        }
        finally {

            setSaving(false);

        }

    }

    if (loading) {
        return <p className="field-hint">Loading...</p>;
    }

    return (

        <>

        <div className="card">

            <h2 className="card-title">Hosting Observability</h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Which real Cloudflare/Render/Postgres resource the Hosting Providers page's
                Frontend/Backend/Database dashboard monitors — a portal-wide target shown the
                same way to every visitor, separate from anyone's own personal connections on
                Settings → Credentials. Save a portal-wide credential for a provider below, then
                pick it and its service here.
            </p>

            <TargetRoleFields
                label="Frontend"
                provider={targets.frontendProvider}
                serviceId={targets.frontendServiceId}
                onProviderChange={(v) => updateTarget("frontendProvider", v)}
                onServiceIdChange={(v) => updateTarget("frontendServiceId", v)}
                status={statusByProvider[targets.frontendProvider]}
            />

            <TargetRoleFields
                label="Backend"
                provider={targets.backendProvider}
                serviceId={targets.backendServiceId}
                onProviderChange={(v) => updateTarget("backendProvider", v)}
                onServiceIdChange={(v) => updateTarget("backendServiceId", v)}
                status={statusByProvider[targets.backendProvider]}
            />

            <TargetRoleFields
                label="CPU/Memory/Storage Metrics Link (optional)"
                hint={'Not the database connection itself (that’s the separate "Database" card below, required either way) - this only links the Database tab’s CPU/Memory/Storage graphs to Render’s Metrics API, for when the connected database is also a Render-managed resource.'}
                provider={targets.databaseProvider}
                serviceId={targets.databaseServiceId}
                onProviderChange={(v) => updateTarget("databaseProvider", v)}
                onServiceIdChange={(v) => updateTarget("databaseServiceId", v)}
                status={targets.databaseProvider === "render" ? renderDatabaseStatus : statusByProvider[targets.databaseProvider]}
                allowEmpty
            />

            <div className="button-row">
                <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save Targets"}
                </button>
            </div>

        </div>

        <div className="card" style={{ marginTop: "18px" }}>
            <DatabaseConnectionSection />
        </div>

        <div className="card" style={{ marginTop: "18px" }}>

            <h2 className="card-title">Portal-Wide Credentials</h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Used only by the Hosting Providers dashboard above — separate from, and never
                shared with, anyone's own personal Render/Cloudflare/Netlify/Vercel connections
                on Settings → Credentials. Tokens are never sent to the browser once saved.
            </p>

            {PROVIDERS.map((p) => (

                <ProviderCredentialSection
                    key={p.key}
                    provider={p.key}
                    label={p.label}
                    hasAccountId={p.hasAccountId}
                    status={statusByProvider[p.key]}
                    onSaved={() => refreshProviderStatus(p.key)}
                />

            ))}

        </div>

        </>

    );

}
