import { useStore } from "../../state/store";
import { EXPERIENCE_TIMELINE } from "../../data/experience";

// Collapsed by default, same accordion pattern as Projects.jsx - only
// the year clicked (in 3D, on the wall timeline, or here) shows its
// detail paragraph, rather than every entry's full text always being
// visible.
export default function Experience() {

    const selectedExperienceYear = useStore((s) => s.selectedExperienceYear);
    const setSelectedExperienceYear = useStore((s) => s.setSelectedExperienceYear);

    return (

        <div className="proom-timeline">
            {EXPERIENCE_TIMELINE.map((entry) => {

                const isOpen = selectedExperienceYear === entry.year;

                return (

                    <div key={entry.year} className={`proom-timeline-entry${isOpen ? " active" : ""}`}>

                        <button
                            type="button"
                            className="proom-timeline-head"
                            onClick={() => setSelectedExperienceYear(isOpen ? null : entry.year)}
                            aria-expanded={isOpen}
                        >
                            <span className="proom-timeline-year mono">{entry.year}</span>
                            <strong>{entry.theme}</strong>
                        </button>

                        {isOpen && <p>{entry.detail}</p>}

                    </div>

                );

            })}
        </div>

    );

}
