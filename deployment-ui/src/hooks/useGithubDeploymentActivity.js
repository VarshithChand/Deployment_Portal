import { useEffect, useState } from "react";

import { getAccountRepositories, getRepoRunsBulk } from "../services/githubService";

// OverviewStats, DeploymentActivityCard, and SourceControlSummaryCard
// all used to (or would have needed to) independently fetch every repo
// + every repo's recent runs on every Dashboard load - same TTL-cache
// dedup shape as useCloudProviderStatus.js. `tookMs` covers both calls
// together (repos, then the bulk runs call for all of them) since
// that's the real time any card was waiting before it had anything to
// render. `repoCount` is exposed alongside `runs` so SourceControlSummaryCard
// can show a real count without a second getAccountRepositories() call.
let inFlight = null;
let cached = null;
let cachedAt = 0;
const TTL_MS = 4000;

function fetchActivity(githubTokenConfigured) {

    if (!githubTokenConfigured) {
        return Promise.resolve({ runs: [], repoCount: 0, tookMs: 0 });
    }

    const now = Date.now();

    if (cached && now - cachedAt < TTL_MS) {
        return Promise.resolve(cached);
    }

    if (inFlight) {
        return inFlight;
    }

    const start = performance.now();

    inFlight = getAccountRepositories()
        .then((response) => {

            const repos = (Array.isArray(response.data) ? response.data : []).slice(0, 100);

            if (repos.length === 0) {
                return { repoCount: 0, runsByRepo: {} };
            }

            return getRepoRunsBulk(repos.map((r) => ({ owner: r.owner, repo: r.name })))
                .then((r) => ({ repoCount: repos.length, runsByRepo: r.data || {} }));

        })
        .catch(() => ({ repoCount: 0, runsByRepo: {} }))
        .then(({ repoCount, runsByRepo }) => {

            const runs = Object.entries(runsByRepo || {})
                .flatMap(([fullName, repoRuns]) => (repoRuns || []).map((r) => ({ ...r, repo: fullName })))
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            cached = { runs, repoCount, tookMs: Math.round(performance.now() - start) };
            cachedAt = Date.now();
            inFlight = null;

            return cached;

        });

    return inFlight;

}

export default function useGithubDeploymentActivity(githubTokenConfigured) {

    const [state, setState] = useState({ runs: null, repoCount: null, tookMs: null });

    useEffect(() => {

        let cancelled = false;

        fetchActivity(githubTokenConfigured).then((result) => {
            if (!cancelled) {
                setState(result);
            }
        });

        return () => { cancelled = true; };

    }, [githubTokenConfigured]);

    return state;

}
