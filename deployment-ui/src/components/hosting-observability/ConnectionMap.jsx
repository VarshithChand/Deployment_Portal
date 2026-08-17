// "What talks to what," with the real data already fetched elsewhere on
// this page - a provider/service name, a public URL (safe to show as-is,
// it's the same URL anyone can already open in a browser - never a token/
// connection string/anything from behind auth), and a short live stat line
// (e.g. active connection count). Deliberately NOT built with chart
// machinery (LineChart/BarChart) since this isn't measured time-series
// data, just a snapshot of the current wiring.
export default function ConnectionMap({ nodes }) {

    return (

        <div className="connection-map">

            {nodes.map((node, i) => (

                <span key={node.label} style={{ display: "contents" }}>

                    <div className="connection-map-node">

                        <span className="connection-map-node-label">
                            <span className={`connection-map-dot connection-map-dot-${node.state || "unknown"}`} aria-hidden="true" />
                            {node.label}
                        </span>

                        {node.sub && <span className="connection-map-node-sub">{node.sub}</span>}

                        {node.url && (
                            <a
                                href={node.url}
                                target="_blank"
                                rel="noreferrer"
                                className="connection-map-node-url"
                                title={node.url}
                            >
                                {node.url.replace(/^https?:\/\//, "")}
                            </a>
                        )}

                        {node.meta && <span className="connection-map-node-meta">{node.meta}</span>}

                    </div>

                    {i < nodes.length - 1 && <span className="connection-map-arrow" aria-hidden="true">→</span>}

                </span>

            ))}

        </div>

    );

}
