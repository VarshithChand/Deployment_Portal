import { useEffect } from "react";

// The login page's "FAQ" tool (see LoginSignupPage's toolsMenu) - every
// answer here matches a real, already-shipped feature elsewhere in this
// app (grep the linked file/component before trusting an answer if it
// ever needs updating), not aspirational or invented behavior. Uses the
// native <details>/<summary> disclosure widget for expand/collapse - no
// JS state needed for something this simple.
const FAQS = [
    {
        q: "How do I get access?",
        a: "Access is invite-only. Sign up with your email, and an admin adds it to the allowlist — sign-in only succeeds once your email is on that list, whether you used a password, Google, or GitHub to sign in."
    },
    {
        q: "What sign-in methods are supported?",
        a: "Email/password, \"Continue with Google\", and \"Continue with GitHub\". Signing in a second way with the same email links to the same account instead of creating a duplicate."
    },
    {
        q: "Is multi-factor authentication required?",
        a: "Yes, for every account, enforced server-side. New accounts set up MFA immediately after their first sign-in, before reaching anything else."
    },
    {
        q: "What happens if I lose access to my authenticator app?",
        a: "Use a recovery code if you saved one, or request a one-time email code from the MFA screen as an alternate verification method."
    },
    {
        q: "I forgot my password — what do I do?",
        a: "Use \"Forgot Password?\" on the sign-in form. You'll get a one-time code by email; verifying it lets you set a new password. If your account only ever signed in through Google or GitHub, there's a \"Set Password\" option in Settings once you're signed in, so you can add one for the first time."
    },
    {
        q: "Are my cloud credentials and tokens stored securely?",
        a: "Yes — AWS/Azure/GCP credentials, registry tokens, and API keys are encrypted before they're stored, never kept as plain text."
    },
    {
        q: "What's the difference between Admin and Viewer?",
        a: "Admin and Viewer roles are enforced on every request, server-side. Admins manage credentials, users, and settings; Viewers can see and use what they're granted, including scoped access to individual pages if an admin sets that up."
    },
    {
        q: "Can I use anything here without an account?",
        a: "Yes — the tools menu (bottom-right of this page) has External APIs, Template Tester, and a Portfolio page, none of which require signing in or save anything."
    }
];

export default function Faq() {

    useEffect(() => {

        const prevTitle = document.title;
        document.title = "FAQ | Deployment Portal";

        return () => { document.title = prevTitle; };

    }, []);

    return (

        <div className="card">

            <h1 className="card-title">Frequently Asked Questions</h1>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Answers below match how sign-in, MFA, and access actually work in this app right now.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {FAQS.map((item) => (
                    <details key={item.q} className="settings-subsection" style={{ margin: 0 }}>
                        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>{item.q}</summary>
                        <p className="field-hint" style={{ marginTop: 8 }}>{item.a}</p>
                    </details>
                ))}
            </div>

        </div>

    );

}
