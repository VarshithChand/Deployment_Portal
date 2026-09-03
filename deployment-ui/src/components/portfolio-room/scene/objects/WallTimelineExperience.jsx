import { Billboard, Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { MONO_FONT } from "../../fonts";
import { useStore } from "../../state/store";
import { EXPERIENCE_TIMELINE } from "../../data/experience";

const CENTER_Z = -2;
const STEP = 0.6;

// Lit timeline running along the left wall, like a metro line with a
// glowing stop per year -> EXPERIENCE. Clicking a stop opens that year.
export default function WallTimelineExperience({ reducedMotion }) {

    const active = useStore((s) => s.active);
    const setActive = useStore((s) => s.setActive);
    const selectedExperienceYear = useStore((s) => s.selectedExperienceYear);
    const setSelectedExperienceYear = useStore((s) => s.setSelectedExperienceYear);
    const isOpen = active === "experience";

    const zPositions = EXPERIENCE_TIMELINE.map((_, i) => CENTER_Z + (i - (EXPERIENCE_TIMELINE.length - 1) / 2) * STEP);

    return (

        <group>

            {/* the "metro line" itself - a thin glowing bar running along
                the wall, spanning from the first stop to the last */}
            <mesh position={[-6.5, 2, CENTER_Z]}>
                <boxGeometry args={[0.03, 0.03, zPositions[zPositions.length - 1] - zPositions[0] + 0.3]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.5} toneMapped={false} />
            </mesh>

            {!isOpen && (
                <Billboard position={[-6.5, 2.5, CENTER_Z]}>
                    <Text font={MONO_FONT} fontSize={0.1} color="#67e8f9" outlineWidth={0.007} outlineColor="#031014" anchorX="center" anchorY="bottom">
                        EXPERIENCE
                    </Text>
                </Billboard>
            )}

            {EXPERIENCE_TIMELINE.map((entry, i) => {

                const selected = isOpen && selectedExperienceYear === entry.year;

                return (
                    <Hotspot
                        key={entry.year}
                        position={[-6.5, 2, zPositions[i]]}
                        onSelect={() => { setActive("experience"); setSelectedExperienceYear(entry.year); }}
                        reducedMotion={reducedMotion}
                        floatOffset={i * 0.5}
                    >
                        {(hovered) => (
                            <>
                                <mesh>
                                    <sphereGeometry args={[selected ? 0.13 : 0.1, 12, 12]} />
                                    <meshStandardMaterial
                                        color={hovered || selected ? "#67e8f9" : "#0e3540"}
                                        emissive="#22d3ee"
                                        emissiveIntensity={hovered || selected ? 1.1 : 0.7}
                                        toneMapped={false}
                                    />
                                </mesh>
                                <Billboard position={[0, 0.2, 0]}>
                                    <Text font={MONO_FONT} fontSize={0.06} color={selected ? "#eafaff" : "#9fd8e0"} outlineWidth={0.005} outlineColor="#05141a" anchorX="center" anchorY="bottom">
                                        {entry.year}
                                    </Text>
                                </Billboard>
                            </>
                        )}
                    </Hotspot>
                );

            })}

        </group>

    );

}
