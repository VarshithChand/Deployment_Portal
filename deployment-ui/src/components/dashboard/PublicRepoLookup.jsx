import { useState } from "react";

import { previewGitHubRepository, previewGitHubUserRepositories } from "../../services/settingsService";
import parseRepoUrl from "../../utils/parseRepoUrl";
import useNavigation from "../../hooks/useNavigation";

// GitHub's own username rules: alphanumeric segments separated by single
// hyphens, no leading/trailing hyphen, 1-39 characters.
const USERNAME_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

// A plain rounded rectangle with a spine down the left edge — reads as a
// "repository" glyph without risking a hand-authored multi-curve path.
// Duplicated from SwitchRepositoryModal rather than shared: both are tiny,
// and this one's the only other place a repo card needs an icon.
function RepoIcon() {

    return (

        <svg className="repo-picker-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>

    );

}

export default function PublicRepoLookup() {

    const { goToSettingsWithRepo } = useNavigation();

    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);

    // Exactly one of these is set after a lookup, depending on whether the
    // query parsed as a specific repo or was treated as a bare username.
    const [repoPreview, setRepoPreview] = useState(null);
    const [userRepos, setUserRepos] = useState(null);

    async function handleLookup() {

        const trimmed = query.trim();

        if (!trimmed) {
            return;
        }

        const parsedRepo = parseRepoUrl(trimmed);

        setLoading(true);
        setRepoPreview(null);
        setUserRepos(null);

        try {

            if (parsedRepo) {

                const result = await previewGitHubRepository(parsedRepo.owner, parsedRepo.repository);
                setRepoPreview(result);

            }
            else if (USERNAME_PATTERN.test(trimmed)) {

                const result = await previewGitHubUserRepositories(trimmed);
                setUserRepos(result);

            }
            else {

                setUserRepos({
                    found: false,
                    error: "Enter a GitHub username, or a repository as owner/repo or a full URL."
                });

            }

        }
        catch (err) {

            console.error(err);
            setUserRepos({ found: false, error: "Unable to reach GitHub." });

        }
        finally {

            setLoading(false);

        }

    }

    return (

        <div className="card">

            <h2 className="card-title">
                Public Repository Lookup
            </h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Search a GitHub username to see every public repository they own, or paste an
                exact repository URL — no login required.
            </p>

            <div className="form-group">
                <label>GitHub Username or Repository URL</label>
                <input
                    className="form-control"
                    placeholder="octocat or https://github.com/owner/repo"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                />
            </div>

            <button type="button" className="btn btn-primary" onClick={handleLookup} disabled={loading}>
                {loading ? "Looking up..." : "Look Up"}
            </button>

            {repoPreview && (

                repoPreview.found ? (

                    <div className="repo-preview">

                        <h3 className="repo-preview-title">
                            {repoPreview.owner}/{repoPreview.name}
                        </h3>

                        {repoPreview.description && (
                            <p className="repo-preview-description">
                                {repoPreview.description}
                            </p>
                        )}

                        <div className="repo-preview-stats">

                            <span><strong>{repoPreview.branchCount}{repoPreview.branchCountApproximate ? "+" : ""}</strong> branches</span>

                            <span><strong>{repoPreview.workflowCount}</strong> workflows</span>

                            <span><strong>{repoPreview.stars}</strong> stars</span>

                            <span>Default branch: <strong>{repoPreview.defaultBranch}</strong></span>

                            <span>{repoPreview.private ? "Private" : "Public"}</span>

                        </div>

                        <button
                            type="button"
                            className="btn btn-primary"
                            style={{ marginTop: "14px" }}
                            onClick={() => goToSettingsWithRepo(repoPreview.htmlUrl)}
                        >
                            Use this Repository
                        </button>

                    </div>

                ) : (

                    <p className="field-hint field-hint-bad" style={{ marginTop: "12px" }}>
                        {repoPreview.error || "Repository not found."}
                    </p>

                )

            )}

            {userRepos && (

                userRepos.found ? (

                    userRepos.repositories.length === 0 ? (

                        <p className="empty-state" style={{ marginTop: "12px" }}>
                            {userRepos.username} has no public repositories.
                        </p>

                    ) : (

                        <>

                        <p className="field-hint" style={{ marginTop: "16px" }}>
                            {userRepos.repositories.length} public {userRepos.repositories.length === 1 ? "repository" : "repositories"} for {userRepos.username} — pick one to use:
                        </p>

                        <div className="repo-picker-grid">

                            {userRepos.repositories.map((repo) => (

                                <button
                                    type="button"
                                    key={repo.htmlUrl}
                                    className="repo-picker-card"
                                    onClick={() => goToSettingsWithRepo(repo.htmlUrl)}
                                >

                                    <div className="repo-picker-title">
                                        <RepoIcon />
                                        <span className="repo-picker-name">
                                            <span className="repo-picker-owner">{repo.owner}/</span>
                                            {repo.name}
                                        </span>
                                    </div>

                                    <div className="repo-picker-meta">

                                        <span className={`badge ${repo.private ? "badge-secondary" : "badge-info"}`}>
                                            {repo.private ? "Private" : "Public"}
                                        </span>

                                        <span className="badge badge-secondary">
                                            {repo.stars} {repo.stars === 1 ? "star" : "stars"}
                                        </span>

                                    </div>

                                </button>

                            ))}

                        </div>

                        </>

                    )

                ) : (

                    <p className="field-hint field-hint-bad" style={{ marginTop: "12px" }}>
                        {userRepos.error || "User not found."}
                    </p>

                )

            )}

        </div>

    );

}
