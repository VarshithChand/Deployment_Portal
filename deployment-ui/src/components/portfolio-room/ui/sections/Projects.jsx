import { ExternalLink } from "lucide-react";
import { useStore } from "../../state/store";
import { PROJECTS } from "../../data/projects";

function ArchitectureDiagram({ steps }) {

    return (

        <div className="proom-arch-diagram mono">
            {steps.map((step, i) => (
                <span key={step} className="proom-arch-step-wrap">
                    <span className="proom-arch-step">{step}</span>
                    {i < steps.length - 1 && <span className="proom-arch-arrow">→</span>}
                </span>
            ))}
        </div>

    );

}

// Driven by selectedProjectId (set by clicking a specific rack unit in
// 3D) so whichever unit you clicked is the one already expanded.
export default function Projects() {

    const selectedProjectId = useStore((s) => s.selectedProjectId);
    const setSelectedProjectId = useStore((s) => s.setSelectedProjectId);

    return (

        <div className="proom-project-list">
            {PROJECTS.map((project) => {

                const isOpen = selectedProjectId === project.id;

                return (

                    <div key={project.id} className={`proom-project-card${isOpen ? " open" : ""}`}>

                        <button
                            type="button"
                            className="proom-project-head"
                            onClick={() => setSelectedProjectId(isOpen ? null : project.id)}
                            aria-expanded={isOpen}
                        >
                            <span>{project.title}</span>
                        </button>

                        {isOpen && (

                            <div className="proom-project-body">

                                <p>{project.summary}</p>

                                <ArchitectureDiagram steps={project.architecture} />

                                <div className="proom-skills-tags">
                                    {project.stack.map((t) => <span key={t} className="proom-tag">{t}</span>)}
                                </div>

                                <div className="proom-project-links">
                                    {project.live && (
                                        <a href={project.live} target="_blank" rel="noreferrer" className="proom-project-link">
                                            Live <ExternalLink size={11} />
                                        </a>
                                    )}
                                    {project.github && (
                                        <a href={project.github} target="_blank" rel="noreferrer" className="proom-project-link">
                                            GitHub <ExternalLink size={11} />
                                        </a>
                                    )}
                                </div>

                            </div>

                        )}

                    </div>

                );

            })}
        </div>

    );

}
