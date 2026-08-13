import useAuth from "../hooks/useAuth";
import useNavigation from "../hooks/useNavigation";

// Wraps a GitHub-repo-scoped page's content (Deploy, Approvals, Pull
// Requests, Artifacts & Images, Analytics, Timeline, History) - onboarding
// only requires a token now (see RequireGitHubSetup), so a session can
// reach any of these pages with a token connected but no repository picked
// yet. Without this, each page fell back to its own generic "nothing here"
// empty state (or, for Approvals/Pull Requests, a misleading permission
// error) with no indication that picking a repo from the Dashboard is
// what's actually missing.
//
// Doesn't handle "no token at all" - that's still RequireGitHubSetup's
// blocking dialog, shown on top of every page including this one.
export default function RequireRepoSelected({ children }) {

    const { githubTokenConfigured, githubRepoConfigured } = useAuth();
    const { setTab } = useNavigation();

    if (!githubTokenConfigured || githubRepoConfigured) {
        return children;
    }

    return (

        <div className="card">

            <h2 className="card-title">Pick a repository first</h2>

            <p className="empty-state" style={{ textAlign: "left" }}>
                Your GitHub token is connected, but this page needs a specific repository
                selected before it has anything to show. Head to the Dashboard and pick one from
                "All Repositories" - deployments, artifacts, approvals, and everything else here
                will then be about whichever repo you choose.
            </p>

            <button type="button" className="btn btn-primary" onClick={() => setTab("dashboard")}>
                Go to Dashboard
            </button>

        </div>

    );

}
