// illustrativeDeployments has no real source to derive from, so it's kept
// explicitly labeled as an illustrative counter (see Dashboard's own
// "not a live monitoring feed" note) rather than presented as a real metric.
export const DASHBOARD = {
    services: [
        { name: "API", status: "online" },
        { name: "DATABASE", status: "online" },
        { name: "FRONTEND", status: "online" },
        { name: "PIPELINE", status: "ready" }
    ],
    illustrativeDeployments: 127
};
