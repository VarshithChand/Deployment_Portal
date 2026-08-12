import { useState } from "react";

import { forceAppRefreshForAllUsers } from "../../services/appVersionService";
import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";

// Services -> Application Support, admin-only (moved here from Settings -
// this and every other version/cache concern now live in one place).
// Bumps the portal-wide version counter every visitor's browser polls (see
// AppUpdateMonitor.jsx), prompting all of them onto the latest deployed
// frontend build. Self-contained (own state/API call) since nothing else
// on the page needs to know about it.
export default function AppCacheControlCard() {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();
    const [clearing, setClearing] = useState(false);

    async function handleForceRefresh() {

        if (!(await confirm({
            title: "Force a refresh for all users?",
            message:
                "Every visitor currently using the portal will be prompted to refresh onto the " +
                "latest deployed build, the next time their browser checks in (within about 30 " +
                "seconds). Anyone with unsaved work in a form should be given a chance to finish " +
                "first.",
            confirmLabel: "Force Refresh",
            danger: false
        }))) {
            return;
        }

        try {

            setClearing(true);

            const result = await forceAppRefreshForAllUsers();

            toast.show(
                `Application version ${result.version} is now active — every visitor will be prompted to refresh.`,
                "success"
            );

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to force a refresh.", "error");

        }
        finally {

            setClearing(false);

        }

    }

    return (

        <>

        {/* Rendered as a sibling of .card, not inside it - .card has its
            own backdrop-filter (this app's glass theme), and any ancestor
            with backdrop-filter/transform creates a new CSS containing
            block for position:fixed descendants. Nested inside .card, the
            confirm dialog's "fixed" backdrop was scoped to that card's own
            bounds instead of the viewport - trapped inside a small
            scrollable box instead of covering the page. */}
        {dialog}

        <div className="card">

            <h3 className="settings-subhead" style={{ marginTop: 0 }}>
                Force Refresh
            </h3>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Prompts every visitor to refresh onto the latest deployed frontend build, the next
                time their browser checks in — use this right after deploying so nobody stays on a
                stale build.
            </p>

            <button type="button" className="btn btn-primary" onClick={handleForceRefresh} disabled={clearing}>
                {clearing ? "Forcing Refresh..." : "Force Refresh For All Users"}
            </button>

        </div>

        </>

    );

}
