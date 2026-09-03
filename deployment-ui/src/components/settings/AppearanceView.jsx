import useStyle from "../../hooks/useStyle";
import useTheme from "../../hooks/useTheme";
import { APP_STYLES } from "../../context/StyleContext";

// Self-contained, no props — same pattern as SmokeTestsView/
// ExternalApisView. Both dimensions here (style, theme) are per-browser
// (localStorage), same as everywhere else this app stores a "how it
// looks" preference — nobody else's session is ever affected by either.
export default function AppearanceView() {

    const { style, setStyle } = useStyle();
    const { theme, toggleTheme, themeMode } = useTheme();

    return (

        <div className="card">

            <h2 className="card-title">
                Appearance
            </h2>

            <p className="empty-state" style={{ padding: "0 0 20px", textAlign: "left" }}>
                Purely cosmetic — saved to this browser only, nobody else using the portal
                sees a different look because of what you pick here.
            </p>

            <div className="appearance-style-grid">

                {APP_STYLES.map((s) => (

                    <button
                        key={s.key}
                        type="button"
                        className={`appearance-style-card ${style === s.key ? "active" : ""}`}
                        onClick={() => setStyle(s.key)}
                        aria-pressed={style === s.key}
                    >

                        <span className={`appearance-style-swatch appearance-style-swatch-${s.key}`} aria-hidden="true">
                            <span></span>
                            <span></span>
                            <span></span>
                        </span>

                        <span className="appearance-style-name">{s.label}</span>
                        <span className="appearance-style-desc">{s.description}</span>

                        {style === s.key && (
                            <span className="appearance-style-check" aria-hidden="true">✓</span>
                        )}

                    </button>

                ))}

            </div>

            <h3 className="settings-subhead" style={{ marginTop: "28px" }}>Light / Dark</h3>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Each style above has its own light and dark pair — this switches within
                whichever one you picked. Until you switch it yourself, it follows your
                device's own clock — light during the day, dark at night — same as the
                Portfolio room's clock/window/sun-moon icon.
            </p>

            <button type="button" className="btn btn-secondary" onClick={toggleTheme}>
                {theme === "dark" ? "Switch to Light" : "Switch to Dark"}
            </button>

            <p className="empty-state" style={{ padding: "10px 0 0", textAlign: "left", fontSize: "12px" }}>
                Currently: {themeMode === "auto" ? "Auto (following your local time)" : "Manually set"}
            </p>

        </div>

    );

}
