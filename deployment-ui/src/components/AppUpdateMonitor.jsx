import { useState } from "react";

import { getAppVersion } from "../services/appVersionService";
import { getLocalAppVersion, setLocalAppVersion, applyUpdateAndReload } from "../utils/appCacheManager";
import usePolling from "../hooks/usePolling";

const POLL_MS = 30000;

// Prompts a refresh once an admin has deployed a new frontend build and
// forced it (see Settings hub's "Force Refresh For All Users" -
// AppVersionController.ClearCache). Cloudflare Workers has no server-push
// of its own for a plain static site, so this polls a small version
// counter instead - every visitor's browser picks up the bump within
// POLL_MS regardless of which tab/page they're on, including the pre-
// login "connect your repo" gate (mounted outside RequireGitHubSetup in
// App.jsx, same placement as PeriodicSignOutMonitor).
export default function AppUpdateMonitor() {

    const [availableVersion, setAvailableVersion] = useState(null);

    async function checkVersion() {

        try {

            const { version } = await getAppVersion();
            const local = getLocalAppVersion();

            // First time this browser has ever checked - just record the
            // current version as a baseline rather than showing a popup
            // for a "new version" that's simply the one already loaded.
            if (local === null) {
                setLocalAppVersion(version);
                return;
            }

            if (Number(version) > Number(local)) {
                setAvailableVersion(version);
            }

        }
        catch (err) {
            console.error(err);
        }

    }

    usePolling(checkVersion, POLL_MS);

    if (!availableVersion) {
        return null;
    }

    return (

        <div className="dialog-backdrop" role="presentation">

            <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-update-title">

                <h2 id="app-update-title">
                    Application Updated
                </h2>

                <p>
                    A new version of the Deployment Portal is available.
                </p>

                <p>
                    Refresh now to get the latest version, or keep working and refresh later —
                    you'll be reminded again.
                </p>

                <div>

                    <button
                        type="button"
                        className="btn btn-success"
                        onClick={() => applyUpdateAndReload(availableVersion)}
                        autoFocus
                    >
                        Refresh Now
                    </button>

                    <button type="button" className="btn btn-secondary" onClick={() => setAvailableVersion(null)}>
                        Later
                    </button>

                </div>

            </div>

        </div>

    );

}
