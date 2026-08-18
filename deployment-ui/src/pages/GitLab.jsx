import PageLayout from "../components/layout/PageLayout";

// Not built yet - GitLab needs its own credential shape (Host URL + PAT,
// self-hosted-friendly like GitLab Registry's own credential) that hasn't
// been specified - a real, visible placeholder rather than a guess.
export default function GitLab() {

    return (

        <PageLayout title="GitLab">
            <div className="card">
                <h2 className="card-title">GitLab</h2>
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Not built yet — coming in a later update. Would need a Host URL and a
                    Personal Access Token (self-hosted GitLab or gitlab.com).
                </p>
            </div>
        </PageLayout>

    );

}
