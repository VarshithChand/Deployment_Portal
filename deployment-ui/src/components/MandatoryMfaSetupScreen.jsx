import { lazy, Suspense } from "react";

import Logo from "./common/Logo";
import useTheme from "../hooks/useTheme";
import { SunIcon, MoonIcon } from "./layout/SidebarIcons";

// Pulled in lazily for the same reason LoginSignupPage originally kept this
// lazy - it drags in the qrcode library, which has no reason to sit in the
// bundle for every visitor who never reaches this screen.
const MfaSection = lazy(() => import("./settings/credentials/MfaSection"));

// Shared by both places a brand-new account gets funneled through
// mandatory (non-skippable) MFA enrollment before it's allowed any further:
// LoginSignupPage's needsMfaSetup (right after a fresh signup response,
// before the browser has even reloaded) and App.jsx's mfaSetupPending
// (reached via the emailVerified/mfaSetupPending redirect after clicking
// the welcome-email verify link - see AccountAuthController.VerifyEmail).
// Both are "register, then MFA, then dashboard" as a straight line, not a
// dismissible nudge (see MfaEnforcementGate for the separate, skippable
// nudge that applies to already-existing accounts instead).
export default function MandatoryMfaSetupScreen({ onEnrolled }) {

    const { theme, toggleTheme } = useTheme();

    return (

        <div className="auth-page">

            <div className="auth-page-card" role="main" aria-labelledby="mfa-setup-title">

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

                <h1 id="mfa-setup-title" className="setup-gate-title">
                    Secure your new account
                </h1>

                <p className="field-hint" style={{ textAlign: "center" }}>
                    Set up multi-factor authentication to finish creating your account.
                </p>

                <Suspense fallback={<p className="field-hint">Loading...</p>}>
                    <MfaSection onEnrolled={onEnrolled} />
                </Suspense>

            </div>

        </div>

    );

}
