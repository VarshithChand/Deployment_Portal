import { lazy, Suspense, useState } from "react";

import useAuth from "../hooks/useAuth";
import useTheme from "../hooks/useTheme";
import { skipMfaNudge } from "../services/settingsService";
import performSignOut from "../utils/performSignOut";
import Logo from "./common/Logo";
import AuthShowcasePanel from "./common/AuthShowcasePanel";
import { SunIcon, MoonIcon } from "./layout/SidebarIcons";

// A page reload lands here before any tool navigation state exists (this
// component is mounted at the app root, not inside LoginSignupPage), so
// "About"/"FAQ"/"Portfolio" on the shared showcase panel go through a real
// navigation - same reasoning, and the same helper shape, as
// MfaVerifyPage's own openToolViaNavigation.
function openToolViaNavigation(tool) {
    window.location.href = `/?tool=${tool}`;
}

// Lazy, not a normal import - this component is mounted eagerly in App.jsx
// (it has to be, to decide on every render whether to block the app), but
// MfaSection itself (and its qrcode dependency) previously only shipped in
// Settings' own already-lazy chunk. A plain import here would pull both
// into the MAIN bundle for every single visitor, even the vast majority
// who never see the nudge at all - undoing Round 8's "keep the initial
// bundle lean" work for a feature most page loads never render.
const MfaSection = lazy(() => import("./settings/credentials/MfaSection"));

