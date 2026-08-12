import { useGithubResources } from "../hooks/useGithubResources";

import LoadingSpinner from "../components/LoadingSpinner";
import PageLayout from "../components/layout/PageLayout";

import AllRepositoriesCard from "../components/dashboard/AllRepositoriesCard";
import AwsServicesCard from "../components/dashboard/AwsServicesCard";
import EnvironmentsCard from "../components/dashboard/EnvironmentsCard";
import PublicRepoLookup from "../components/dashboard/PublicRepoLookup";

export default function Dashboard() {

    // Only `repository` is still needed here - it tells AllRepositoriesCard
    // which card to mark "Current". branches/artifacts/workflows backed the
    // removed Repository Statistics card; still fetched by the shared hook
    // (Deploy needs them too) but no longer read on this page.
    const { repository, loading, error } = useGithubResources({ includeRepository: true });

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
