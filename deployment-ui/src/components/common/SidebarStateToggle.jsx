import { SIDEBAR_STATES } from "../../constants/sidebarAccess";

// A row of buttons instead of a <select> for picking one of the three
// sidebar-access states - same visual pattern as SectionTabs (the active
// state gets btn-primary, the rest btn-secondary), just applied to a
// per-row three-way choice instead of a page-level section switcher. One
// click to change state instead of opening a dropdown first.
export default function SidebarStateToggle({ value, onChange }) {

    const current = value || "visible";

    return (

        <div className="button-row" style={{ flexWrap: "nowrap" }}>

            {SIDEBAR_STATES.map((s) => (

                <button
                    key={s.value}
                    type="button"
                    className={`btn btn-sm ${current === s.value ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => onChange(s.value)}
                    aria-pressed={current === s.value}
                >
                    {s.label}
                </button>

            ))}

        </div>

    );

}
