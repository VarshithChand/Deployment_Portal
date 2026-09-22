import { useState } from "react";

import useToast from "../../../hooks/useToast";
import { sendInvitation } from "../../../services/organizationService";

// Inline expand-to-form, matching AccountView's own "Edit Profile" toggle
// convention rather than a separate modal dialog component - same house
// style, one less new UI pattern introduced for this feature.
export default function InviteMemberForm({ orgId, onSent }) {

    const toast = useToast();

    const [expanded, setExpanded] = useState(false);
    const [email, setEmail] = useState("");
    const [roleKey, setRoleKey] = useState("contributor");
    const [sending, setSending] = useState(false);

    async function handleSubmit(e) {

        e.preventDefault();
        setSending(true);

        try {

            const result = await sendInvitation(orgId, { email, roleKey });

            if (!result.success) {
                toast.show(result.message || "Unable to send invitation.", "error");
                return;
            }

            toast.show(`Invitation sent to ${email}.`, "success");
            setEmail("");
            setRoleKey("contributor");
            setExpanded(false);
            onSent?.();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to send invitation.", "error");
        }
        finally {
            setSending(false);
        }

    }

    if (!expanded) {

        return (
            <button type="button" className="btn btn-primary" onClick={() => setExpanded(true)}>
                + Invite User
            </button>
        );

    }

    return (

        <form onSubmit={handleSubmit} className="settings-subsection">

            <div className="form-group">
                <label htmlFor="invite-email">Email</label>
                <input
                    id="invite-email"
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                />
            </div>

            <div className="form-group">
                <label htmlFor="invite-role">Role</label>
                <select
                    id="invite-role"
                    className="form-control"
                    value={roleKey}
                    onChange={(e) => setRoleKey(e.target.value)}
                >
                    <option value="admin">Admin</option>
                    <option value="contributor">Contributor</option>
                    <option value="read">Read</option>
                </select>
            </div>

            <div className="button-row">
                <button type="submit" className="btn btn-primary" disabled={sending}>
                    {sending ? "Sending..." : "Send Invitation"}
                </button>
                <button type="button" className="btn" disabled={sending} onClick={() => setExpanded(false)}>
                    Cancel
                </button>
            </div>

        </form>

    );

}
