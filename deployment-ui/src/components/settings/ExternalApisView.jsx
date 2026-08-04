import { useEffect, useState } from "react";

import { getExternalHealthEndpoints, saveExternalHealthEndpoints, checkExternalHealth } from "../../services/externalHealthService";
import { parseHealthEndpointList, groupHealthEndpoints } from "../../utils/parseHealthEndpoint";
import ExternalHealthClusterTable from "./ExternalHealthClusterTable";

const VERSION_ORDER = ["A", "B", "Shared"];

const VERSION_LABELS = {
    A: "Version A",
    B: "Version B",
    Shared: "Shared / Unversioned"
};

function summarize(results) {

    let healthy = 0;
    let unhealthy = 0;

    for (const result of results.values()) {
        if (result.ok) healthy++;
        else unhealthy++;
    }

    return { healthy, unhealthy };

}

export default function ExternalApisView() {

    const [endpointsText, setEndpointsText] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [checking, setChecking] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState("");
    const [versionFilter, setVersionFilter] = useState("all");
    const [clusterFilter, setClusterFilter] = useState("all");

    useEffect(() => {

        let cancelled = false;

        getExternalHealthEndpoints()
            .then((text) => {
                if (!cancelled) setEndpointsText(text);
            })
            .catch((err) => console.error(err))
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };

    }, []);

    const parsed = parseHealthEndpointList(endpointsText);
    const grouped = groupHealthEndpoints(parsed);

    // Options only ever list what's actually present in the pasted list -
    // no point offering "Version B" or "Cluster 02" to pick from when
    // nothing parsed into them.
    const availableVersions = VERSION_ORDER.filter((key) => Object.keys(grouped[key]).length > 0);

    const availableClusters = [...new Set(
        parsed.map((endpoint) => (endpoint.cluster ? `Cluster ${endpoint.cluster}` : "Unknown Cluster"))
    )].sort();

    const visibleVersions = availableVersions.filter(
        (key) => versionFilter === "all" || key === versionFilter
    );

    async function handleSave() {

        try {

            setSaving(true);
            setError("");

            setEndpointsText(await saveExternalHealthEndpoints(endpointsText));

        }
        catch (err) {

            console.error(err);
            setError(err.response?.data?.message || "Failed to save endpoint list.");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleCheckAll() {

        if (parsed.length === 0) {
            setError("Paste at least one health-check URL first.");
            return;
        }

        try {

            setChecking(true);
            setError("");

            const data = await checkExternalHealth(parsed.map((endpoint) => endpoint.url));
            setResults(new Map(data.map((result) => [result.url, result])));

        }
        catch (err) {

            console.error(err);
            setError(err.response?.data?.message || "Failed to check endpoints.");

        }
        finally {

            setChecking(false);

        }

    }

    const summary = results && summarize(results);

    return (

        <div className="card">

            <h2 className="card-title">External APIs</h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Paste health-check URLs below (one per line). Each one is grouped automatically by
                version — A or B, detected from the hostname — and by cluster; anything the URL
                itself doesn't disambiguate (a shared job scheduler, for example) shows under
                "Shared" rather than being guessed into the wrong version.
            </p>

            {error && <div className="error-message">{error}</div>}

            <div className="form-group">

                <label>Endpoint URLs (one per line)</label>

                <textarea
                    className="form-control external-health-textarea"
                    rows={10}
                    value={endpointsText}
                    onChange={(e) => setEndpointsText(e.target.value)}
                    placeholder={"https://your-service-cluster01-a-rc.azurewebsites.net/system/health\nhttps://your-service-cluster01-b-rc.azurewebsites.net/system/health\n..."}
                    disabled={loading}
                />

            </div>

            <div className="button-row" style={{ marginBottom: 20 }}>

                <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
                    {saving ? "Saving..." : "Save List"}
                </button>

                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCheckAll}
                    disabled={checking || loading || parsed.length === 0}
                >
                    {checking ? "Checking..." : `Check All (${parsed.length})`}
                </button>

                {summary && (

                    <span className="button-row" style={{ marginLeft: "auto" }}>
                        <span className="badge badge-success">{summary.healthy} healthy</span>
                        <span className="badge badge-danger">{summary.unhealthy} unhealthy</span>
                    </span>

                )}

            </div>

            {loading ? (

                <p className="field-hint">Loading saved endpoint list...</p>

            ) : parsed.length === 0 ? (

                <p className="empty-state">
                    No endpoints yet — paste a list above and click &quot;Save List&quot;.
                </p>

            ) : (

                <>

                <div className="access-filters-row">

                    <select
                        className="form-control access-level-filter"
                        value={versionFilter}
                        onChange={(e) => setVersionFilter(e.target.value)}
                        aria-label="Filter by version"
                    >
                        <option value="all">All versions</option>
                        {availableVersions.map((key) => (
                            <option key={key} value={key}>{VERSION_LABELS[key]}</option>
                        ))}
                    </select>

                    <select
                        className="form-control access-level-filter"
                        value={clusterFilter}
                        onChange={(e) => setClusterFilter(e.target.value)}
                        aria-label="Filter by cluster"
                    >
                        <option value="all">All clusters</option>
                        {availableClusters.map((cluster) => (
                            <option key={cluster} value={cluster}>{cluster}</option>
                        ))}
                    </select>

                </div>

                {(() => {

                    const sections = visibleVersions
                        .map((versionKey) => ({
                            versionKey,
                            clusterKeys: Object.keys(grouped[versionKey])
                                .filter((key) => clusterFilter === "all" || key === clusterFilter)
                                .sort()
                        }))
                        .filter((section) => section.clusterKeys.length > 0);

                    if (sections.length === 0) {
                        return <p className="empty-state">No endpoints match the selected filters.</p>;
                    }

                    return sections.map(({ versionKey, clusterKeys }) => (

                        <div key={versionKey} className="settings-subsection">

                            <h3 className="settings-subhead">{VERSION_LABELS[versionKey]}</h3>

                            {clusterKeys.map((clusterKey) => (

                                <ExternalHealthClusterTable
                                    key={clusterKey}
                                    title={clusterKey}
                                    endpoints={grouped[versionKey][clusterKey]}
                                    results={results}
                                />

                            ))}

                        </div>

                    ));

                })()}

                </>

            )}

        </div>

    );

}
