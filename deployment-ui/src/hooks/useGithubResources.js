import { useCallback, useEffect, useState } from "react";

import {
    getRepository,
    getBranches,
    getArtifacts,
    getWorkflows
} from "../services/githubService";
import useAuth from "./useAuth";

function normalizeList(data) {
    return Array.isArray(data) ? data : [];
}

function normalizeWorkflows(data) {
    return data?.workflows ? data.workflows : normalizeList(data);
}

// Shared by Dashboard and Deploy - both need the same
// branches/artifacts/workflows fetch, response-shape normalization, and
// loading/error handling; only Dashboard also needs the repository itself.
export function useGithubResources({ includeRepository = false } = {}) {

    const { githubRepoConfigured, oauthStatusChecked } = useAuth();

    const [repository, setRepository] = useState({});
    const [branches, setBranches] = useState([]);
    const [artifacts, setArtifacts] = useState([]);
    const [workflows, setWorkflows] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // No owner/repo/token configured yet means RequireGitHubSetup's popup
    // is showing (or about to) — this hook's own caller (Dashboard/Deploy)
    // still mounts underneath it, so without this guard every one of these
    // four calls fired immediately regardless, burning through the
    // anonymous 60/hour GitHub rate limit before someone had even pasted
    // a token in.
    const loadData = useCallback(async (force = false) => {

        if (!githubRepoConfigured) {
            return;
        }

        try {

            setLoading(true);
            setError("");

            const [
                repositoryResponse,
                branchesResponse,
                artifactsResponse,
                workflowsResponse
            ] = await Promise.all([
                includeRepository ? getRepository(force) : Promise.resolve(null),
                getBranches(force),
                getArtifacts(force),
                getWorkflows(force)
            ]);

            if (includeRepository) {
                setRepository(repositoryResponse.data || {});
            }

            setBranches(normalizeList(branchesResponse.data));
            setArtifacts(normalizeList(artifactsResponse.data));
            setWorkflows(normalizeWorkflows(workflowsResponse.data));

        }
        catch (err) {

            console.error(err);

            setError(err.response?.data?.message || "Unable to connect to Deployment API.");

        }
        finally {

            setLoading(false);

        }

    }, [includeRepository, githubRepoConfigured]);

    useEffect(() => {

        // Still resolving whether a repo is configured — leave `loading`
        // at its initial true so the caller keeps showing a spinner
        // instead of flashing an empty state before the real answer's in.
        if (!oauthStatusChecked) {
            return;
        }

        if (!githubRepoConfigured) {
            setLoading(false);
            return;
        }

        loadData();

    }, [loadData, oauthStatusChecked, githubRepoConfigured]);

    return { repository, branches, artifacts, workflows, loading, error, loadData };

}
