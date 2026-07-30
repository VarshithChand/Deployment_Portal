import { useCallback, useEffect, useState } from "react";

import {
    getRepository,
    getBranches,
    getArtifacts,
    getWorkflows
} from "../services/githubService";

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

    const [repository, setRepository] = useState({});
    const [branches, setBranches] = useState([]);
    const [artifacts, setArtifacts] = useState([]);
    const [workflows, setWorkflows] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadData = useCallback(async (force = false) => {

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

    }, [includeRepository]);

    useEffect(() => {

        loadData();

    }, [loadData]);

    return { repository, branches, artifacts, workflows, loading, error, loadData };

}
