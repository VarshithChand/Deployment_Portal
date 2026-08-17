// A safe, non-data-driven "what talks to what" diagram - plain boxes and an
// arrow glyph, deliberately NOT built with chart machinery (LineChart/
// BarChart) since nothing here is measured data. Only ever shown real,
// already-safe values (provider/service names, a masked host:port/db, a
// generic node label) - never a URL/token/connection string.
export default function ConnectionMap({ nodes }) {

    return (

        <div className="connection-map">

            {nodes.map((node, i) => (

                <span key={node.label} style={{ display: "contents" }}>

                    <div className="connection-map-node">
                        <span className="connection-map-node-label">{node.label}</span>
                        {node.sub && <span className="connection-map-node-sub">{node.sub}</span>}
                    </div>

                    {i < nodes.length - 1 && <span className="connection-map-arrow" aria-hidden="true">→</span>}

                </span>

            ))}

        </div>

    );

}
