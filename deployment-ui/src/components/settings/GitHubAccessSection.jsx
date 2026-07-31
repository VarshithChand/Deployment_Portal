import ComboBox from "../common/ComboBox";
import ClearableInput from "../common/ClearableInput";
import parseRepoUrl from "../../utils/parseRepoUrl";

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
    isRateLimited,
    githubToken,
    setGithubToken,
    handleSaveGitHub,
    savingGitHub,
    handleClear
}) {

    return (

        <div className="settings-subsection">

        <h3 className="settings-subhead">Your GitHub Access</h3>

        {githubTokenConfigured && (

            <div className="form-group">

                <label>Switch repository</label>

                {loadingAccountRepos ? (

                    <p className="field-hint">Loading repositories for this token's account...</p>

                ) : accountRepos.length > 0 ? (

                    <ComboBox
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
            <label>Repository URL</label>
            <ClearableInput
                placeholder="https://github.com/owner/repo"
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

                ) : (

                    <p className="field-hint field-hint-bad">
                        Doesn't look like a GitHub repository URL yet — expecting something like
                        https://github.com/owner/repo
                    </p>

                )

            )}

            {repoPreviewLoading && (
                <p className="field-hint">Fetching repository details...</p>
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
