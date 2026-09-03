import { Billboard, Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { useScene } from "../sceneStore";
import { MONO_FONT } from "../fonts";
import { EXPERIENCE_TIMELINE } from "../../../data/portfolio3dData";

// Each year gets its own clickable circle - previously all of them were
// wrapped in a single shared Hotspot, so there was no way to click a
// specific year: every click opened the same full list regardless of
// which circle you clicked. Clicking one now selects that year via
// setSelectedExperienceYear, which ExperienceContent reads to highlight
// the matching entry in the panel. A floating year label sits above
// each circle at all times so you know which one it is before clicking.
// Centered on x=-3.2 (matches the EXPERIENCE title and the "experience"
// camera target's own lookAt in CameraRig.jsx - keep all three in sync
// if this ever moves) and spread relative to however many entries
// exist, rather than a fixed per-item offset from a hardcoded start -
// that fixed version was tuned for exactly 3 entries and never
// adjusted when a 4th (2022) was added, cramming labels that used to
// have real spacing into the same footprint.
const CENTER_X = -3.2;
const STEP = 0.44;

export function TimelineMarker({ onSelect, reducedMotion, dimmed }) {

    const { selectedExperienceYear, setSelectedExperienceYear } = useScene();

    return (

        <>
            {EXPERIENCE_TIMELINE.map((entry, i) => {

                const x = CENTER_X + (i - (EXPERIENCE_TIMELINE.length - 1) / 2) * STEP;
                const selected = selectedExperienceYear === entry.year;

                return (
                    <Hotspot
                        key={entry.year}
                        position={[x, 1.3, -1.5]}
                        onSelect={() => { onSelect(); setSelectedExperienceYear(entry.year); }}
                        reducedMotion={reducedMotion}
                        floatOffset={i * 0.6}
                    >
                        {(hovered) => (
                            <>
                                <mesh>
                                    <sphereGeometry args={[selected ? 0.15 : 0.12, 12, 12]} />
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
                                    <Billboard position={[0, 0.22, 0]}>
                                        <Text
                                            font={MONO_FONT}
                                            fontSize={0.06}
                                            color={selected ? "#eafaff" : "#9fd8e0"}
                                            outlineWidth={0.005}
                                            outlineColor="#05141a"
                                            anchorX="center"
                                            anchorY="bottom"
                                        >
                                            {entry.year}
                                        </Text>
                                    </Billboard>
                                )}
                            </>
                        )}
                    </Hotspot>
                );

            })}

            {!dimmed && (
                // Pushed higher than the "SKILLS"/"PROJECTS"/"CONTACT"
                // titles - Timeline and Contact sit close together in the
                // room (x -3.2/-2.6, z -1.5/-0.6), and at the room-overview
                // camera angle their two titles were landing almost on top
                // of each other on screen. Contact's marker is also
                // shorter, so its title sits lower - giving Experience's
                // title real clearance instead of matching the same
                // height was the actual fix, not just "a bit higher".
                <Billboard position={[-3.2, 2.15, -1.5]}>
                    <Text
                        font={MONO_FONT}
                        fontSize={0.11}
                        color="#67e8f9"
                        outlineWidth={0.007}
                        outlineColor="#031014"
                        anchorX="center"
                        anchorY="bottom"
                    >
                        EXPERIENCE
                    </Text>
                </Billboard>
            )}
        </>

    );

}

export function ExperienceContent() {

    const { selectedExperienceYear } = useScene();

    return (

        <div className="p3d-timeline">
            {EXPERIENCE_TIMELINE.map((entry) => (
                <div
                    key={entry.year}
                    className={`p3d-timeline-entry${selectedExperienceYear === entry.year ? " active" : ""}`}
                >
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
