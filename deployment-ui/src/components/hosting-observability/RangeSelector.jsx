const RANGES = [
    { key: "15m", label: "15m" },
    { key: "1h", label: "1h" },
    { key: "6h", label: "6h" },
    { key: "24h", label: "24h" },
    { key: "7d", label: "7d" }
];

// Shared by the Frontend/Backend/Database tabs' CPU/Memory charts - one
// row of buttons, matching CredentialsView's own mode-switcher button-row
// styling rather than a <select>, since there are only 5 options.
export default function RangeSelector({ value, onChange }) {

    return (

        <div className="button-row" style={{ marginBottom: "14px" }}>

            {RANGES.map((r) => (

                <button
                    key={r.key}
                    type="button"
                    className={`btn btn-sm ${value === r.key ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => onChange(r.key)}
                >
                    {r.label}
                </button>

            ))}

        </div>

    );

}
