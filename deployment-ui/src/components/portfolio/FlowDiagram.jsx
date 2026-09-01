import { ArrowRight } from "lucide-react";

// Shared step-flow diagram - used by DevOps Architecture, CI/CD,
// Infrastructure as Code, and Automation (each just passes different
// `steps`), instead of four near-identical hand-built diagrams. Renders
// as a horizontal row on wide screens and stacks vertically on narrow
// ones (the arrow glyph itself rotates via CSS, see .pf-flow-arrow) -
// real responsive layout rather than a literal ASCII-art block, which
// would either overflow or truncate on mobile.
export default function FlowDiagram({ steps, dense = false }) {

    return (

        <div className={`pf-flow${dense ? " pf-flow-dense" : ""}`} aria-label="Process flow">

            {steps.map((step, i) => (

                <div className="pf-flow-step-wrap" key={typeof step === "string" ? step : step.label}>

                    <div className="pf-flow-step">
                        {typeof step === "string" ? step : step.label}
                    </div>

                    {i < steps.length - 1 && (
                        <span className="pf-flow-arrow" aria-hidden="true">
                            <ArrowRight size={15} />
                        </span>
                    )}

                </div>

            ))}

        </div>

    );

}
