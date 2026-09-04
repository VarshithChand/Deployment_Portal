// Pings the backend API's health endpoint on a schedule, so Render's free
// tier (which spins deployment-portal-sec0 down after ~15 minutes idle,
// then pays a 15-60s cold start on the next real request) never actually
// goes that long without traffic - the same job .github/workflows/
// keep-alive.yml already does, moved here because that one turned out to
// be unreliable: GitHub's own scheduled-workflow trigger is documented as
// best-effort and, checked via `gh run list`, was observed firing every
// 2-4.5 hours instead of the configured 10 minutes - nowhere near tight
// enough to prevent the spin-down it was meant to prevent. Cloudflare Cron
// Triggers don't have that same best-effort caveat, and this Worker
// already runs the frontend, so no new hosting/account is needed.
//
// The GitHub Actions version is left in place as a redundant backup
// (harmless extra pings) rather than removed - see that file's own
// comment.
const BACKEND_HEALTH_URL = "https://deployment-portal-sec0.onrender.com/api/health";

export default {

    // Every normal page/asset request is already served directly by
    // Cloudflare's static-assets layer without ever reaching this Worker
    // (assets.run_worker_first defaults to false, unchanged here) - this
    // fetch handler is only a defensive fallback for the (currently
    // unreachable) case where a request does get routed here, so the site
    // keeps working instead of erroring if that default is ever changed.
    async fetch(request, env) {
        return env.ASSETS.fetch(request);
    },

    async scheduled(controller, env, ctx) {

        try {

            const response = await fetch(BACKEND_HEALTH_URL);
            console.log(`Keep-alive ping: HTTP ${response.status}`);

        }
        catch (error) {

            console.error("Keep-alive ping failed:", error.message);
            // A single missed ping isn't worth Cloudflare's automatic
            // retry machinery - the next scheduled run in 10 minutes is
            // itself the retry, same as this job's whole reason for
            // existing (staying under Render's 15-minute idle window).
            controller.noRetry();

        }

    }

};
