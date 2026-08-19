import { useEffect, useState } from "react";

import { getObservabilityHostStatus } from "../../services/observabilityService";
import useNavigation from "../../hooks/useNavigation";

// Shared page body for Observability's 10 standalone tools (Prometheus/
// Datadog/ELK/OpenSearch/Loki/Fluent Bit/Fluentd/OpenTelemetry/Jaeger/
// Zipkin) - each gets a real, connectable credential (see Settings →
// Credentials → Observability, HostCredentialLoginSection reused with
// observabilityService.js's own statusFn/saveFn/clearFn), but a live
// data view for any of these 10 isn't built yet - each tool's own query/
// metrics API is genuinely different (PromQL vs. Datadog's REST API vs.
// Elasticsearch's own query DSL vs. Loki's LogQL vs. ...), so there's no
// single generic "show me the data" page the way PortalHostCredentials'
// storage is generic. One real page per tool, an honest "not built yet"
// once connected - same posture as GitLab/Bitbucket/GCP Cloud Services
// elsewhere in this app, not a guessed integration.
export default function ObservabilityHostView({ provider, label }) {

    const { setTab } = useNavigation();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        setLoading(true);

        getObservabilityHostStatus(provider).then((data) => {
            setStatus(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setStatus({ configured: false });
            setLoading(false);
        });

    }, [provider]);

    return (

        <div className="card">

            <h2 className="card-title">{label}</h2>

            {loading ? (

                <p className="empty-state">Checking connection...</p>

            ) : status?.configured ? (

                <>
                    <p className="field-hint field-hint-good">
                        Connected to <strong>{status.hostUrl}</strong>
                        {status.username && <> as <strong>{status.username}</strong></>}.
                    </p>
                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Not built yet — coming in a later update. {label}'s own query/metrics API is
                        different from every other tool here, so this needs its own dedicated data
                        view rather than a generic one.
                    </p>
                </>

            ) : (

                <p className="empty-state" style={{ textAlign: "left" }}>
                    Connect {label} in{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>Settings → Credentials → Observability</a>
                    {" "}to see its connection status here.
                </p>

            )}

        </div>

    );

}
