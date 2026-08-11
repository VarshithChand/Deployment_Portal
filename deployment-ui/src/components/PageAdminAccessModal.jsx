import { useEffect, useMemo, useState } from "react";

import { getPatUsers, getPageAdminGrants, grantPageAdmin, revokePageAdmin } from "../services/settingsService";
import useToast from "../hooks/useToast";

// Opened from the "Page Access" button each admin-gated page renders (see
// PageAdminAccessButton) — grants a searched-up PAT user's GitHub login
// admin authority for just THIS page's actions (see AdminGate's pageKey /
// SettingsService.PageAdminGrants), without adding them to the full admin
// allowlist. Unrelated to Block/Unblock (Services page) or Sidebar Access —
// three independent mechanisms that happen to share the same "pick a PAT
// user" search list.
export default function PageAdminAccessModal({ pageKey, pageLabel, onClose }) {

    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [patUsers, setPatUsers] = useState([]);
    const [grantedLogins, setGrantedLogins] = useState([]);
    const [query, setQuery] = useState("");
    const [busyLogin, setBusyLogin] = useState(null);

    useEffect(() => {

        let cancelled = false;

        setLoading(true);

        Promise.all([getPatUsers(), getPageAdminGrants()])
            .then(([users, grants]) => {

                if (cancelled) return;

                setPatUsers(users || []);
                setGrantedLogins(grants?.[pageKey] || []);

            })
            .catch((err) => {

                console.error(err);
                if (!cancelled) toast.show("Failed to load PAT users or page access.", "error");

            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageKey]);

    // Real GitHub identities only — an unresolvable token has no login to
    // grant against, and would never match anything AdminGate checks.
    const searchableUsers = useMemo(
        () => patUsers.filter((u) => u.patOwnerLogin && !u.patOwnerLogin.startsWith("Unknown")),
        [patUsers]
    );

    const results = useMemo(() => {

        const q = query.trim().toLowerCase();
        if (!q) return [];

        return searchableUsers
            .filter((u) =>
                u.patOwnerLogin.toLowerCase().includes(q) ||
                `${u.owner}/${u.repository}`.toLowerCase().includes(q)
            )
            .filter((u) => !grantedLogins.some((g) => g.toLowerCase() === u.patOwnerLogin.toLowerCase()))
            .slice(0, 8);

    }, [query, searchableUsers, grantedLogins]);

    async function handleGrant(login) {

        try {

            setBusyLogin(login);

            const updated = await grantPageAdmin(pageKey, login);
            setGrantedLogins(updated || []);
            setQuery("");

            toast.show(`Granted @${login} admin access to ${pageLabel}.`, "success");

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to grant access.", "error");

        }
        finally {

            setBusyLogin(null);

        }

    }

    async function handleRevoke(login) {

        try {

            setBusyLogin(login);

            const updated = await revokePageAdmin(pageKey, login);
            setGrantedLogins(updated || []);

            toast.show(`Revoked @${login}'s access to ${pageLabel}.`, "success");

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to revoke access.", "error");

        }
        finally {

            setBusyLogin(null);

        }

    }

    return (

        <div
            className="dialog-backdrop"
            role="presentation"
            onClick={onClose}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        >

            <div
                className="dialog"
                role="presentation"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
            >

                <h2>Page Access — {pageLabel}</h2>
                <p className="field-hint" style={{ marginTop: 0 }}>
                    Grant a PAT user admin authority for just this page, without adding them
                    to the full Admin Allowlist. They keep whatever access they already have
                    everywhere else — this only unlocks {pageLabel}'s admin actions.
                </p>

                {loading ? (

                    <p className="field-hint">Loading...</p>

                ) : (

                    <>

                        <div className="form-group">
                            <label htmlFor="page-admin-search">Search PAT users</label>
                            <input
                                id="page-admin-search"
                                type="text"
                                className="form-control"
                                placeholder="GitHub username or owner/repo"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                autoComplete="off"
                            />
                        </div>

                        {query.trim() && (

                            <div className="page-admin-results">

                                {results.length === 0 ? (
                                    <p className="field-hint">No matching PAT user found.</p>
                                ) : (
                                    results.map((u) => (
                                        <button
                                            key={u.key}
                                            type="button"
                                            className="page-admin-result-row"
                                            disabled={busyLogin === u.patOwnerLogin}
                                            onClick={() => handleGrant(u.patOwnerLogin)}
                                        >
                                            <span>@{u.patOwnerLogin}</span>
                                            <span className="field-hint">{u.owner}/{u.repository}</span>
                                            <span className="btn btn-success btn-sm">Grant</span>
                                        </button>
                                    ))
                                )}

                            </div>

                        )}

                        <h3 style={{ marginTop: "20px" }}>Currently granted</h3>

                        {grantedLogins.length === 0 ? (

                            <p className="field-hint">Nobody has scoped access to {pageLabel} yet.</p>

                        ) : (

                            <ul className="page-admin-grant-list">

                                {grantedLogins.map((login) => (

                                    <li key={login}>

                                        <span>@{login}</span>

                                        <button
                                            type="button"
                                            className="btn btn-danger btn-sm"
                                            disabled={busyLogin === login}
                                            onClick={() => handleRevoke(login)}
                                        >
                                            {busyLogin === login ? "..." : "Revoke"}
                                        </button>

                                    </li>

                                ))}

                            </ul>

                        )}

                    </>

                )}

                <div>
                    <button type="button" className="btn" onClick={onClose}>
                        Close
                    </button>
                </div>

            </div>

        </div>

    );

}
