// Icon mark matches the app's favicon (public/favicon.svg) — same glyph,
// same blue, so the tab icon and the in-app logo read as one identity.
// Three stacked chevrons ("Ascend") read as a release moving up through
// environments — dev to acpt to prod — rather than a plain arrow.
export default function Logo({ compact = false, showEyebrow = true, size = 40 }) {

    return (

        <div className="logo-lockup">

            <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                <rect width="48" height="48" rx="10" fill="#2563eb" />
                <g fill="none" stroke="#ffffff" strokeWidth="4.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13.5 18 L24 9 L34.5 18" />
                    <path d="M13.5 27.8 L24 18.8 L34.5 27.8" opacity=".62" />
                    <path d="M13.5 37.5 L24 28.5 L34.5 37.5" opacity=".34" />
                </g>
            </svg>

            {!compact && (

                <div className="logo-text">

                    {showEyebrow && (
                        <span className="logo-eyebrow">GitHub</span>
                    )}

                    <span className="logo-title">Deployment Portal</span>

                </div>

            )}

        </div>

    );

}
