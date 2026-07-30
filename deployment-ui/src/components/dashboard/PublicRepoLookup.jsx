import { useState } from "react";

import { previewGitHubRepository } from "../../services/settingsService";
import parseRepoUrl from "../../utils/parseRepoUrl";
import useNavigation from "../../hooks/useNavigation";

export default function PublicRepoLookup() {

    const { goToSettingsWithRepo } = useNavigation();

    const [url, setUrl] = useState("");
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);

    async function handleLookup() {

        const parsed = parseRepoUrl(url);

        if (!parsed) {

            setPreview({
                found: false,
                error: "Enter a valid GitHub repository URL, e.g. https://github.com/owner/repo"
            });

            return;

        }

        setLoading(true);

        try {

            const result = await previewGitHubRepository(parsed.owner, parsed.repository);
            setPreview(result);

        }
        catch (err) {

            console.error(err);
            setPreview({ found: false, error: "Unable to reach GitHub." });

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
                Paste any public GitHub repository URL to view its branches, workflows, and
                activity — no login required.
            </p>

            <div className="form-group">
                <label>Repository URL</label>
                <input
                    className="form-control"
                    placeholder="https://github.com/owner/repo"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                />
            </div>

            <button type="button" className="btn btn-primary" onClick={handleLookup} disabled={loading}>
                {loading ? "Looking up..." : "View Repository"}
            </button>

            {preview && (

                preview.found ? (

                    <div className="repo-preview">

                        <h3 className="repo-preview-title">
                            {preview.owner}/{preview.name}
                        </h3>

                        {preview.description && (
                            <p className="repo-preview-description">
                                {preview.description}
                            </p>
                        )}

                        <div className="repo-preview-stats">

                            <span><strong>{preview.branchCount}{preview.branchCountApproximate ? "+" : ""}</strong> branches</span>

                            <span><strong>{preview.workflowCount}</strong> workflows</span>

                            <span><strong>{preview.stars}</strong> stars</span>

                            <span>Default branch: <strong>{preview.defaultBranch}</strong></span>

                            <span>{preview.private ? "Private" : "Public"}</span>

                        </div>

                        <button
                            type="button"
                            className="btn btn-primary"
                            style={{ marginTop: "14px" }}
                            onClick={() => goToSettingsWithRepo(preview.htmlUrl)}
                        >
                            Use this Repository
                        </button>

                    </div>

                ) : (

                    <p className="field-hint field-hint-bad" style={{ marginTop: "12px" }}>
                        {preview.error || "Repository not found."}
                    </p>

                )

            )}

        </div>

    );

}
