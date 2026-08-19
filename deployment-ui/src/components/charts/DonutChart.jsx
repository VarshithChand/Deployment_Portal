const SIZE = 140;
const STROKE = 20;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Part-to-whole breakdown (composition, ≤5 slices - status or a small
// categorical color job, see the dataviz skill's own color-formula) as a
// donut - the pie/donut counterpart to this app's existing BarChart/Meter
// (components/charts/), same minimal style: plain <circle> stroke-dasharray
// segments (no hand-authored arc paths), a native <title> per segment for
// hover instead of a custom tooltip layer, matching BarChart's own use of
// <title> rather than bespoke hover state.
export default function DonutChart({ data, formatValue = (v) => v.toLocaleString() }) {

    const total = data.reduce((sum, d) => sum + d.value, 0);
    const visible = data.filter((d) => d.value > 0);

    if (total === 0) {
        return <p className="empty-state">Nothing to show yet.</p>;
    }

    let cumulative = 0;

    const segments = visible.map((d) => {

        const fraction = d.value / total;
        const dash = fraction * CIRCUMFERENCE;
        const offset = -cumulative * CIRCUMFERENCE;

        cumulative += fraction;

        return { ...d, dash, offset, fraction };

    });

    return (

        <div className="donut-chart-row">

            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="donut-chart">

                <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" className="donut-chart-track" strokeWidth={STROKE} />

                {segments.map((seg) => (

                    <circle
                        key={seg.label}
                        cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={STROKE}
                        strokeDasharray={`${seg.dash} ${CIRCUMFERENCE - seg.dash}`}
                        strokeDashoffset={seg.offset}
                        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                    >
                        <title>{`${seg.label}: ${formatValue(seg.value)} (${(seg.fraction * 100).toFixed(0)}%)`}</title>
                    </circle>

                ))}

                <text x={SIZE / 2} y={SIZE / 2 - 4} textAnchor="middle" className="donut-chart-total-value">
                    {total.toLocaleString()}
                </text>

                <text x={SIZE / 2} y={SIZE / 2 + 14} textAnchor="middle" className="donut-chart-total-label">
                    total
                </text>

            </svg>

            <ul className="donut-chart-legend">

                {visible.map((d) => (

                    <li key={d.label}>
                        <span className="donut-chart-swatch" style={{ background: d.color }} />
                        <span className="donut-chart-legend-label">{d.label}</span>
                        <span className="donut-chart-legend-value">{formatValue(d.value)}</span>
                    </li>

                ))}

            </ul>

        </div>

    );

}
