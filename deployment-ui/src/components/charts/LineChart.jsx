// Time-series magnitude for ONE metric (CPU% or Memory bytes) - single axis
// only, matching the "never a dual-axis chart" rule (two measures of
// different units/scale get two charts, not one chart with two y-scales).
// The Hosting Observability dashboard renders one <LineChart> per series
// side by side (CPU, Memory) rather than overlaying both here. Modeled
// directly on BarChart.jsx's conventions - same viewBox/padding/grid/
// niceMax approach, same CSS-var-driven color, same native <title> for
// hover (this app has no chart tooltip component yet, and BarChart itself
// doesn't have one either - staying consistent rather than introducing a
// second interaction pattern).
export default function LineChart({
    points = [],
    height = 200,
    color = "var(--viz-series-1)",
    unit = "",
    formatValue = (v) => v
}) {

    const width = 640;
    const paddingLeft = 40;
    const paddingRight = 12;
    const paddingTop = 16;
    const paddingBottom = 28;

    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    if (points.length === 0) {

        return (
            <svg viewBox={`0 0 ${width} ${height}`} className="line-chart" role="img" preserveAspectRatio="xMidYMid meet">
                <text x={width / 2} y={height / 2} textAnchor="middle" className="line-chart-axis-label">
                    No data points in this range.
                </text>
            </svg>
        );

    }

    const max = Math.max(1, ...points.map((p) => p.value));
    const niceMax = Math.ceil(max / 5) * 5 || 1;

    const gridSteps = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
        y: paddingTop + plotHeight * (1 - t),
        value: Math.round(niceMax * t)
    }));

    const first = new Date(points[0].timestamp).getTime();
    const last = new Date(points[points.length - 1].timestamp).getTime();
    const span = Math.max(1, last - first);

    const toXY = (p) => {
        const t = (new Date(p.timestamp).getTime() - first) / span;
        return {
            x: paddingLeft + plotWidth * (points.length === 1 ? 0.5 : t),
            y: paddingTop + plotHeight * (1 - Math.min(1, p.value / niceMax))
        };
    };

    const coords = points.map(toXY);

    const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x},${c.y}`).join(" ");

    const areaPath =
        `M ${coords[0].x},${paddingTop + plotHeight} ` +
        coords.map((c) => `L ${c.x},${c.y}`).join(" ") +
        ` L ${coords[coords.length - 1].x},${paddingTop + plotHeight} Z`;

    const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    return (

        <svg
            viewBox={`0 0 ${width} ${height}`}
            className="line-chart"
            role="img"
            preserveAspectRatio="xMidYMid meet"
        >

            {gridSteps.map((g) => (

                <g key={g.value}>

                    <line
                        x1={paddingLeft}
                        x2={width - paddingRight}
                        y1={g.y}
                        y2={g.y}
                        className="line-chart-grid"
                    />

                    <text
                        x={paddingLeft - 8}
                        y={g.y}
                        textAnchor="end"
                        dominantBaseline="middle"
                        className="line-chart-axis-label"
                    >
                        {formatValue(g.value)}{unit}
                    </text>

                </g>

            ))}

            <path d={areaPath} className="line-chart-area" style={{ fill: color }} />
            <path d={linePath} className="line-chart-line" style={{ stroke: color }} />

            {coords.map((c, i) => (

                <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 3.5 : 2.5} style={{ fill: color }}>
                    <title>{`${formatTime(points[i].timestamp)} — ${formatValue(points[i].value)}${unit}`}</title>
                </circle>

            ))}

            <text x={paddingLeft} y={height - paddingBottom + 18} textAnchor="start" className="line-chart-axis-label">
                {formatTime(points[0].timestamp)}
            </text>

            <text x={width - paddingRight} y={height - paddingBottom + 18} textAnchor="end" className="line-chart-axis-label">
                {formatTime(points[points.length - 1].timestamp)}
            </text>

            <line
                x1={paddingLeft}
                x2={width - paddingRight}
                y1={paddingTop + plotHeight}
                y2={paddingTop + plotHeight}
                className="line-chart-baseline"
            />

        </svg>

    );

}
