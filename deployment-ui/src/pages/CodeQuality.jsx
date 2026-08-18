import { useCallback, useState } from "react";

import PageLayout from "../components/layout/PageLayout";
import PageAdminAccessButton from "../components/common/PageAdminAccessButton";
import SonarView from "../components/codeQuality/SonarView";
import CodeQlView from "../components/codeQuality/CodeQlView";

const VIEWS = ["sonar", "codeql"];

// SonarQube and SonarCloud are the same connection in this portal (one
// Host URL/token form covers either), so they're one combined tile rather
// than two that would secretly point at the identical data - a confirmed
// design decision, not an oversight (see the plan this hub shipped from).
// CodeQL reuses the session's already-connected GitHub token, same as
// Artifacts/Analytics/History - no separate credential to set up. ESLint/
// Pylint/Checkstyle have no hosted API of their own to browse; showing
// results for them would mean downloading and parsing a lint-report
// artifact from a workflow run, which depends entirely on a repo's own CI
// actually producing one in a known format - deliberately not built yet
// rather than guessed at, shown here as real, visible "Coming soon" tiles.
const PROVIDERS = [
    { key: "sonar", label: "SonarQube / SonarCloud", view: "sonar" },
    { key: "codeql", label: "CodeQL", view: "codeql" },
    { key: "eslint", label: "ESLint", comingSoon: true },
    { key: "pylint", label: "Pylint", comingSoon: true },
    { key: "checkstyle", label: "Checkstyle", comingSoon: true }
];

function readViewFromUrl() {

    const requested = new URLSearchParams(window.location.search).get("view");

    return VIEWS.includes(requested) ? requested : null;

}

// One hub for every code-quality/static-analysis tool a team might use -
// own "?view=" sub-nav, local replaceState, same pattern as PaasHosting.jsx/
// Settings.jsx/Services.jsx/ContainerRegistry.jsx (siblings, not a
// drill-down).
export default function CodeQuality() {

    const [view, setViewState] = useState(readViewFromUrl);

    const setView = useCallback((next) => {

        setViewState(next);

        const url = new URL(window.location.href);

        if (next) {
            url.searchParams.set("view", next);
        }
        else {
            url.searchParams.delete("view");
        }

        window.history.replaceState(null, "", url);

    }, []);

    if (view) {

        const provider = PROVIDERS.find((p) => p.view === view);

        return (

            <PageLayout
                title="Code Quality"
                actions={
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setView(null)}>
                        ← All Tools
                    </button>
                }
            >

                <h2 style={{ marginTop: 0 }}>{provider?.label}</h2>

                {view === "sonar" && <SonarView />}
                {view === "codeql" && <CodeQlView />}

            </PageLayout>

        );

    }

    return (

        <PageLayout title="Code Quality" actions={<PageAdminAccessButton pageKey="codeQuality" pageLabel="Code Quality" />}>

            <p className="field-hint" style={{ marginBottom: "18px" }}>
                Every code-quality tool this portal can reach. SonarQube/SonarCloud and CodeQL
                connect using credentials already set up elsewhere — nothing new to configure if
                you already use those for this repo. ESLint, Pylint, and Checkstyle are on the way.
            </p>

            <div className="settings-hub">

                {PROVIDERS.map((p) => (

                    <button
                        key={p.key}
                        type="button"
                        className="settings-hub-tile"
                        disabled={!!p.comingSoon}
                        style={p.comingSoon ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
                        onClick={() => !p.comingSoon && setView(p.view)}
                    >
                        <h2>
                            {p.label}
                            {" "}
                            {p.comingSoon && (
                                <span className="badge badge-secondary">Coming soon</span>
                            )}
                        </h2>

                        <p>
                            {p.comingSoon
                                ? "Not built yet — coming in a later update."
                                : p.key === "sonar"
                                    ? "Quality gate, bugs, vulnerabilities, code smells, and ratings."
                                    : "Open code scanning alerts from GitHub's CodeQL analysis."}
                        </p>
                    </button>

                ))}

            </div>

        </PageLayout>

    );

}
