import { Fragment, useState } from "react";

// One compact, expandable table per cluster within a version group -
// mirrors ArtifactsTable's table-row-clickable/table-row-details pattern,
// chosen over individual cards (see SmokeTestCard) because a real fleet
// here runs into dozens of endpoints, where stacked cards would be
// unusable.
export default function ExternalHealthClusterTable({ title, endpoints, results }) {

    const [expandedUrl, setExpandedUrl] = useState(null);

    function toggle(url) {
        setExpandedUrl((current) => (current === url ? null : url));
    }

    return (

        <div className="table-scroll" style={{ marginBottom: 16 }}>

            <table className="table">

                <thead>

                    <tr>
                        <th colSpan={4} className="external-health-cluster-heading">
                            {title}
                        </th>
                    </tr>

                    <tr>
                        <th>Service</th>
                        <th>Status</th>
                        <th className="num">Response</th>
                        <th></th>
                    </tr>

                </thead>

                <tbody>

                    {endpoints.map((endpoint) => {

                        const result = results?.get(endpoint.url);
                        const expanded = expandedUrl === endpoint.url;

                        return (

                            <Fragment key={endpoint.url}>

                            <tr className="table-row-clickable" onClick={() => toggle(endpoint.url)}>

                                <td>{endpoint.service}</td>

                                <td>

                                    {result ? (

                                        <span className={`badge ${result.ok ? "badge-success" : "badge-danger"}`}>
                                            {result.ok
                                                ? `${result.statusCode} OK`
                                                : result.statusCode
                                                    ? `HTTP ${result.statusCode}`
                                                    : "Unreachable"}
                                        </span>

                                    ) : (

                                        <span className="badge badge-secondary">Not checked</span>

                                    )}

                                </td>

                                <td className="num">
                                    {result?.responseTimeMs != null ? `${result.responseTimeMs} ms` : "—"}
                                </td>

                                <td className="num">
                                    <span className={`smoke-test-chevron ${expanded ? "smoke-test-chevron-open" : ""}`} aria-hidden="true">
                                        &#9662;
                                    </span>
                                </td>

                            </tr>

                            {expanded && (

                                <tr className="table-row-details">

                                    <td colSpan={4}>

                                        <div className="info-row">
                                            <span>URL</span>
                                            <strong className="smoke-test-metric-mono">{endpoint.url}</strong>
                                        </div>

                                        {result?.error && (

                                            <div className="info-row">
                                                <span>Error</span>
                                                <strong className="field-hint-bad">{result.error}</strong>
                                            </div>

                                        )}

                                        {result?.body && (

                                            <pre className="external-health-body">{result.body}</pre>

                                        )}

                                    </td>

                                </tr>

                            )}

                            </Fragment>

                        );

                    })}

                </tbody>

            </table>

        </div>

    );

}
