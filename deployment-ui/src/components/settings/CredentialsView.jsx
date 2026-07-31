import ComboBox from "../common/ComboBox";
import ClearableInput from "../common/ClearableInput";
import parseRepoUrl from "../../utils/parseRepoUrl";

// Pulled out of Settings.jsx's "credentials" view - its own nested
// loading/repo-preview conditionals were the single largest contributor
// to that page's cognitive complexity.
export default function CredentialsView({
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
    handleClear,
    dockerRegistry,
    setDockerRegistry,
    dockerUsername,
    setDockerUsername,
    dockerPasswordConfigured,
    dockerPassword,
    setDockerPassword,
    handleSaveDocker,
    savingDocker,
    oauthClientId,
    setOauthClientId,
    oauthClientSecretConfigured,
    oauthClientSecret,
    setOauthClientSecret,
    handleSaveOAuth,
    savingOAuth,
    sonarHostUrl,
    setSonarHostUrl,
    sonarOrganization,
    setSonarOrganization,
    sonarProjectKey,
    setSonarProjectKey,
    sonarTokenConfigured,
    sonarToken,
    setSonarToken,
    handleSaveSonar,
    savingSonar,
    adminUsernamesText,
    setAdminUsernamesText,
    handleSaveAdmins,
    savingAdmins
}) {

    return (

        <>

        <div className="card">

            <h2 className="card-title">
                Credentials
            </h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Saved server-side in a gitignored local config file — never stored in the
                browser. Your GitHub repo and token below are yours alone; every other
                user of this portal configures their own. Docker, OAuth, and the admin
                allowlist further down are shared by the whole portal instead.
            </p>

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

            <div className="settings-subsection">

            <h3 className="settings-subhead">Docker Registry</h3>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Stored for future use — no build/push step in this portal reads these yet.
            </p>

            <div className="form-group">
                <label>Registry</label>
                <ClearableInput
                    placeholder="docker.io / ghcr.io / your-registry.com"
                    value={dockerRegistry}
                    onChange={(e) => setDockerRegistry(e.target.value)}
                    onClear={() => setDockerRegistry("")}
                    autoComplete="off"
                    name="docker-registry"
                />
            </div>

            <div className="form-group">
                <label>Username</label>
                <ClearableInput
                    value={dockerUsername}
                    onChange={(e) => setDockerUsername(e.target.value)}
                    onClear={() => setDockerUsername("")}
                    autoComplete="off"
                    name="docker-username"
                />
            </div>

            <div className="form-group">
                <label>
                    Password / Access Token
                    {" "}
                    {dockerPasswordConfigured && (
                        <span className="badge badge-success">Saved</span>
                    )}
                </label>
                <ClearableInput
                    type="password"
                    placeholder={dockerPasswordConfigured ? "Leave blank to keep current password" : ""}
                    value={dockerPassword}
                    onChange={(e) => setDockerPassword(e.target.value)}
                    onClear={() => setDockerPassword("")}
                    autoComplete="new-password"
                />
            </div>

            <div className="button-row">

                <button type="button" className="btn btn-primary" onClick={handleSaveDocker} disabled={savingDocker}>
                    {savingDocker ? "Saving..." : "Save Docker Settings"}
                </button>

                <button type="button" className="btn btn-danger" onClick={() => handleClear("docker", "Docker password")}>
                    Clear Password
                </button>

            </div>

            </div>

            <div className="settings-subsection">

            <h3 className="settings-subhead">GitHub OAuth Login</h3>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                From your GitHub OAuth App at github.com/settings/developers. Callback URL must be
                set to <code>http://localhost:5279/api/auth/github/callback</code>.
            </p>

            <div className="form-group">
                <label>Client ID</label>
                <ClearableInput
                    value={oauthClientId}
                    onChange={(e) => setOauthClientId(e.target.value)}
                    onClear={() => setOauthClientId("")}
                    autoComplete="off"
                    name="oauth-client-id"
                />
            </div>

            <div className="form-group">
                <label>
                    Client Secret
                    {" "}
                    {oauthClientSecretConfigured && (
                        <span className="badge badge-success">Saved</span>
                    )}
                </label>
                <ClearableInput
                    type="password"
                    placeholder={oauthClientSecretConfigured ? "Leave blank to keep current secret" : ""}
                    value={oauthClientSecret}
                    onChange={(e) => setOauthClientSecret(e.target.value)}
                    onClear={() => setOauthClientSecret("")}
                    autoComplete="new-password"
                />
            </div>

            <div className="button-row">

                <button type="button" className="btn btn-primary" onClick={handleSaveOAuth} disabled={savingOAuth}>
                    {savingOAuth ? "Saving..." : "Save OAuth Settings"}
                </button>

                <button type="button" className="btn btn-danger" onClick={() => handleClear("github-oauth", "GitHub OAuth client secret")}>
                    Clear Secret
                </button>

            </div>

            </div>

            <div className="settings-subsection">

            <h3 className="settings-subhead">Sonar (Code Quality)</h3>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Powers the Code Quality page — a SonarCloud (or self-hosted SonarQube)
                project and a token with permission to read its analysis. The token is
                only ever used server-side, never sent to the browser.
            </p>

            <div className="form-group">
                <label>Host URL</label>
                <ClearableInput
                    placeholder="https://sonarcloud.io"
                    value={sonarHostUrl}
                    onChange={(e) => setSonarHostUrl(e.target.value)}
                    onClear={() => setSonarHostUrl("https://sonarcloud.io")}
                    autoComplete="off"
                    name="sonar-host-url"
                />
            </div>

            <div className="form-group">
                <label>Organization</label>
                <ClearableInput
                    placeholder="your-sonarcloud-org"
                    value={sonarOrganization}
                    onChange={(e) => setSonarOrganization(e.target.value)}
                    onClear={() => setSonarOrganization("")}
                    autoComplete="off"
                    name="sonar-organization"
                />
            </div>

            <div className="form-group">
                <label>Project Key</label>
                <ClearableInput
                    placeholder="VarshithChand_yaml"
                    value={sonarProjectKey}
                    onChange={(e) => setSonarProjectKey(e.target.value)}
                    onClear={() => setSonarProjectKey("")}
                    autoComplete="off"
                    name="sonar-project-key"
                />
            </div>

            <div className="form-group">
                <label>
                    Token
                    {" "}
                    {sonarTokenConfigured && (
                        <span className="badge badge-success">Saved</span>
                    )}
                </label>
                <ClearableInput
                    type="password"
                    placeholder={sonarTokenConfigured ? "Leave blank to keep current token" : ""}
                    value={sonarToken}
                    onChange={(e) => setSonarToken(e.target.value)}
                    onClear={() => setSonarToken("")}
                    autoComplete="new-password"
                />
            </div>

            <div className="button-row">

                <button type="button" className="btn btn-primary" onClick={handleSaveSonar} disabled={savingSonar}>
                    {savingSonar ? "Saving..." : "Save Sonar Settings"}
                </button>

                <button type="button" className="btn btn-danger" onClick={() => handleClear("sonar", "Sonar token")}>
                    Clear Token
                </button>

            </div>

            </div>

            <div className="settings-subsection">

            <h3 className="settings-subhead">Admin Allowlist</h3>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                GitHub usernames that get the Admin role on login. Everyone else who logs in gets Viewer.
            </p>

            <div className="form-group">
                <label>GitHub Usernames (comma-separated)</label>
                <ClearableInput
                    placeholder="octocat, hubot"
                    value={adminUsernamesText}
                    onChange={(e) => setAdminUsernamesText(e.target.value)}
                    onClear={() => setAdminUsernamesText("")}
                    autoComplete="off"
                    name="admin-usernames"
                />
            </div>

            <div className="button-row">

                <button type="button" className="btn btn-primary" onClick={handleSaveAdmins} disabled={savingAdmins}>
                    {savingAdmins ? "Saving..." : "Save Admin Allowlist"}
                </button>

                <button type="button" className="btn btn-danger" onClick={() => handleClear("admins", "admin allowlist")}>
                    Clear
                </button>

            </div>

            </div>

        </div>

        </>

    );

}
