import { useEffect, useState } from "react";
import { Star, ExternalLink, RefreshCw } from "lucide-react";

const REPOS_URL = (username) => `https://api.github.com/users/${username}/repos?sort=updated&per_page=6`;

function formatDate(iso) {
    try {
        return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }
    catch {
        return iso;
    }
}

// Live GitHub repository metadata - fetched directly from GitHub's public
// REST API from the browser (no backend involved, matching this page's
// own "nothing sent anywhere but out" shape), never hand-typed. Excludes
// forks so this reads as "things built," not a fork list. GitHub's
// unauthenticated rate limit (60 req/hr per IP) means this can genuinely
// fail for a busy IP - shown as an honest error with a link straight to
// the profile, never silently replaced with made-up repos.
export default function GitHubPanel({ username, profileUrl }) {

    const [state, setState] = useState({ status: "loading", repos: [] });

    function load() {

        setState({ status: "loading", repos: [] });

        fetch(REPOS_URL(username))
            .then((res) => {
                if (!res.ok) throw new Error(res.status === 403 ? "GitHub API rate limit reached" : `GitHub API error (${res.status})`);
                return res.json();
            })
            .then((data) => {
                const repos = (Array.isArray(data) ? data : [])
                    .filter((r) => !r.fork)
                    .slice(0, 6);
                setState({ status: "ready", repos });
            })
            .catch((err) => setState({ status: "error", repos: [], error: err.message }));

    }

    useEffect(load, [username]);

    return (

        <div className="pf-github-panel">

            <div className="pf-github-head">
                <p className="pf-github-note">Live from the GitHub API — not hand-maintained.</p>
                <button type="button" className="auth-chip-btn" onClick={load} disabled={state.status === "loading"}>
                    <RefreshCw size={12} className={state.status === "loading" ? "pf-spin" : ""} /> Refresh
                </button>
            </div>

            {state.status === "loading" && (
                <p className="field-hint">Loading repositories…</p>
            )}

            {state.status === "error" && (
                <p className="field-hint">
                    Couldn't load live repository data ({state.error}). See the full profile directly on{" "}
                    <a href={profileUrl} target="_blank" rel="noreferrer">GitHub</a>.
                </p>
            )}

            {state.status === "ready" && state.repos.length === 0 && (
                <p className="field-hint">No public repositories found.</p>
            )}

            {state.status === "ready" && state.repos.length > 0 && (

                <div className="pf-github-grid">
                    {state.repos.map((repo) => (

                        <a key={repo.id} className="pf-github-card" href={repo.html_url} target="_blank" rel="noreferrer">

                            <div className="pf-github-card-head">
                                <span className="pf-github-name">{repo.name}</span>
                                <ExternalLink size={13} />
                            </div>

                            {repo.description && <p className="pf-github-desc">{repo.description}</p>}

                            <div className="pf-github-meta">
                                {repo.language && <span>{repo.language}</span>}
                                <span><Star size={11} /> {repo.stargazers_count}</span>
                                <span>Updated {formatDate(repo.updated_at)}</span>
                            </div>

                        </a>

                    ))}
                </div>

            )}

        </div>

    );

}
