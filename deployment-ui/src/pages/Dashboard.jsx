import { useGithubResources } from "../hooks/useGithubResources";

import LoadingSpinner from "../components/LoadingSpinner";
import PageLayout from "../components/layout/PageLayout";

import RepositoryCard from "../components/dashboard/RepositoryCard";
import StatisticsCard from "../components/dashboard/StatisticsCard";
import QuickActions from "../components/dashboard/QuickActions";
import RecentDeployments from "../components/dashboard/RecentDeployments";
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

            <RecentDeployments />

            <br />

            <PublicRepoLookup />

        </PageLayout>

    );

}
