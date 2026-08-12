import { useGithubResources } from "../hooks/useGithubResources";

import LoadingSpinner from "../components/LoadingSpinner";
import PageLayout from "../components/layout/PageLayout";

import RepositoryCard from "../components/dashboard/RepositoryCard";
import StatisticsCard from "../components/dashboard/StatisticsCard";
import QuickActions from "../components/dashboard/QuickActions";
import AllRepositoriesCard from "../components/dashboard/AllRepositoriesCard";
import AwsServicesCard from "../components/dashboard/AwsServicesCard";
import EnvironmentsCard from "../components/dashboard/EnvironmentsCard";
import PublicRepoLookup from "../components/dashboard/PublicRepoLookup";

export default function Dashboard() {

    const {
        repository,
        branches,
        artifacts,
        workflows,
        loading,
        error,
        loadData
    } = useGithubResources({ includeRepository: true });

    if (loading) {

        return <LoadingSpinner />;

    }

    return (

        <PageLayout title="Overview">

            {

                error &&

                <div className="error-message">

                    {error}

                </div>

            }

            <div className="grid">

                <RepositoryCard

                    repository={repository}

                />

                <StatisticsCard

                    branches={branches}

                    artifacts={artifacts}

                    workflows={workflows}

                />

                <QuickActions

                    refresh={() => loadData(true)}
                    repository={repository}

                />

            </div>

            <br />

            <AllRepositoriesCard repository={repository} />

            <br />

            <AwsServicesCard />

            <br />

            <EnvironmentsCard />

            <br />

            <PublicRepoLookup />

        </PageLayout>

    );

}
