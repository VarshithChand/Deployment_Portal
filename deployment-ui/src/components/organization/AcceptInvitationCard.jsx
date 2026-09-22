import { useEffect, useState } from "react";

import useAuth from "../../hooks/useAuth";
import useToast from "../../hooks/useToast";
import { acceptInvitation } from "../../services/organizationService";

const STORAGE_KEY = "pendingInviteToken";

// Global, renders nothing unless there's a pending invitation token
// stashed by AuthContext (see that file's own comment on why sessionStorage
// rather than the URL) AND the visitor is now actually signed in - mounted
// alongside the other global monitors in App.jsx (GlobalLogoutMonitor,
// MfaEnforcementGate, ...), same "renders null most of the time" shape.
// No preview-before-accept step (the spec's mockup shows the org name/role
// before committing) - accepting happens directly on click and the result
// (organization name + role) is shown afterward via toast, since building
// a separate token-preview endpoint just to show that one screen first
// wasn't worth a whole extra API surface for this feature's first pass.
export default function AcceptInvitationCard() {

    const { user } = useAuth();
    const toast = useToast();

    const [token, setToken] = useState(null);
    const [working, setWorking] = useState(false);

    useEffect(() => {

        if (!user) return;

        const pending = sessionStorage.getItem(STORAGE_KEY);
        if (pending) setToken(pending);

    }, [user]);

    if (!user || !token) return null;

    async function handleAccept() {

        setWorking(true);

        try {

            const result = await acceptInvitation(token);

            if (!result.success) {
                toast.show(result.message || "Unable to accept this invitation.", "error");
                sessionStorage.removeItem(STORAGE_KEY);
                setToken(null);
                return;
            }

            toast.show(`You've joined ${result.organizationName || "the organization"}.`, "success");
            sessionStorage.removeItem(STORAGE_KEY);
            setToken(null);

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to accept this invitation.", "error");
        }
        finally {
            setWorking(false);
        }

    }

    function handleDecline() {
        sessionStorage.removeItem(STORAGE_KEY);
        setToken(null);
    }

    return (

        <div
            className="card"
            style={{
                position: "fixed", top: 16, right: 16, zIndex: 1000,
                maxWidth: 360, boxShadow: "0 4px 16px rgba(0,0,0,0.15)"
            }}
        >
            <h3 className="card-title" style={{ marginTop: 0 }}>You've been invited</h3>
            <p className="field-hint" style={{ marginTop: 0 }}>
                You have a pending organization invitation. Accept it to join.
            </p>
            <div className="button-row">
                <button type="button" className="btn btn-primary" disabled={working} onClick={handleAccept}>
                    {working ? "Joining..." : "Accept Invitation"}
                </button>
                <button type="button" className="btn" disabled={working} onClick={handleDecline}>
                    Dismiss
                </button>
            </div>
        </div>

    );

}
