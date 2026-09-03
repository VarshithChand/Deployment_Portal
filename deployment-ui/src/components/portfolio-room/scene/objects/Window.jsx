// A wall-mounted window - frame + glass pane, tinted to match the room's
// current theme (a soft day sky when light, a dark starry night when
// dark) rather than a fixed color. Since theme itself already tracks
// real local time by default (see ThemeContext.jsx - light during the
// day, dark at night, until manually overridden), this window is a
// visual echo of that same day/night state, not a separate clock.
// Purely decorative, not clickable.
export default function Window({ position = [0, 0, 0], rotation = [0, 0, 0], theme }) {

    const day = theme !== "dark";
    const sky = day ? "#bfe0f2" : "#0a1220";
    const glow = day ? "#fef3c7" : "#c7d2e0";

    return (

        <group position={position} rotation={rotation}>

            {/* frame */}
            <mesh>
                <boxGeometry args={[0.06, 1.1, 1.5]} />
                <meshStandardMaterial color="#2a1f16" roughness={0.7} />
            </mesh>

            {/* glass pane */}
            <mesh position={[0.031, 0, 0]}>
                <planeGeometry args={[0.95, 1.35]} />
                <meshBasicMaterial color={sky} toneMapped={false} />
            </mesh>

            {/* muntin bars - splits the pane into four lights, reads as a
                real window instead of a flat colored rectangle */}
            <mesh position={[0.032, 0, 0]}>
                <boxGeometry args={[0.01, 1.1, 0.03]} />
                <meshStandardMaterial color="#2a1f16" />
            </mesh>
            <mesh position={[0.032, 0, 0]}>
                <boxGeometry args={[0.01, 0.03, 1.5]} />
                <meshStandardMaterial color="#2a1f16" />
            </mesh>

            {/* sun (day) / moon (night) disc, low in the pane */}
            <mesh position={[0.033, 0.28, day ? -0.35 : 0.35]}>
                <circleGeometry args={[0.11, 20]} />
                <meshBasicMaterial color={glow} toneMapped={false} />
            </mesh>

            {/* a few stars, only worth drawing at night - positions are
                [y, z] offsets within the pane's own plane (its local x is
                the fixed outward-facing depth, not a second in-plane axis) */}
            {!day && [[0.45, -0.55], [0.5, 0.4], [0.35, 0.6], [0.42, -0.15]].map(([y, z], i) => (
                <mesh key={i} position={[0.033, y - 0.15, z]}>
                    <circleGeometry args={[0.012, 6]} />
                    <meshBasicMaterial color="#e7edf5" toneMapped={false} />
                </mesh>
            ))}

        </group>

    );

}
