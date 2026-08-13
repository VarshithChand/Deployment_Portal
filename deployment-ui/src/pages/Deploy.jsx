import { useGithubResources } from "../hooks/useGithubResources";

import DeploymentForm from "../components/DeploymentForm";
import LoadingSpinner from "../components/LoadingSpinner";
import RequireRepoSelected from "../components/RequireRepoSelected";
import PageLayout from "../components/layout/PageLayout";
import PageAdminAccessButton from "../components/common/PageAdminAccessButton";

export default function Deploy() {

    const { branches, artifacts, workflows, loading, error } = useGithubResources();

    if (loading) {

        return <LoadingSpinner />;

    }

    return (

        <PageLayout title="Deployment Configuration" actions={<PageAdminAccessButton pageKey="deploy" pageLabel="Deploy" />}>

            <RequireRepoSelected>

                {

                    error &&

                    <div className="error-message">

                        {error}

                    </div>

                }

                <DeploymentForm

                    branches={branches}
                    artifacts={artifacts}
                    workflows={workflows}

                />

            </RequireRepoSelected>

        </PageLayout>

    );

}
