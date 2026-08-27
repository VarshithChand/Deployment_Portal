import { lazy, Suspense, useState } from "react";

import useAuth from "../hooks/useAuth";
import { skipMfaNudge } from "../services/settingsService";

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
//     renders a full, non-dismissible page in place of the app shell -
//     same "renders instead of children" precedent PinLockScreen already
//     established for the screen-lock PIN, and (for "mustSetUp"
//     specifically) what makes "register -> verify email -> MFA ->
//     dashboard" a real server-enforced sequence instead of a one-time
//     frontend redirect a refresh could quietly skip past.
//   - show (not blocked): a small dismissible bottom banner. Free to
//     skip - "Skip" always succeeds, it just also feeds the skip counter
//     that eventually flips `blocked` once BOTH mandatory (a cloud
//     credential exists) and the budget's spent. Never reached for
//     "mustSetUp" - that reason is blocked immediately, with no nudge
//     phase at all.
//   - neither: renders nothing.
export default function MfaEnforcementGate() {

    const { mfaNudgeShow, mfaNudgeMandatory, mfaNudgeBlocked, mfaNudgeReason, refresh } = useAuth();

    const [dismissedForNow, setDismissedForNow] = useState(false);
    const [enrollOpen, setEnrollOpen] = useState(false);
    const [skipping, setSkipping] = useState(false);

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

        return (

            <div className="auth-page" style={{ position: "fixed", inset: 0, zIndex: 1200 }}>

                <div className="auth-page-card" style={{ maxWidth: 460 }}>

                    <h1 className="setup-gate-title">
                        {isRegistration ? "Secure your new account" : "Multi-Factor Authentication Required"}
                    </h1>

                    <p className="field-hint" style={{ textAlign: "center" }}>
                        {isRegistration
                            ? "Set up multi-factor authentication to finish creating your account — this step can't be skipped."
                            : "Your account has cloud credentials saved, which makes MFA mandatory for this portal. Finish enrolling below to continue — this screen won't go away until you do."}
                    </p>

                    <Suspense fallback={<p className="field-hint">Loading...</p>}>
                        <MfaSection onEnrolled={refresh} />
                    </Suspense>

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
