import ComboBox from "../common/ComboBox";
import ClearableInput from "../common/ClearableInput";
import parseRepoUrl from "../../utils/parseRepoUrl";
import isValidGitHubUsername from "../../utils/githubUsername";

// A plain rounded rectangle with a spine down the left edge — the same
// "repository" glyph SwitchRepositoryModal and AllRepositoriesCard each
// already keep their own copy of; a fourth tiny duplicate here follows
// that same established precedent rather than introducing a shared import.
function RepoIcon() {

    return (

        <svg className="repo-picker-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>

    );

}

// Renders when the Repository URL field holds a bare GitHub username
// instead of a specific repo (see Settings.jsx's debounced lookup effect) -
// every public repository that username owns, pick one to fill the field
// above with. The same "browse any public GitHub user's repos" capability
// the old Dashboard "Public Repository Lookup" card had.
function UserRepoResults({ userRepoResults, onPick }) {

    if (!userRepoResults.found) {

        return (
            <p className="field-hint field-hint-bad">
                {userRepoResults.error || "User not found."}
            </p>
        );

    }

    if (userRepoResults.repositories.length === 0) {

        return (
            <p className="field-hint">
                {userRepoResults.username} has no public repositories.
            </p>
        );

    }

    return (

        <>

        <p className="field-hint">
            {userRepoResults.repositories.length} public {userRepoResults.repositories.length === 1 ? "repository" : "repositories"} for {userRepoResults.username} — pick one:
        </p>

        <div className="repo-picker-grid">

            {userRepoResults.repositories.map((repo) => (

                <button
                    type="button"
                    key={repo.htmlUrl}
                    className="repo-picker-card"
                    onClick={() => onPick(repo.htmlUrl)}
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

    );

}

// Pulled out of CredentialsView - the repo-switcher/URL-validity/preview
// nested ternaries here were the single largest contributor to that
// component's own cognitive complexity.
export default function GitHubAccessSection({
    githubTokenConfigured,
    loadingAccountRepos,
    accountRepos,
    githubRepoUrl,
    setGithubRepoUrl,
    repoPreviewLoading,
    repoPreview,
    userRepoResults,
    isRateLimited,
    githubToken,
    setGithubToken,
    githubMfaRequired,
    githubMfaCode,
    setGithubMfaCode,
    handleSaveGitHub,
    savingGitHub,
    handleClear
}) {

    return (

        <div className="settings-subsection">

        <h3 className="settings-subhead">Your GitHub Access</h3>

        {githubTokenConfigured && (

            <div className="form-group">

                <label htmlFor="github-switch-repo">Switch repository</label>

                {loadingAccountRepos ? (

                    <p className="field-hint">Loading repositories for this token's account...</p>

                ) : accountRepos.length > 0 ? (

                    <ComboBox
                        id="github-switch-repo"
                        options={accountRepos.map((repo) => ({
                            value: repo.htmlUrl,
                            label: repo.private ? `${repo.fullName} (private)` : repo.fullName
                        }))}
                        value={githubRepoUrl}
                        onChange={(url) => url && setGithubRepoUrl(url)}
                        placeholder="Search repositories this token can see..."
                    />

                ) : (

                    <p className="field-hint">
                        No repositories found for this token's account.
                    </p>

                )}

            </div>

        )}

        <div className="form-group">
            <label htmlFor="github-repo-url">Repository URL or GitHub Username (optional)</label>
            <p className="field-hint" style={{ marginTop: 0 }}>
                Leave this blank to save just your token — pick a repository later, whenever you need one.
            </p>
            <ClearableInput
                id="github-repo-url"
                placeholder="https://github.com/owner/repo or octocat"
                value={githubRepoUrl}
                onChange={(e) => setGithubRepoUrl(e.target.value)}
                onClear={() => setGithubRepoUrl("")}
                autoComplete="off"
                name="repository-url"
            />
            {githubRepoUrl.trim() && (

                parseRepoUrl(githubRepoUrl) ? (

                    <p className="field-hint field-hint-good">
                        Owner: <strong>{parseRepoUrl(githubRepoUrl).owner}</strong>
                        {" "}&middot; Repository: <strong>{parseRepoUrl(githubRepoUrl).repository}</strong>
                    </p>

                ) : isValidGitHubUsername(githubRepoUrl.trim()) ? (

                    <p className="field-hint field-hint-good">
                        Looking up public repositories owned by <strong>{githubRepoUrl.trim()}</strong>...
                    </p>

                ) : (

                    <p className="field-hint field-hint-bad">
                        Doesn't look like a GitHub repository URL or username yet — expecting
                        something like https://github.com/owner/repo, or just a username.
                    </p>

                )

            )}

            {repoPreviewLoading && (
                <p className="field-hint">Fetching from GitHub...</p>
            )}

            {!repoPreviewLoading && repoPreview && (

                repoPreview.found ? (

                    <div className="repo-preview">

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

                    </div>

                ) : (

                    <p className="field-hint field-hint-bad">
                        {repoPreview.error || "Repository not found."}
                    </p>

                )

            )}

            {!repoPreviewLoading && userRepoResults && (

                <UserRepoResults
                    userRepoResults={userRepoResults}
                    onPick={setGithubRepoUrl}
                />

            )}
        </div>

        <div className="form-group">
            <label>
                Personal Access Token
                {" "}
                {githubTokenConfigured && (
                    <span className="badge badge-success">Saved</span>
                )}
            </label>
            <input
                type="password"
                className="form-control"
                placeholder={githubTokenConfigured ? "Token saved — click \"Clear Token\" to change it" : "ghp_..."}
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                disabled={githubTokenConfigured}
                autoComplete="new-password"
            />
            {!githubTokenConfigured && (
                <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noreferrer"
                    className={`token-help-link ${isRateLimited ? "token-help-link-alert" : ""}`}
                >
                    {isRateLimited
                        ? "Rate limit exceeded — generate a token on GitHub →"
                        : "Generate a token on GitHub →"}
                </a>
            )}
        </div>

        {githubMfaRequired && (

            <div className="form-group">
                <label htmlFor="github-mfa-code">6-digit authenticator code</label>
                <p className="field-hint" style={{ marginTop: 0 }}>
                    Your account has MFA enabled — enter a fresh code to confirm this change.
                </p>
                <input
                    id="github-mfa-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className="form-control"
                    placeholder="123456"
                    value={githubMfaCode}
                    onChange={(e) => setGithubMfaCode(e.target.value.replace(/\D/g, ""))}
                    autoComplete="one-time-code"
                    autoFocus
                />
            </div>

        )}

        <div className="button-row">

            <button type="button" className="btn btn-primary" onClick={handleSaveGitHub} disabled={savingGitHub}>
                {savingGitHub ? "Saving..." : "Save GitHub Settings"}
            </button>

            <button type="button" className="btn btn-danger" onClick={() => handleClear("github", "GitHub token")}>
                Clear Token
            </button>

        </div>

        </div>

    );

}
