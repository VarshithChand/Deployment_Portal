import { useState } from "react";
import { Billboard, Text } from "@react-three/drei";
import { MONO_FONT } from "../../fonts";
import { labelTextColors } from "../../textTheme";

// A real door, flush-mounted on the back wall (not standing free in the
// middle of the floor - the room's own open +z side has no wall to
// attach it to, and a door floating in open space with nothing behind it
// doesn't read as a door). Clicking it exits the portfolio, the same
// action as the Exit button in the corner. Not wired through the
// camera-fly/panel system every station uses (there is no "door" section
// to fly to or content to show) - it just calls onExit directly, like a
// real door would. Its handle protrudes toward local +z, which is
// already the correct "into the room" direction for an unrotated back-
// wall mount - no rotation prop needed for this placement.
//
// Only a minor ~1.1x bump from the original pass, unlike most of the
// room's other furniture this round - this already read at roughly the
// right real-door height/proportion.
export default function Door({ position = [0, 0, 0], onExit, theme }) {

    const [hovered, setHovered] = useState(false);
    const labelColors = labelTextColors(theme);

    return (

        <group position={position}>

            {/* frame */}
            <mesh position={[-0.605, 1.25, 0]}>
                <boxGeometry args={[0.088, 2.75, 0.132]} />
                <meshStandardMaterial color="#171d26" roughness={0.7} />
            </mesh>
            <mesh position={[0.605, 1.25, 0]}>
                <boxGeometry args={[0.088, 2.75, 0.132]} />
                <meshStandardMaterial color="#171d26" roughness={0.7} />
            </mesh>
            <mesh position={[0, 2.706, 0]}>
                <boxGeometry args={[1.298, 0.088, 0.132]} />
                <meshStandardMaterial color="#171d26" roughness={0.7} />
            </mesh>

            {/* door panel - the actual clickable target */}
            <mesh
                position={[0, 1.265, 0]}
                onClick={(e) => { e.stopPropagation(); onExit?.(); }}
                onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
                onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = "auto"; }}
            >
                <boxGeometry args={[1.045, 2.53, 0.066]} />
                <meshStandardMaterial
                    color={hovered ? "#1c2836" : "#12181f"}
                    emissive="#22d3ee"
                    emissiveIntensity={hovered ? 0.35 : 0.08}
                    roughness={0.6}
                />
            </mesh>

            {/* handle */}
            <mesh position={[0.396, 1.21, 0.0495]}>
                <boxGeometry args={[0.033, 0.176, 0.033]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={hovered ? 1 : 0.5} toneMapped={false} />
            </mesh>

            <Billboard position={[0, 3.025, 0]}>
                <Text
                    font={MONO_FONT}
                    fontSize={0.099}
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
