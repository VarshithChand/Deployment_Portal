import { useState } from "react";

import useToast from "../../hooks/useToast";
import { inviteCollaborator } from "../../services/accessService";
import { availableLevels, levelInfo } from "./permissionLevels";

// Embedded inline panel (no outer .card of its own) — lives inside the
// Access Levels page, toggled open by its "+ Invite" button, rather than
// being a separate Settings hub tile/page. isOrganization is fetched once
// by the parent (Access Levels) rather than duplicated here.
export default function InviteCollaborator({ onInvited, isOrganization }) {

    const toast = useToast();
    const levels = availableLevels(isOrganization);

    const [username, setUsername] = useState("");
    const [permission, setPermission] = useState("push");
    const [inviting, setInviting] = useState(false);

    async function handleInvite() {

        const trimmed = username.trim();

        if (!trimmed) {
            toast.show("Enter a GitHub username to invite.", "error");
            return;
        }

        try {

            setInviting(true);

            await inviteCollaborator(trimmed, permission);
            setUsername("");

            toast.show(
                `Invited ${trimmed} as ${levelInfo(permission).label}. They'll show up below as "Pending" until they accept.`,
                "success"
            );

            onInvited?.();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Failed to invite ${trimmed}.`, "error");

        }
        finally {

            setInviting(false);

        }

    }

    return (

        <div className="access-invite-panel">

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Give a GitHub account access to this repository. GitHub emails them an invitation
                automatically — nothing further to send from here.
            </p>

            <div className="access-level-legend">

                {levels.map((level) => (

                    <div key={level.value} className="access-level-legend-item">
                        <span className={`badge ${level.badge}`}>{level.label}</span>
                        <span>{level.description}</span>
                    </div>

                ))}

            </div>

            {!isOrganization && (
                <p className="field-hint">
                    Triage and Maintain aren't offered — GitHub only supports those on
                    organization-owned repositories, and this one is personal.
                </p>
            )}

            <div className="form-group">

                <label htmlFor="invite-github-username">GitHub username</label>

                <div className="access-invite-controls">

                    <input
                        id="invite-github-username"
                        type="text"
                        className="form-control"
                        placeholder="GitHub username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                        autoComplete="off"
                        autoFocus
                    />

                    <select
                        className="form-control access-permission-select"
                        value={permission}
                        onChange={(e) => setPermission(e.target.value)}
                    >
                        {levels.map((level) => (
                            <option key={level.value} value={level.value}>{level.label}</option>
                        ))}
                    </select>

                    <button type="button" className="btn btn-primary" onClick={handleInvite} disabled={inviting}>
                        {inviting ? "Inviting..." : "Invite"}
                    </button>

                </div>

            </div>

        </div>

    );

}
