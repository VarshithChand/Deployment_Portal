import { useEffect, useState } from "react";

import useAuth from "../../hooks/useAuth";
import useNavigation from "../../hooks/useNavigation";
import usePolling from "../../hooks/usePolling";
import { getPendingApprovals } from "../../services/approvalsService";

// The Dashboard's "what's waiting on me" panel - pending release
// approvals (Approvals.jsx's own "pending" list, same endpoint/gating)
// surfaced here so it's visible at a glance instead of only on its own
// page. Genuinely a new fetch (not one of Dashboard's shared/deduped
// hooks) since nothing else on this page already pulls this data - kept
// to the same 20s poll cadence Approvals.jsx uses, and the same
// canApproveReleases gate, so a Viewer with no approval rights just sees
// nothing here instead of a 403.
export default function BlockersSummaryCard() {

    const { canApproveReleases } = useAuth();
    const { setTab } = useNavigation();

    const [pending, setPending] = useState([]);
    const [loading, setLoading] = useState(true);

    async function load() {

        if (!canApproveReleases) {
            setLoading(false);
            return;
        }

        try {

            const response = await getPendingApprovals();
            setPending(Array.isArray(response.data) ? response.data : []);

        }
        catch (err) {

            console.error(err);

        }
        finally {

            setLoading(false);

        }

    }

    usePolling(load, 20000);

    useEffect(() => {

        if (canApproveReleases) load();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canApproveReleases]);

    if (!canApproveReleases || loading) {
        return null;
    }

    return (

        <div className="card">

            <h2 className="card-title">
                Blockers
                {pending.length > 0 && (
                    <span className="badge badge-warning" style={{ marginLeft: "8px" }}>{pending.length}</span>
                )}
            </h2>

            {pending.length === 0 ? (

                <p className="empty-state">Nothing waiting on approval.</p>

            ) : (

                <ul className="dash-mini-list">

                    {pending.map((item) => (

                        <li key={item.runId} className="dash-mini-list-row">

                            <button
                                type="button"
                                className="dash-mini-list-link"
                                onClick={() => setTab("approvals")}
                            >
                                <span className="dash-mini-list-title">{item.workflowName}</span>
                                <span className="dash-mini-list-sub">
                                    {item.branch} &middot; {item.triggeredBy}
                                    {item.environments?.length > 0 && ` → ${item.environments.map((e) => e.name).join(", ")}`}
                                </span>
                            </button>

                        </li>

                    ))}

                </ul>

            )}

        </div>

    );

}
