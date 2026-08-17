import { Component } from "react";

import { clearBrowserCaches } from "../../utils/appCacheManager";

// A browser tab left open across a frontend deploy still has the OLD
// index.html's module graph in memory - every page is lazy-loaded (see
// App.jsx's lazy(() => import(...)) calls), and this app rebuilds +
// republishes hashed asset filenames on every push, so clicking into a
// page whose chunk file has since been replaced throws a plain failed
// dynamic import, not a real bug in that page's own code. Recognized
// separately from a genuine render crash below: what actually fixes this
// is a real navigation reload (fetches the CURRENT index.html and its
// current chunk manifest - see appCacheManager.js's own reasoning for why
// a plain reload is sufficient here), not just clearing this boundary's
// component state - "Go to Dashboard" would just hit the very same stale
// chunk again on the next click, since it's still the same page load.
const CHUNK_LOAD_ERROR_PATTERN = /dynamically imported module|failed to fetch|loading chunk|importing a module script failed/i;

// Guards against a reload loop if a chunk is GENUINELY missing (a broken
// deploy, not just a stale tab) - sessionStorage so a fresh tab always
// gets its own attempt; cleared once App.jsx successfully mounts (see
// App.jsx), so a LATER deploy's staleness still gets exactly one more
// auto-reload rather than being silently blocked for the rest of this
// tab's lifetime after the first recovery.
const RELOAD_GUARD_KEY = "chunkErrorAutoReloaded";

function isChunkLoadError(error) {
    return CHUNK_LOAD_ERROR_PATTERN.test(String(error?.message || ""));
}

// Catches render/lifecycle errors thrown by whichever page is currently
// mounted, so a bug on one page shows a recoverable message instead of a
// blank white screen. Keyed by tab in App.jsx, so switching tabs remounts
// this fresh and clears any previous error automatically.
export default class ErrorBoundary extends Component {

    state = { hasError: false };

    static getDerivedStateFromError() {

        return { hasError: true };

    }

    componentDidCatch(error, info) {

        console.error("Page crashed:", error, info);

        if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_GUARD_KEY)) {

            sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
            clearBrowserCaches().finally(() => window.location.reload());

        }

    }

    render() {

        if (this.state.hasError) {

            return (

                <div className="main">

                    <div className="card">

                        <h2 className="card-title">
                            This page ran into a problem
                        </h2>

                        <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                            Something went wrong while rendering this page. You can go back to the
                            Dashboard and try again.
                        </p>

                        <button type="button" className="btn btn-primary" onClick={this.props.onRecover}>
                            Go to Dashboard
                        </button>

                    </div>

                </div>

            );

        }

        return this.props.children;

    }

}
