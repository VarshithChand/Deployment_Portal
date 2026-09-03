import { useState } from "react";
import { Text } from "@react-three/drei";
import { MONO_FONT } from "../../fonts";
import { useStore } from "../../state/store";

// name/label/z-offset for each of the 3 physical switches, top to bottom.
const SWITCHES = [
    { name: "fan", label: "FAN", z: -0.08 },
    { name: "bedLight", label: "BED", z: 0 },
    { name: "cluster", label: "SKILLS", z: 0.08 }
];

// A real, clickable wall-mounted switchboard - 3 switches controlling
// the ceiling fan over the bed (Fan.jsx), the bed's wall sconce
// (BedLight.jsx), and the Skills pendant light's own master power
// (CeilingLightSkills.jsx), rather than the earlier purely-decorative
// fixed pose. Each switch's lever/LED reflects the shared store state
// (see state/store.js's `switches`), the same state the o+N/f+N
// keyboard shortcuts drive (PortfolioRoom.jsx) - clicking here and using
// the shortcut are two paths to the exact same toggle, not two separate
// concepts.
export default function SwitchBoard({ position = [0, 0, 0], rotation = [0, 0, 0] }) {

    const switches = useStore((s) => s.switches);
    const toggleSwitch = useStore((s) => s.toggleSwitch);
    const [hovered, setHovered] = useState(null);

    return (

        <group position={position} rotation={rotation}>

            {/* plate */}
            <mesh>
                <boxGeometry args={[0.02, 0.34, 0.24]} />
                <meshStandardMaterial color="#e8ecf0" roughness={0.5} />
            </mesh>

            {SWITCHES.map(({ name, label, z }) => {

                const on = switches[name];

                return (

                    <group key={name}>

                        {/* toggle lever - larger invisible-ish hit area
                            box behind it so the click target is easier to
                            land than the thin lever mesh alone would be */}
                        <mesh
                            position={[0.02, 0.08, z]}
                            visible={false}
                            onClick={(e) => { e.stopPropagation(); toggleSwitch(name); }}
                            onPointerOver={(e) => { e.stopPropagation(); setHovered(name); document.body.style.cursor = "pointer"; }}
                            onPointerOut={(e) => { e.stopPropagation(); setHovered(null); document.body.style.cursor = "auto"; }}
                        >
                            <boxGeometry args={[0.05, 0.09, 0.06]} />
                        </mesh>

                        <mesh
                            position={[0.02, 0.08, z]}
                            rotation={[0, 0, on ? 0.5 : -0.5]}
                            onClick={(e) => { e.stopPropagation(); toggleSwitch(name); }}
                            onPointerOver={(e) => { e.stopPropagation(); setHovered(name); document.body.style.cursor = "pointer"; }}
                            onPointerOut={(e) => { e.stopPropagation(); setHovered(null); document.body.style.cursor = "auto"; }}
                        >
                            <boxGeometry args={[0.03, 0.05, 0.015]} />
                            <meshStandardMaterial color={hovered === name ? "#3a4250" : "#20262e"} roughness={0.4} metalness={0.3} />
                        </mesh>

                        {/* status LED - lit cyan while this switch is on */}
                        <mesh position={[0.011, -0.08, z]}>
                            <sphereGeometry args={[0.008, 6, 6]} />
                            <meshStandardMaterial
                                color={on ? "#22d3ee" : "#3a4250"}
                                emissive={on ? "#22d3ee" : "#000000"}
                                emissiveIntensity={on ? 0.9 : 0}
                                toneMapped={false}
                            />
                        </mesh>

                        {/* Text defaults to facing +z; the plate/switches
                            face +x (this component's own local "out of
                            the wall" direction, before SwitchBoard's own
                            wall-mount rotation is applied externally) -
                            rotation.y=+90deg turns the text to face +x
                            too, not -90deg, which would face it into the
                            wall instead. */}
                        <Text font={MONO_FONT} fontSize={0.02} color="#5b6b83" anchorX="center" anchorY="middle" rotation={[0, Math.PI / 2, 0]} position={[0.011, -0.13, z]}>
                            {label}
                        </Text>

                    </group>

                );

            })}

        </group>

    );

}
