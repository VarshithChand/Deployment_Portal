import { useCallback, useEffect, useState } from "react";

import { getSonarOverview } from "../../services/sonarService";
import LoadingSpinner from "../LoadingSpinner";
import useNavigation from "../../hooks/useNavigation";

// A-E, mirrored from Sonar's own rating scale — its own dashboard uses the
// same colors (A green through E red), so this stays recognizable to
// anyone who already knows Sonar's UI.
function ratingClass(letter) {

    switch (letter) {
        case "A": return "badge badge-success";
        case "B": return "badge badge-info";
        case "C": return "badge badge-warning";
        case "D":
        case "E": return "badge badge-danger";
        default: return "badge badge-secondary";
    }

}

function RatingTile({ label, letter }) {

    return (

        <div className="card dashboard-card">

            <h2 className="card-title">{label}</h2>

            <div className="info-row">
                <span>Rating</span>
                <strong><span className={ratingClass(letter)}>{letter || "—"}</span></strong>
            </div>

        </div>

    );

}

// SonarQube and SonarCloud are two fully independent credentials/pages now
// (previously one shared connection covered both) - provider ("sonarqube"
// | "sonarcloud") picks which one this instance reads/renders.
export default function SonarView({ provider }) {

    const { setTab } = useNavigation();

    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {

        try {

            setLoading(true);
            setError("");

            const data = await getSonarOverview(provider);
            setOverview(data);

        }
        catch (err) {

            console.error(err);
            setError(err.response?.data?.message || "Unable to reach Sonar. Check the settings below.");

        }
        finally {

            setLoading(false);

        }

    }, [provider]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading) {
        return <LoadingSpinner />;
    }

    return (

        <>

            {error && (
                <div className="error-message">{error}</div>
            )}

            {!error && overview && !overview.configured && (

                <div className="card">
                    <h2 className="card-title">Not Configured</h2>
                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Add a project key and token in{" "}
                        <button type="button" className="btn-link" style={{ padding: 0 }} onClick={() => setTab("settings")}>
                            Settings → Credentials → {provider === "sonarqube" ? "SonarQube" : "SonarCloud"}
                        </button>
                        {" "}to see analysis results here.
                    </p>
                </div>

            )}

            {!error && overview?.configured && overview.error && (

                <div className="card">
                    <h2 className="card-title">No Analysis Yet</h2>
                    <p className="empty-state">{overview.error}</p>
                    <a href={overview.dashboardUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                        Open Sonar Dashboard &rarr;
                    </a>
                </div>

            )}

            {!error && overview?.configured && !overview.error && (

                <>

                <div className="card">

                    <h2 className="card-title">
                        Quality Gate
                    </h2>

                    <div className="info-row">

                        <span>Status</span>

                        <strong>
                            <span className={overview.qualityGateStatus === "OK" ? "badge badge-success" : "badge badge-danger"}>
                                {overview.qualityGateStatus === "OK" ? "Passed" : overview.qualityGateStatus}
                            </span>
                        </strong>

                    </div>

                    <div className="info-row">
                        <span>Lines of Code</span>
                        <strong>{overview.linesOfCode.toLocaleString()}</strong>
                    </div>

                    <div className="info-row">
                        <span>Coverage</span>
                        <strong>{overview.coveragePercent.toFixed(1)}%</strong>
                    </div>

                    <div className="info-row">
                        <span>Duplicated Lines</span>
                        <strong>{overview.duplicatedLinesPercent.toFixed(1)}%</strong>
                    </div>

                    <div className="button-row" style={{ marginTop: "15px" }}>
                        <a href={overview.dashboardUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                            Open Full Sonar Dashboard &rarr;
                        </a>
                    </div>

                </div>

                <div className="grid">

                    <div className="card dashboard-card">
                        <h2 className="card-title">Bugs</h2>
                        <div className="info-row">
                            <span>Open</span>
                            <strong>{overview.bugs}</strong>
                        </div>
                    </div>

                    <div className="card dashboard-card">
                        <h2 className="card-title">Vulnerabilities</h2>
                        <div className="info-row">
                            <span>Open</span>
                            <strong>{overview.vulnerabilities}</strong>
                        </div>
                    </div>

                    <div className="card dashboard-card">
                        <h2 className="card-title">Code Smells</h2>
                        <div className="info-row">
                            <span>Open</span>
                            <strong>{overview.codeSmells}</strong>
                        </div>
                    </div>

                    <RatingTile label="Reliability" letter={overview.reliabilityRating} />
                    <RatingTile label="Security" letter={overview.securityRating} />
                    <RatingTile label="Maintainability" letter={overview.maintainabilityRating} />

                </div>

                </>

            )}

        </>

    );

}