// Server-driven MFA policy nudge/enforcement (see BootstrapController's
// MfaNudge block - every flag here is computed backend-side, never
// decided by this component). Three states:
//   - blocked: either (a) this account was just created (password signup
//     that just verified its email, or a first Google login) and has
//     never had a chance to enroll yet - blocked from the very first
//     bootstrap call, no skip budget at all (reason "mustSetUp" - see
//     PortalUserAccount.MustSetUpMfa/MfaPolicy) - or (b) this session has
//     an AWS/Azure/GCP credential saved (or an admin flagged it Required),
//     MFA isn't enabled yet, and the 2-skip budget is spent. Either way,
//     renders a full page in place of the app shell - same "renders
//     instead of children" precedent PinLockScreen already established for
//     the screen-lock PIN, and (for "mustSetUp" specifically) what makes
//     "register -> verify email -> MFA -> dashboard" a real server-
//     enforced sequence instead of a one-time frontend redirect a refresh
//     could quietly skip past. Its own Cancel button doesn't weaken that -
//     it signs the session out entirely rather than letting it through, so
//     the only way past this screen is still finishing real enrollment.
//   - show (not blocked): a small dismissible bottom banner. Free to
//     skip - "Skip" always succeeds, it just also feeds the skip counter
//     that eventually flips `blocked` once BOTH mandatory (a cloud
//     credential exists) and the budget's spent. Never reached for
//     "mustSetUp" - that reason is blocked immediately, with no nudge
//     phase at all.
//   - neither: renders nothing.
export default function MfaEnforcementGate() {

    const { mfaNudgeShow, mfaNudgeMandatory, mfaNudgeBlocked, mfaNudgeReason, refresh } = useAuth();
    const { theme, toggleTheme } = useTheme();

    const [dismissedForNow, setDismissedForNow] = useState(false);
    const [enrollOpen, setEnrollOpen] = useState(false);
    const [skipping, setSkipping] = useState(false);
    const [signingOut, setSigningOut] = useState(false);

    // Not a skip - performSignOut clears this session entirely (the same
    // sign-out Settings' own Danger Zone uses), landing back on the plain
    // login page. The account itself still needs MFA set up the next time
    // anyone signs into it (see MfaPolicy.EvaluateAsync) - this only lets
    // someone abandon a session they're stuck on (wrong account, no
    // authenticator app handy right now, etc.) instead of being trapped
    // behind this screen with no way out but closing the tab.
    async function handleCancel() {

        setSigningOut(true);
        await performSignOut();

    }

    async function handleSkip() {

        setSkipping(true);

        try {
            await skipMfaNudge();
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setSkipping(false);
        }

        setDismissedForNow(true);

        // Re-pulls mfaNudge from a fresh bootstrap call - if this was the
        // 2nd skip on a mandatory nudge, `blocked` flips true here and the
        // full-screen state below takes over on the next render,
        // regardless of dismissedForNow (that flag only suppresses the
        // small banner, never the block).
        refresh();

    }

    if (mfaNudgeBlocked) {

        const isRegistration = mfaNudgeReason === "mustSetUp";

        // Same aw-root/aw-split/AuthShowcasePanel shell LoginSignupPage and
        // MfaVerifyPage already share (see AuthShowcasePanel.jsx's own
        // comment) - this is really a third pre-dashboard gate in the same
        // family (a brand new account can't reach anything else until this
        // clears), so it gets the same treatment rather than the old
        // plain auth-page/auth-page-card look. position:fixed/zIndex still
        // overlays the app shell underneath, which is what makes clearing
        // the block below (onEnrolled -> refresh -> mfaNudgeBlocked turns
        // false) reveal the dashboard immediately, with no navigation of
        // its own - the dashboard was already mounted the whole time,
        // just covered.
        return (

            <div className="aw-root" style={{ position: "fixed", inset: 0, zIndex: 1200 }}>

                <div className="aw-split">

                    <AuthShowcasePanel onOpenTool={openToolViaNavigation} />

                    <main className="authcol">

                        <div className="auth-page-card" role="main" aria-labelledby="mfa-gate-title">

                            <button
                                type="button"
                                className="auth-theme-toggle"
                                onClick={toggleTheme}
                                title={theme === "dark" ? "Light mode" : "Dark mode"}
                                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                            >
                                {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                            </button>

                            <div className="auth-page-logo">
                                <Logo showEyebrow={false} compact size={34} />
                            </div>

                            <h1 id="mfa-gate-title" className="setup-gate-title">
                                {isRegistration ? "Secure your new account" : "Multi-Factor Authentication Required"}
                            </h1>

                            <p className="field-hint" style={{ textAlign: "center" }}>
                                {isRegistration
                                    ? "Set up multi-factor authentication to finish creating your account — this step can't be skipped."
                                    : "Your account has cloud credentials saved, which makes MFA mandatory for this portal. Finish enrolling below to continue — this screen won't go away until you do."}
                            </p>

                            <Suspense fallback={<p className="field-hint">Loading...</p>}>
                                <MfaSection onEnrolled={refresh} showCancelEnrollButton={false} />
                            </Suspense>

                            <div className="button-row" style={{ marginTop: 16, justifyContent: "center" }}>
                                <button type="button" className="btn" onClick={handleCancel} disabled={signingOut}>
                                    {signingOut ? "Signing out..." : "Cancel"}
                                </button>
                            </div>

                        </div>

                    </main>

                </div>

            </div>

        );

    }

    if (!mfaNudgeShow || dismissedForNow) {
        return null;
    }

    return (

        <>

        <div className="mfa-nudge-banner" role="status">

            <span>
                {mfaNudgeMandatory
                    ? "MFA is required for your account — set it up now to avoid losing access."
                    : "Protect your account by setting up multi-factor authentication."}
            </span>

            <div className="mfa-nudge-banner-actions">

                <button type="button" className="btn btn-sm btn-primary" onClick={() => setEnrollOpen(true)}>
                    Set Up Now
                </button>

                <button type="button" className="btn btn-sm" onClick={handleSkip} disabled={skipping}>
                    {skipping ? "..." : "Skip"}
                </button>

            </div>

        </div>

        {enrollOpen && (

            <div
                className="dialog-backdrop"
                role="presentation"
                onClick={(e) => { if (e.target === e.currentTarget) setEnrollOpen(false); }}
            >

                <div
                    className="dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="mfa-nudge-enroll-title"
                >

                    <h2 id="mfa-nudge-enroll-title" style={{ marginTop: 0 }}>Set Up MFA</h2>

                    <Suspense fallback={<p className="field-hint">Loading...</p>}>
                        <MfaSection onEnrolled={() => { setEnrollOpen(false); refresh(); }} />
                    </Suspense>

                    <div className="button-row" style={{ marginTop: 16 }}>
                        <button type="button" className="btn" onClick={() => setEnrollOpen(false)}>
                            Close
                        </button>
                    </div>

                </div>

            </div>

        )}

        </>

    );

}
