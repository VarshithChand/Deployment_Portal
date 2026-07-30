const NODE_WIDTH = 240;
const NODE_HEIGHT = 184;
const COL_GAP = 90;
const ROW_GAP = 36;
const MAX_VISIBLE_STEPS = 5;

// Left-to-right column per dependency layer, jobs stacked within a column,
// each column vertically centered against the tallest column so graphs
// with an uneven fan-out (1 job -> 3 parallel jobs) don't look lopsided.
function layoutNodes(layers) {

    const maxRows = Math.max(...layers.map((layer) => layer.length));
    const positions = new Map();

    layers.forEach((layer, colIndex) => {

        const colHeight = layer.length * NODE_HEIGHT + (layer.length - 1) * ROW_GAP;
        const maxHeight = maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP;
        const yOffset = (maxHeight - colHeight) / 2;

        layer.forEach((jobId, rowIndex) => {
            positions.set(jobId, {
                x: colIndex * (NODE_WIDTH + COL_GAP),
                y: yOffset + rowIndex * (NODE_HEIGHT + ROW_GAP)
            });
        });

    });

    const width = layers.length * NODE_WIDTH + (layers.length - 1) * COL_GAP;
    const height = maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP;

    return { positions, width, height };

}

function edgePath(from, to) {

    const startX = from.x + NODE_WIDTH;
    const startY = from.y + NODE_HEIGHT / 2;
    const endX = to.x;
    const endY = to.y + NODE_HEIGHT / 2;
    const midX = (startX + endX) / 2;

    return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

}

function statusDotClass(status) {

    switch (status) {
        case "running": return "workflow-dot workflow-dot-running";
        case "success": return "workflow-dot workflow-dot-success";
        case "waiting_approval": return "workflow-dot workflow-dot-waiting";
        case "skipped": return "workflow-dot workflow-dot-skipped";
        default: return "workflow-dot workflow-dot-pending";
    }

}

export default function WorkflowGraph({ jobs, layers, jobStates, onApprove, onReject }) {

    const { positions, width, height } = layoutNodes(layers);

    const edges = [];

    jobs.forEach((job) => {
        job.needs.forEach((dep) => {
            edges.push({
                key: `${dep}->${job.id}`,
                from: positions.get(dep),
                to: positions.get(job.id)
            });
        });
    });

    return (

        <div className="table-scroll">

            <div className="workflow-graph" style={{ width, height }}>

                <svg className="workflow-graph-edges" width={width} height={height}>

                    {edges.map((edge) => (
                        <path key={edge.key} d={edgePath(edge.from, edge.to)} />
                    ))}

                </svg>

                {jobs.map((job) => {

                    const pos = positions.get(job.id);
                    const state = jobStates[job.id] || { status: "pending", stepIndex: -1 };
                    const visibleSteps = job.steps.slice(0, MAX_VISIBLE_STEPS);
                    const hiddenCount = job.steps.length - visibleSteps.length;

                    return (

                        <div
                            key={job.id}
                            className={`workflow-node workflow-node-${state.status}`}
                            style={{ left: pos.x, top: pos.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
                        >

                            <div className="workflow-node-header">

                                <span className={statusDotClass(state.status)} />
                                <strong>{job.name}</strong>

                            </div>

                            {job.runsOn && (
                                <div className="workflow-node-runson">{job.runsOn}</div>
                            )}

                            {state.status === "waiting_approval" ? (

                                <div className="workflow-approval-gate">

                                    <p>
                                        Waiting for approval
                                        {job.environment && <> — environment <strong>{job.environment}</strong></>}
                                    </p>

                                    <div className="button-row">

                                        <button type="button" className="btn btn-success" onClick={() => onApprove(job.id)}>
                                            Approve
                                        </button>

                                        <button type="button" className="btn btn-danger" onClick={() => onReject(job.id)}>
                                            Reject
                                        </button>

                                    </div>

                                </div>

                            ) : state.status === "skipped" ? (

                                <p className="workflow-skipped-note">
                                    Skipped
                                    {job.referencedParams.length > 0 && " — no matching run parameter was checked"}
                                </p>

                            ) : (

                                <ul className="workflow-node-steps">

                                    {visibleSteps.map((step, index) => {

                                        const done = state.status === "success" || (state.status === "running" && index < state.stepIndex);
                                        const active = state.status === "running" && index === state.stepIndex;

                                        return (
                                            <li
                                                key={index}
                                                className={done ? "workflow-step-done" : active ? "workflow-step-active" : ""}
                                            >
                                                {step.name}
                                            </li>
                                        );

                                    })}

                                    {hiddenCount > 0 && (
                                        <li className="workflow-step-more">+{hiddenCount} more</li>
                                    )}

                                    {job.steps.length === 0 && (
                                        <li className="workflow-step-more">No steps defined</li>
                                    )}

                                </ul>

                            )}

                        </div>

                    );

                })}

            </div>

        </div>

    );

}
