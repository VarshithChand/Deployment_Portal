import { logout as logoutRequest } from "../services/authService";
import { signOutMyGitHub } from "../services/settingsService";

// The non-destructive "sign out" every self-service path in this app now
// uses (Settings' Danger Zone for a non-admin, PeriodicSignOutMonitor's
// 30-minute true-idle timeout) - clears the OAuth cookie if this session
// ever had one (a harmless no-op for a PAT-only session, same as
// performLogout.js), AND soft-signs-out the PAT connection itself
// (signOutMyGitHub - see SoftSignOutPatUserAsync) so githubTokenConfigured
// reads false afterward. Neither call deletes anything - the token and
// every AWS/Azure/GCP credential tied to it are left exactly as they
// were, ready the moment the same token is entered again. `reason` is
// carried as a query param so AuthContext can toast a specific
// explanation after the reload, same convention performLogout.js uses.
export default async function performSignOut(reason) {

    try {
        await Promise.allSettled([logoutRequest(), signOutMyGitHub()]);
    }
    finally {

        const url = new URL(window.location.origin);

        if (reason) url.searchParams.set("loggedOut", reason);

        window.location.href = url.toString();

    }

}
