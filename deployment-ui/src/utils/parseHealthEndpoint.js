// Turns a raw health-check URL into { url, service, cluster, version } for
// grouping on the External APIs page. The VCPMS fleet's hostnames aren't
// consistently named (jobscheduler/logging hosts carry no "-a-"/"-b-"
// token at all, and one admin host is a completely irregular
// "api02-vipscloudpms-rc"), so this deliberately returns version/cluster
// as null ("Shared"/"Unknown") rather than guessing wrong when the URL
// itself doesn't say - verified against the actual 51-URL VCPMS list this
// was built for before relying on it.
export function parseHealthEndpoint(rawUrl) {

    const trimmed = rawUrl.trim();

    let parsed;

    try {
        parsed = new URL(trimmed);
    }
    catch {
        return null;
    }

    const hostname = parsed.hostname;
    const pathParts = parsed.pathname.split("/").filter(Boolean);

    // A path with a segment before "system/health" (e.g. "/admin-api/
    // system/health", "/jobscheduler-api/system/health") is the most
    // reliable service-name signal available - trust it over anything
    // derived from the hostname.
    let service = pathParts.length > 2 ? pathParts[0] : null;

    if (!service) {

        service = hostname
            .replace(/\.azurewebsites\.net$/, "")
            .replace(/-[a-z0-9]{10,}\.westeurope-01$/, "")
            .replace(/^vcpms-/, "")
            .replace(/^api\d{2}-vipscloudpms$/, "admin")
            .replace(/-cluster\d{2}(-[ab])?-rc$/, "")
            .replace(/-cl-\d{2}-rc$/, "")
            .replace(/-rc$/, "");

        if (!service) service = "admin-api";

    }

    const clusterMatch =
        hostname.match(/-(?:cluster|cl-)(\d{2})-/) ||
        hostname.match(/^api(\d{2})-/);

    const cluster = clusterMatch ? clusterMatch[1] : null;

    const versionMatch = hostname.match(/-([ab])-rc/);
    const version = versionMatch ? versionMatch[1].toUpperCase() : null;

    return { url: trimmed, hostname, service, cluster, version };

}

// One URL per line; blank lines and "#"/"//" comment lines are skipped so
// pasting a list with section headers or notes doesn't break parsing.
export function parseHealthEndpointList(rawText) {

    return (rawText || "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"))
        .map(parseHealthEndpoint)
        .filter(Boolean);

}

// Groups parsed endpoints into Version A / Version B / Shared, each
// broken down by cluster, in a stable render order.
export function groupHealthEndpoints(endpoints) {

    const groups = { A: {}, B: {}, Shared: {} };

    for (const endpoint of endpoints) {

        const versionKey = endpoint.version === "A" || endpoint.version === "B" ? endpoint.version : "Shared";
        const clusterKey = endpoint.cluster ? `Cluster ${endpoint.cluster}` : "Unknown Cluster";

        groups[versionKey][clusterKey] ??= [];
        groups[versionKey][clusterKey].push(endpoint);

    }

    return groups;

}
