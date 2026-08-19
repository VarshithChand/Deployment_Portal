import { useGithubResources } from "../hooks/useGithubResources";

import PageLayout from "../components/layout/PageLayout";

import AllRepositoriesCard from "../components/dashboard/AllRepositoriesCard";
import AzureDevOpsCard from "../components/dashboard/AzureDevOpsCard";
import CloudServicesCard from "../components/dashboard/CloudServicesCard";
import PaasSummaryCard from "../components/dashboard/PaasSummaryCard";
import ContainerRegistrySummaryCard from "../components/dashboard/ContainerRegistrySummaryCard";
import ObservabilitySummaryCard from "../components/dashboard/ObservabilitySummaryCard";
import EnvironmentsCard from "../components/dashboard/EnvironmentsCard";
import QuickAccessCard from "../components/dashboard/QuickAccessCard";

export default function Dashboard() {

    // Only `repository` is still needed here - it tells AllRepositoriesCard
    // which card to mark "Current". branches/artifacts/workflows backed the
    // removed Repository Statistics card; still fetched by the shared hook
    // (Deploy needs them too) but no longer read on this page.
    //
    // Deliberately NOT blocking the page on `loading` here anymore - this
    // hook's loading starts true and only clears once AuthContext's own
    // bootstrap check resolves, so gating the whole Dashboard behind it
    // meant the page title and every card's own shell sat behind a blank
    // spinner for a full network round trip. Each card already manages its
    // own loading/empty state independently (AllRepositoriesCard,
    // AwsServicesCard, EnvironmentsCard all gate their own fetch on
    // githubTokenConfigured themselves) - none of them actually needed this
    // page-level gate to behave correctly, only to paint later than they
    // had to.
    const { repository, error } = useGithubResources({ includeRepository: true });

    return (

        <PageLayout title="Overview">

            {

                error &&

                <div className="error-message">

                    {error}

                </div>

            }

            <AllRepositoriesCard repository={repository}>
                <AzureDevOpsCard />
            </AllRepositoriesCard>

            <br />

            <CloudServicesCard />

            <br />

            <PaasSummaryCard />

            <br />

            <ContainerRegistrySummaryCard />

            <br />

            <ObservabilitySummaryCard />

            <br />

            <EnvironmentsCard />

            <br />

            <QuickAccessCard />

        </PageLayout>

    );

}
