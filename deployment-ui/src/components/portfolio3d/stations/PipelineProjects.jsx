import { useState } from "react";
import { ExternalLink } from "lucide-react";
import Hotspot from "../Hotspot";
import { PIPELINE_STAGES, PROJECTS } from "../../../data/portfolio3dData";

// A physical pipeline running across the room floor - each stage is its
// own clickable hotspot, but every one opens the same Projects panel
// (per the spec: "clicking any stage opens the projects view"), just at
// slightly staggered heights so the row reads as a real pipeline rather
// than a flat shelf of identical boxes.
export function PipelineMarkers({ onSelect, reducedMotion }) {

    return (

        <>
            {PIPELINE_STAGES.map((stage, i) => {

                const x = 1.4 + i * 0.55;
                const y = 0.9 + (i % 2 === 0 ? 0.05 : 0);

                return (
                    <Hotspot
                        key={stage}
                        position={[x, y, -1]}
                        onSelect={onSelect}
                        reducedMotion={reducedMotion}
                        floatOffset={i * 0.5}
                    >
                        {(hovered) => (
                            <mesh>
                                <boxGeometry args={[0.5, 0.34, 0.34]} />
                                <meshStandardMaterial
                                    color={hovered ? "#67e8f9" : "#0e3540"}
                                    emissive="#22d3ee"
                                    emissiveIntensity={hovered ? 1.1 : 0.75}
                                    toneMapped={false}
                                />
                            </mesh>
                        )}
                    </Hotspot>
                );

            })}
        </>

    );

}

function ArchitectureDiagram({ steps }) {

    return (

        <div className="p3d-arch-diagram mono">
            {steps.map((step, i) => (
                <span key={step} className="p3d-arch-step-wrap">
                    <span className="p3d-arch-step">{step}</span>
                    {i < steps.length - 1 && <span className="p3d-arch-arrow">→</span>}
                </span>
            ))}
        </div>

    );

}

export function ProjectsContent() {

    const [expanded, setExpanded] = useState(PROJECTS[0].id);

    return (

        <div className="p3d-projects">

            <div className="p3d-pipeline-strip mono" aria-hidden="true">
                {PIPELINE_STAGES.map((stage, i) => (
                    <span key={stage} className="p3d-pipeline-stage-wrap">
                        {stage}
                        {i < PIPELINE_STAGES.length - 1 && <span className="p3d-arch-arrow">→</span>}
                    </span>
                ))}
            </div>

            <div className="p3d-project-list">
                {PROJECTS.map((project) => {

                    const isOpen = expanded === project.id;

                    return (

                        <div key={project.id} className={`p3d-project-card${isOpen ? " open" : ""}`}>

                            <button
                                type="button"
                                className="p3d-project-head"
                                onClick={() => setExpanded(isOpen ? null : project.id)}
                                aria-expanded={isOpen}
                            >
                                <span>{project.title}</span>
                            </button>

                            {isOpen && (

                                <div className="p3d-project-body">

                                    <p>{project.summary}</p>

                                    <ArchitectureDiagram steps={project.architecture} />

                                    <div className="p3d-skills-tags">
                                        {project.stack.map((t) => <span key={t} className="p3d-tag">{t}</span>)}
                                    </div>

                                    <div className="p3d-project-links">
                                        {project.live && (
                                            <a href={project.live} target="_blank" rel="noreferrer" className="p3d-project-link">
                                                Live <ExternalLink size={11} />
                                            </a>
                                        )}
                                        {project.github && (
                                            <a href={project.github} target="_blank" rel="noreferrer" className="p3d-project-link">
                                                GitHub <ExternalLink size={11} />
                                            </a>
                                        )}
                                        {project.caseStudy && (
                                            <a href={project.caseStudy} target="_blank" rel="noreferrer" className="p3d-project-link">
                                                Case Study <ExternalLink size={11} />
                                            </a>
                                        )}
                                    </div>

                                </div>

                            )}

                        </div>

                    );

                })}
            </div>

        </div>

    );

}
