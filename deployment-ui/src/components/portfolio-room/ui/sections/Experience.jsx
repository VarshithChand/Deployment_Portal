import { useStore } from "../../state/store";
import { EXPERIENCE_TIMELINE } from "../../data/experience";

export default function Experience() {

    const selectedExperienceYear = useStore((s) => s.selectedExperienceYear);

    return (

        <div className="proom-timeline">
            {EXPERIENCE_TIMELINE.map((entry) => (
                <div
                    key={entry.year}
                    className={`proom-timeline-entry${selectedExperienceYear === entry.year ? " active" : ""}`}
                >
                    <span className="proom-timeline-year mono">{entry.year}</span>
                    <div>
                        <strong>{entry.theme}</strong>
                        <p>{entry.detail}</p>
                    </div>
                </div>
            ))}
        </div>

    );

}
