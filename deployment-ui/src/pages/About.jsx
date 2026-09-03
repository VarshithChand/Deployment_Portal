import { useEffect } from "react";
import { ShieldCheck, KeyRound, Server, GitBranch, Boxes, Users } from "lucide-react";

// The login page's "About" tool (see LoginSignupPage's toolsMenu) -
// explains what Deployment Portal actually is, reachable without an
// account. No login-flow logic here, no backend calls - a static
// description of real, already-shipped functionality (every claim below
// matches an actual feature elsewhere in this app), not marketing copy
// for something aspirational.
const CAPABILITIES = [
    {
        icon: GitBranch,
        title: "One console for every deployment",
        body: "Trigger, watch, and approve GitHub Actions workflows across environments — build, promote, and release from one place instead of switching between GitHub, cloud consoles, and registry dashboards."
    },
    {
        icon: Boxes,
        title: "Multi-cloud, built in",
        body: "AWS, Azure, and GCP service management, container registries, and Docker-based deployments are all reachable from the same portal, under your own connected credentials."
    },
    {
        icon: ShieldCheck,
        title: "Security by default",
        body: "Every account signs in through email/password, Google OAuth, or GitHub OAuth, then completes mandatory TOTP multi-factor authentication before reaching anything else."
    },
    {
        icon: KeyRound,
        title: "Credentials encrypted at rest",
        body: "Cloud keys, registry tokens, and API credentials are encrypted before they're stored, not kept as plain text in a database row."
    },
    {
        icon: Users,
        title: "Role-based access",
        body: "Admin and Viewer roles are enforced server-side on every request, with granular per-page permissions for anyone who needs access to just one section."
    },
    {
        icon: Server,
        title: "Audit logging",
        body: "Settings changes and admin actions are recorded, so what changed and when is never a guess."
    }
];

// onOpenTool(mode) - passed down from LoginSignupPage's own openTool, so
// the "Built by..." link can jump straight to the Portfolio tool without
// this component needing its own copy of the URL-sync logic that lives
// there.
export default function About({ onOpenTool }) {

    useEffect(() => {

        const prevTitle = document.title;
        document.title = "About | Deployment Portal";

        return () => { document.title = prevTitle; };

    }, []);

    return (

        <div className="card">

            <h1 className="card-title">About Deployment Portal</h1>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Deployment Portal is an internal CI/CD console — one place to trigger, monitor, and
                approve GitHub Actions workflows across environments instead of hopping between
                GitHub, cloud provider consoles, and registry dashboards separately. It brings
                GitHub Actions, AWS, Azure, GCP, and a dozen registries under one login, with
                role-based access, mandatory MFA, and an audit trail behind every action.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginTop: 6 }}>
                {CAPABILITIES.map((cap) => (
                    <div key={cap.title} className="settings-subsection" style={{ margin: 0 }}>
                        <h3 className="settings-subhead" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <cap.icon size={16} /> {cap.title}
                        </h3>
                        <p className="field-hint" style={{ margin: 0 }}>{cap.body}</p>
                    </div>
                ))}
            </div>

            <p className="empty-state" style={{ padding: "20px 0 0", textAlign: "left" }}>
                Built by{" "}
                <button
                    type="button"
                    className="token-help-link"
                    style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", font: "inherit" }}
                    onClick={() => onOpenTool?.("portfolio")}
                >
                    Varshith Chand Vuyyuru
                </button>. Access is invite-only — ask an admin to add your email to the allowlist
                if you need an account.
            </p>

        </div>

    );

}
