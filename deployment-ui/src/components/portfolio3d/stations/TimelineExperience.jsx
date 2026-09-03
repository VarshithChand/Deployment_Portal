import Hotspot from "../Hotspot";
import { EXPERIENCE_TIMELINE } from "../../../data/portfolio3dData";

export function TimelineMarker({ onSelect, reducedMotion }) {

    return (

        <Hotspot position={[-3.2, 1.3, -1.5]} onSelect={onSelect} reducedMotion={reducedMotion}>
            {(hovered) => (
                <group>
                    {EXPERIENCE_TIMELINE.map((_, i) => (
                        <mesh key={i} position={[i * 0.35 - 0.35, 0, 0]}>
                            <sphereGeometry args={[0.12, 12, 12]} />
                            <meshStandardMaterial
                                color={hovered ? "#67e8f9" : "#0e3540"}
                                emissive="#22d3ee"
                                emissiveIntensity={hovered ? 1.1 : 0.75}
                                toneMapped={false}
                            />
                        </mesh>
                    ))}
                </group>
            )}
        </Hotspot>

    );

}

export function ExperienceContent() {

    return (

        <div className="p3d-timeline">
            {EXPERIENCE_TIMELINE.map((entry) => (
                <div key={entry.year} className="p3d-timeline-entry">
                    <span className="p3d-timeline-year mono">{entry.year}</span>
                    <div>
                        <strong>{entry.theme}</strong>
                        <p>{entry.detail}</p>
                    </div>
                </div>
            ))}
        </div>

    );

}
