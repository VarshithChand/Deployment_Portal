import { useGithubResources } from "../hooks/useGithubResources";

import DeploymentForm from "../components/DeploymentForm";
import LoadingSpinner from "../components/LoadingSpinner";
import PageLayout from "../components/layout/PageLayout";

export default function Deploy() {

    const { branches, artifacts, workflows, loading, error } = useGithubResources();

    if (loading) {

        return <LoadingSpinner />;

    }

    return (

        <PageLayout title="Deployment Configuration">

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

        </PageLayout>

    );

}
