import { logout as logoutRequest } from "../services/authService";

// Clears the auth cookie (a harmless no-op when there wasn't one - e.g. a
// PAT-only/Public view session was never OAuth-logged-in to begin with)
// then forces a full navigation back to Dashboard, so nothing already
// rendered on screen survives. Used by GlobalLogoutMonitor (a pipeline
// run, or an admin's force-logout, signaling this session to sign out) -
// unlike utils/performSelfClear.js, this never clears any saved
// credentials, since neither of those situations means anything was
// actually lost. `reason` is carried as a query param so AuthContext can
// toast a specific explanation after the reload.
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
