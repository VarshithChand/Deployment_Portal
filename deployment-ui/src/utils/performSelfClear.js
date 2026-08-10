import { logout as logoutRequest } from "../services/authService";
import { clearMySettings } from "../services/settingsService";

// The periodic "stay or sign out" prompt's Sign Out path (see
// PeriodicSignOutMonitor) - clears every credential this browser has
// saved (GitHub + AWS/Azure/GCP, same scope as Settings' own "Clear All
// Data" for a non-admin) and, if this session also happens to be OAuth-
// logged-in, ends that too. Distinct from utils/performLogout.js: that
// one just ends a session (nothing is lost, reconnecting isn't needed) -
// this one is a real data clear, same as the admin's soft Sign Out but
// self-triggered and full-scope rather than just the GitHub token.
export default async function performSelfClear() {

    try {
        await clearMySettings();
    }
    catch (err) {
        console.error(err);
    }

    try {
        await logoutRequest();
    }
    catch (err) {
        console.error(err);
    }

    const url = new URL(window.location.href);
    url.searchParams.set("tab", "dashboard");
    url.searchParams.delete("view");
    url.searchParams.set("loggedOut", "cleared");

    window.location.href = url.toString();

}
