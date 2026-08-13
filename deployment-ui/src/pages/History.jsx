import { useState } from "react";
import usePolling from "../hooks/usePolling";
import { getWorkflowRuns } from "../services/historyService";
import HistoryTable from "../components/HistoryTable";
import LoadingSpinner from "../components/LoadingSpinner";
import RequireRepoSelected from "../components/RequireRepoSelected";
import PageLayout from "../components/layout/PageLayout";

export default function History() {

    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    async function loadHistory() {

        try {

            setError("");

            const data = await getWorkflowRuns();

            console.log("Workflow Runs:", data);

            if (Array.isArray(data)) {

                setRuns(data);

            } else {

                console.warn("Unexpected response:", data);

                setRuns([]);

            }

        }
        catch (err) {

            console.error(err);

            setError("Unable to load deployment history.");

            setRuns([]);

        }
        finally {

            setLoading(false);

        }

    }

    // 20s, not 5s — GitHub's anonymous rate limit is only 60 requests/hour,
    // and this polls continuously for as long as the History page stays open.
    usePolling(loadHistory, 20000);

    if (loading) {

        return <LoadingSpinner />;

    }

    return (

        <PageLayout title="Deployment History">

            <RequireRepoSelected>

                {error && (

                    <div className="error-message">

                        {error}

                    </div>

                )}

                <HistoryTable runs={runs} />

            </RequireRepoSelected>

        </PageLayout>

    );

}