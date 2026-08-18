import PageLayout from "../components/layout/PageLayout";

// Not built yet - Bitbucket needs its own credential shape (a Workspace +
// an App Password, a materially different model from GitLab's Host-URL-
// plus-PAT or Azure Repos' Organization-plus-PAT) that hasn't been
// specified - a real, visible placeholder rather than a guess.
export default function Bitbucket() {

    return (

        <PageLayout title="Bitbucket">
            <div className="card">
                <h2 className="card-title">Bitbucket</h2>
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Not built yet — coming in a later update. Would need a Workspace and
                    an App Password.
                </p>
            </div>
        </PageLayout>

    );

}
