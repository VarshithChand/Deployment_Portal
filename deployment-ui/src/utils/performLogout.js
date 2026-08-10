import { logout as logoutRequest } from "../services/authService";

// Clears the auth cookie (a harmless no-op when there wasn't one - e.g. a
// PAT-only/Public view session was never OAuth-logged-in to begin with)
// then forces a full navigation back to Dashboard, so nothing already
// rendered on screen survives. Shared by IdleLogoutMonitor (inactivity/
// backgrounding) and GlobalLogoutMonitor (a pipeline run signaling every
// session to sign out) - both want the same clean-slate landing that
// Settings' own "Clear All Data" uses. `reason` is carried as a query
// param so AuthContext can toast a specific explanation after the reload.
export default async function performLogout(reason) {

    try {
        await logoutRequest();
    }
    finally {

        const url = new URL(window.location.href);
        url.searchParams.set("tab", "dashboard");
        url.searchParams.delete("view");

        if (reason) url.searchParams.set("loggedOut", reason);

        window.location.href = url.toString();

    }

}
