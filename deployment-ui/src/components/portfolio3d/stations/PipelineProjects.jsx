import { ExternalLink } from "lucide-react";
import { Billboard, Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { useScene } from "../sceneStore";
import { MONO_FONT } from "../fonts";
import { PIPELINE_STAGES, PROJECTS } from "../../../data/portfolio3dData";

function shortLabel(title) {
    return title.length > 16 ? `${title.slice(0, 15)}…` : title;
}

// One box per PROJECT (not per pipeline stage - the CI/CD stage names
// are still shown, but only as a decorative strip inside the panel,
// see .p3d-pipeline-strip below). Each box is independently clickable
// and opens THAT project specifically via setSelectedProjectId, rather
// than every box opening the same full list regardless of which one
// was clicked. A floating name label sits above each box at all times
// so you can tell which project it is before clicking.
export function PipelineMarkers({ onSelect, reducedMotion, dimmed }) {

    const { selectedProjectId, setSelectedProjectId } = useScene();

    return (

        <>
            {PROJECTS.map((project, i) => {

                // Box width is 0.34 - the previous 0.55 step nearly touched
                // adjacent boxes (0.5-wide boxes on a 0.55 step), which at
                // most viewing angles visually fused into one jagged merged
                // shape instead of distinct stages. 0.62 gives real gaps.
                const x = 1.4 + i * 0.62;
                const y = 0.9 + (i % 2 === 0 ? 0.05 : 0);
                const selected = selectedProjectId === project.id;

                return (
                    <Hotspot
                        key={project.id}
                        position={[x, y, -1]}
                        onSelect={() => { onSelect(); setSelectedProjectId(project.id); }}
                        reducedMotion={reducedMotion}
                        floatOffset={i * 0.5}
                    >
                        {(hovered) => (
                            <>
                                <mesh>
                                    <boxGeometry args={[0.34, 0.3, 0.3]} />
                                    <meshStandardMaterial
                                        color={hovered || selected ? "#67e8f9" : "#0e3540"}
                                        emissive="#22d3ee"
                                        emissiveIntensity={hovered || selected ? 1.1 : dimmed ? 0.15 : 0.75}
                                        transparent
                                        opacity={dimmed ? 0.2 : 1}
                                        toneMapped={false}
                                    />
                                </mesh>
                                {!dimmed && (
                                    <Billboard position={[0, 0.26, 0]}>
                                        <Text
                                            font={MONO_FONT}
                                            fontSize={0.05}
                                            color={selected ? "#eafaff" : "#9fd8e0"}
                                            outlineWidth={0.004}
                                            outlineColor="#05141a"
                                            anchorX="center"
                                            anchorY="bottom"
                                        >
                                            {shortLabel(project.title)}
                                        </Text>
                                    </Billboard>
                                )}
                            </>
                        )}
                    </Hotspot>
                );

            })}

            {!dimmed && (
                <Billboard position={[2.95, 1.55, -1]}>
                    <Text
                        font={MONO_FONT}
                        fontSize={0.12}
                        color="#67e8f9"
                        outlineWidth={0.007}
                        outlineColor="#031014"
                        anchorX="center"
                        anchorY="bottom"
                    >
                        PROJECTS
                    </Text>
                </Billboard>
            )}
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

    // Driven by the shared selectedProjectId (set by clicking a specific
    // box in 3D) instead of always defaulting to the first project, so
    // whichever box you clicked is the one the panel opens already
    // showing. Falls back to nothing expanded (all collapsed) when
    // nothing's been picked yet - e.g. on mobile, where this renders
    // without any box ever having been clicked.
    const { selectedProjectId, setSelectedProjectId } = useScene();

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

                    const isOpen = selectedProjectId === project.id;

                    return (

                        <div key={project.id} className={`p3d-project-card${isOpen ? " open" : ""}`}>

                            <button
                                type="button"
                                className="p3d-project-head"
                                onClick={() => setSelectedProjectId(isOpen ? null : project.id)}
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
