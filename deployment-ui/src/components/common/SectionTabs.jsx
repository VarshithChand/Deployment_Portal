// Shared by Services and Docker - both render a row of section-switching
// buttons at the top of a "card" the same way, differing only in which
// sections they list and what switching one does.
export default function SectionTabs({ sections, active, onSelect }) {

    return (

        <div className="button-row" style={{ marginBottom: 20 }}>

            {sections.map((s) => (

                <button
                    key={s.key}
                    type="button"
                    className={`btn btn-sm ${active === s.key ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => onSelect(s.key)}
                >
                    {s.label}
                </button>

            ))}

        </div>

    );

}
