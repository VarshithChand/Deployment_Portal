import { logout as logoutRequest } from "../services/authService";
import { clearMySettings } from "../services/settingsService";
import { clearPortalLocked } from "./portalLock";

// The periodic "stay or sign out" prompt's Sign Out path (see
// PeriodicSignOutMonitor) - clears every credential this browser has
// saved (GitHub + AWS/Azure/GCP, same scope as Settings' own "Clear All
// Data" for a non-admin) and, if this session also happens to be OAuth-
// logged-in, ends that too. Distinct from utils/performLogout.js: that
// one just ends a session (nothing is lost, reconnecting isn't needed) -
// this one is a real data clear, same as the admin's soft Sign Out but
// self-triggered and full-scope rather than just the GitHub token.
export default async function performSelfClear() {

    // Otherwise the screen-lock flag (see utils/portalLock) survives the
    // reload below - PeriodicSignOutMonitor reads it as its initial state
    // on remount and immediately re-locks the screen with PinLockScreen,
    // even though the clear and redirect both actually succeeded. This is
    // what made "Forgot your PIN? Clear all saved credentials instead"
    // look stuck on the lock screen instead of landing on the dashboard.
    clearPortalLocked();

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
