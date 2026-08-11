import { useEffect, useRef, useState } from "react";

import usePolling from "../../hooks/usePolling";
import useAuth from "../../hooks/useAuth";
import { getRecentActivity } from "../../services/activityService";

const LAST_SEEN_KEY = "activity-last-seen";

// Small bell glyph built only from a polygon (straight lines) and a
// circle — matching the sidebar icon discipline of never hand-authoring
// curved SVG path data, which has been a real source of garbled icons
// elsewhere in this app.
function BellIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <polygon
                points="9,3 13,6.5 13,11 14.5,13 3.5,13 5,11 5,6.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
            />
            <circle cx="9" cy="15.2" r="1.2" stroke="currentColor" strokeWidth="1.4" />
        </svg>
    );
}

// Recent commits + workflow runs, merged server-side into one feed. Unread
// tracking is a simple "newer than the last time this was opened" compare
// against a timestamp kept in localStorage — no backend read-state needed,
// and it survives reloads (unlike plain in-memory state).
export default function ActivityBell() {

    const { githubRepoConfigured } = useAuth();

    const [events, setEvents] = useState([]);
    const [open, setOpen] = useState(false);
    const [lastSeen, setLastSeen] = useState(() => localStorage.getItem(LAST_SEEN_KEY) || "");
    const containerRef = useRef(null);

    async function load() {

        // The bell lives in TopBar, mounted app-wide — including behind
        // RequireGitHubSetup's popup before a repo is even connected,
        // where "recent commits + workflow runs" has nothing to fetch
        // yet anyway.
        if (!githubRepoConfigured) {
            return;
        }

        try {

            const response = await getRecentActivity();
            setEvents(Array.isArray(response.data) ? response.data : []);

        }
        catch (err) {

            console.error(err);

        }

    }

    usePolling(load, 30000);

    useEffect(() => {

        function handleClickOutside(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);

    }, []);

    function toggleOpen() {

        const next = !open;
        setOpen(next);

        if (next && events.length > 0) {
            const newest = events[0].timestamp;
            localStorage.setItem(LAST_SEEN_KEY, newest);
            setLastSeen(newest);
        }

    }

    const unreadCount = lastSeen
        ? events.filter((e) => new Date(e.timestamp) > new Date(lastSeen)).length
        : events.length > 0 ? events.length : 0;

    return (

        <div className="activity-bell" ref={containerRef}>

            <button
                type="button"
                className="activity-bell-trigger"
                onClick={toggleOpen}
                title="Recent activity"
                aria-label="Recent activity"
            >
                <BellIcon />
                {unreadCount > 0 && (
                    <span className="activity-bell-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
                )}
            </button>

            {open && (

                <div className="activity-bell-panel">

                    <div className="activity-bell-panel-title">Recent Activity</div>

                    {events.length === 0 ? (

                        <p className="activity-bell-empty">Nothing recent.</p>

                    ) : (

                        <ul className="activity-bell-list">

                            {events.map((e, i) => (

                                <li key={`${e.type}-${e.htmlUrl}-${i}`}>
                                    <a href={e.htmlUrl} target="_blank" rel="noreferrer">
                                        <span className={`badge ${e.type === "commit" ? "badge-secondary" : "badge-info"}`}>
                                            {e.type === "commit" ? "commit" : e.detail || "workflow"}
                                        </span>
                                        <span className="activity-bell-item-title">{e.title}</span>
                                        <span className="activity-bell-item-meta">
                                            {e.actor} &middot; {new Date(e.timestamp).toLocaleString()}
                                        </span>
                                    </a>
                                </li>

                            ))}

                        </ul>

                    )}

                </div>

            )}

        </div>

    );

}
