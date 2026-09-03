import { useState } from "react";
import { Billboard, Text } from "@react-three/drei";
import { MONO_FONT } from "../../fonts";
import { labelTextColors } from "../../textTheme";

// A real door at the entrance opening (the room's own +z side has no
// wall, matching the "you enter from here" doorway) - clicking it exits
// the portfolio, the same action as the Exit button in the corner. Not
// wired through the camera-fly/panel system every station uses (there is
// no "door" section to fly to or content to show) - it just calls onExit
// directly, like a real door would.
export default function Door({ position = [0, 0, 0], onExit, theme }) {

    const [hovered, setHovered] = useState(false);
    const labelColors = labelTextColors(theme);

    return (

        <group position={position}>

            {/* frame */}
            <mesh position={[-0.55, 1.25, 0]}>
                <boxGeometry args={[0.08, 2.5, 0.12]} />
                <meshStandardMaterial color="#171d26" roughness={0.7} />
            </mesh>
            <mesh position={[0.55, 1.25, 0]}>
                <boxGeometry args={[0.08, 2.5, 0.12]} />
                <meshStandardMaterial color="#171d26" roughness={0.7} />
            </mesh>
            <mesh position={[0, 2.46, 0]}>
                <boxGeometry args={[1.18, 0.08, 0.12]} />
                <meshStandardMaterial color="#171d26" roughness={0.7} />
            </mesh>

            {/* door panel - the actual clickable target */}
            <mesh
                position={[0, 1.15, 0]}
                onClick={(e) => { e.stopPropagation(); onExit?.(); }}
                onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
                onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = "auto"; }}
            >
                <boxGeometry args={[0.95, 2.3, 0.06]} />
                <meshStandardMaterial
                    color={hovered ? "#1c2836" : "#12181f"}
                    emissive="#22d3ee"
                    emissiveIntensity={hovered ? 0.35 : 0.08}
                    roughness={0.6}
                />
            </mesh>

            {/* handle */}
            <mesh position={[0.36, 1.1, 0.045]}>
                <boxGeometry args={[0.03, 0.16, 0.03]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={hovered ? 1 : 0.5} toneMapped={false} />
            </mesh>

            <Billboard position={[0, 2.75, 0]}>
                <Text
                    font={MONO_FONT}
                    fontSize={0.09}
                    color={labelColors.title}
                    outlineWidth={0.006}
                    outlineColor={labelColors.outline}
                    anchorX="center"
                    anchorY="bottom"
                >
                    EXIT
                </Text>
            </Billboard>

        </group>

    );

}
