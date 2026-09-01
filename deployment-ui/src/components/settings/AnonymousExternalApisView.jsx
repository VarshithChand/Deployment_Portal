import { useState } from "react";

import { checkExternalHealthPublic } from "../../services/externalHealthService";

const MAX_URLS = 100;

// The login page's own "External APIs" tool — reachable before signing in,
// on purpose (see LoginSignupPage's tools menu). Unlike Settings' full
// External APIs view, this never saves anything (no endpoint list to load
// or persist — see ExternalHealthController.CheckPublic) and is capped at
// MAX_URLS server-side, since literally anyone can reach this with no
// account at all. Purely a scratch "is this thing up right now" checker.
export default function AnonymousExternalApisView() {

    const [urlsText, setUrlsText] = useState("");
    const [checking, setChecking] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState("");

    const urls = urlsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    async function handleCheck(e) {

        e.preventDefault();

        if (urls.length === 0) {
            setError("Paste at least one URL first.");
            return;
        }

        if (urls.length > MAX_URLS) {
            setError(`Too many URLs at once (max ${MAX_URLS}).`);
            return;
        }

        setChecking(true);
        setError("");
        setResults(null);

        try {
            setResults(await checkExternalHealthPublic(urls));
        }
        catch (err) {
            setError(err.response?.data?.message || "Failed to check endpoints.");
        }
        finally {
            setChecking(false);
        }

    }

    return (

        <div className="card">

            <h2 className="card-title">External APIs</h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Paste up to {MAX_URLS} health-check URLs (one per line) to see whether they're up
                right now. Nothing here is saved — sign in for the full version, which keeps a
                list, groups it by version/cluster, and has no URL limit.
            </p>

            {error && <div className="error-message">{error}</div>}

            <form onSubmit={handleCheck}>

                <div className="form-group">
                    <label htmlFor="anon-external-apis-urls">URLs (one per line)</label>
                    <textarea
                        id="anon-external-apis-urls"
                        className="form-control external-health-textarea"
                        rows={14}
                        value={urlsText}
                        onChange={(e) => setUrlsText(e.target.value)}
                        placeholder={"https://your-service.example.com/system/health"}
                        spellCheck={false}
                    />
                </div>

                <div className="button-row" style={{ marginBottom: 20 }}>
                    <button type="submit" className="btn btn-primary" disabled={checking || urls.length === 0}>
                        {checking ? "Checking..." : `Check (${urls.length})`}
                    </button>
                </div>

            </form>

            {results && (

                <table className="data-table">

                    <thead>
                        <tr>
                            <th>URL</th>
                            <th>Status</th>
                            <th>Response Time</th>
                        </tr>
                    </thead>

                    <tbody>
                        {results.map((result) => (

                            <tr key={result.url}>

                                <td style={{ fontFamily: "monospace", fontSize: "12.5px", wordBreak: "break-all" }}>
                                    {result.url}
                                </td>

                                <td>
                                    {result.ok ? (
                                        <span className="badge badge-success">{result.statusCode ?? "OK"}</span>
                                    ) : (
                                        <span className="badge badge-danger" title={result.error || ""}>
                                            {result.statusCode ?? result.error ?? "Unreachable"}
                                        </span>
                                    )}
                                </td>

                                <td>{result.responseTimeMs != null ? `${Math.round(result.responseTimeMs)}ms` : "—"}</td>

                            </tr>

                        ))}
                    </tbody>

                </table>

            )}

        </div>

    );

}
