// The animated mark behind every in-app loading state — same visual
// language as index.html's pre-React boot loader (emitting rings,
// breathing tile, a rising "ghost" of the glyph, a sheen sweep), just
// built as a real component so it can size down for inline use (a
// deploy-in-progress panel) as well as a full-page loading screen.
// Colors come from the theme tokens, not hardcoded hex, so it matches
// dark mode automatically instead of needing its own dark overrides.
export default function LoadingMark({ size = 64 }) {

    return (

        <div className="loading-mark" style={{ width: size * 2, height: size * 2 }}>

            <span className="loading-mark-ring"></span>
            <span className="loading-mark-ring"></span>
            <span className="loading-mark-ring"></span>

            <div className="loading-mark-tile" style={{ width: size, height: size }}>

                <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                    <g fill="none" stroke="#ffffff" strokeWidth="4.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13.5 18 L24 9 L34.5 18" />
                        <path d="M13.5 27.8 L24 18.8 L34.5 27.8" opacity=".62" />
                        <path d="M13.5 37.5 L24 28.5 L34.5 37.5" opacity=".34" />
                    </g>
                </svg>

                <div className="loading-mark-ghost">
                    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                        <g fill="none" stroke="#ffffff" strokeWidth="4.9" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13.5 18 L24 9 L34.5 18" />
                            <path d="M13.5 27.8 L24 18.8 L34.5 27.8" opacity=".62" />
                            <path d="M13.5 37.5 L24 28.5 L34.5 37.5" opacity=".34" />
                        </g>
                    </svg>
                </div>

            </div>

        </div>

    );

}
