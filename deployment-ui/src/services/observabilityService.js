import api from "../api/observabilityToolsApi";

// The Observability sidebar group. The 4 CSP-native tools (CloudWatch/
// X-Ray/Azure Monitor/Cloud Monitoring) reuse this session's existing
// AWS/Azure/GCP credential - no separate connect step, just a read call.
// The other 10 (Prometheus/Datadog/ELK/OpenSearch/Loki/Fluent Bit/
// Fluentd/OpenTelemetry/Jaeger/Zipkin) each get their own connection via
// the exact same generic host-credential routes Harbor/Nexus already use
// in Container Registry, just under /api/observabilitytools/{provider}/...
// instead - see ObservabilityController.cs. Deliberately NOT
// /api/observability - that route already belongs to
// observabilityApi.js/HostingObservabilityController.cs, the portal's own
// unrelated Hosting Observability feature (see that controller's own
// comment on the naming collision).

// ================= CSP-native (real data) =================

export const getCloudWatchOverview = async (region) => {
    const response = await api.get("/cloudwatch", { params: region ? { region } : undefined });
    return response.data;
};

export const getXRayOverview = async (region) => {
    const response = await api.get("/xray", { params: region ? { region } : undefined });
    return response.data;
};

export const getAzureMonitorOverview = async () => {
    const response = await api.get("/azuremonitor");
    return response.data;
};

export const getCloudMonitoringOverview = async () => {
    const response = await api.get("/cloudmonitoring");
    return response.data;
};

// ================= Standalone tools: credential status/save/clear ====

export const getObservabilityHostStatus = async (provider) => {
    const response = await api.get(`/${provider}/host-status`);
    return response.data;
};

export const saveObservabilityHostCredentials = async (provider, payload) => {
    const response = await api.post(`/${provider}/host`, payload);
    return response.data;
};

export const clearObservabilityHostCredentials = async (provider) => {
    const response = await api.delete(`/${provider}/host`);
    return response.data;
};
