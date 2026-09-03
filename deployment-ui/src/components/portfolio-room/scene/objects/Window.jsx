// A wall-mounted window - frame + glass pane, tinted to match the room's
// current theme (a saturated day sky when light, a real night blue when
// dark) rather than a fixed color. Since theme itself already tracks
// real local time by default (see ThemeContext.jsx - light during the
// day, dark at night, until manually overridden), this window is a
// visual echo of that same day/night state, not a separate clock.
// Purely decorative, not clickable.
//
// Every layer (glass/trim/muntins/sun-moon) sits a full 0.01 units apart
// in local x - the first pass packed them 0.001-0.003 apart, which is
// well within z-fighting range at normal viewing distance: the depth
// buffer couldn't reliably resolve which nearly-coplanar surface was in
// front, so most layers randomly failed to render at all instead of
// forming the intended window face.
export default function Window({ position = [0, 0, 0], rotation = [0, 0, 0], theme }) {

    const day = theme !== "dark";
    // Saturated, real colors rather than pale washes - a pale sky blue
    // sat close enough to the light theme's own pale wall color that the
    // glass barely read as different from the wall it's set into.
    const sky = day ? "#3f8fd1" : "#16233f";
    const glow = day ? "#fef3c7" : "#dbe4f0";

    return (

        <group position={position} rotation={rotation}>

            {/* frame */}
            <mesh>
                <boxGeometry args={[0.08, 1.14, 1.54]} />
                <meshStandardMaterial color="#241a12" roughness={0.7} />
            </mesh>

            {/* solid cyan trim strips around the opening - 4 separate
                opaque boxes, not one overlapping semi-transparent plane
                (transparent materials sorting against several other
                near-coplanar surfaces was part of the z-fighting above) */}
            <mesh position={[0.05, 0.685, 0]}>
                <boxGeometry args={[0.015, 0.03, 1.4]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[0.05, -0.685, 0]}>
                <boxGeometry args={[0.015, 0.03, 1.4]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[0.05, 0, 0.685]}>
                <boxGeometry args={[0.015, 1.1, 0.03]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[0.05, 0, -0.685]}>
                <boxGeometry args={[0.015, 1.1, 0.03]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>

            {/* glass pane */}
            <mesh position={[0.06, 0, 0]}>
                <planeGeometry args={[0.95, 1.35]} />
                <meshBasicMaterial color={sky} toneMapped={false} />
            </mesh>

            {/* muntin bars - splits the pane into four lights, reads as a
                real window instead of a flat colored rectangle */}
            <mesh position={[0.07, 0, 0]}>
                <boxGeometry args={[0.01, 1.1, 0.03]} />
                <meshStandardMaterial color="#241a12" />
            </mesh>
            <mesh position={[0.07, 0, 0]}>
                <boxGeometry args={[0.01, 0.03, 1.5]} />
                <meshStandardMaterial color="#241a12" />
            </mesh>

            {/* sun (day) / moon (night) disc, low in the pane */}
            <mesh position={[0.08, 0.28, day ? -0.35 : 0.35]}>
                <circleGeometry args={[0.11, 20]} />
                <meshBasicMaterial color={glow} toneMapped={false} />
            </mesh>

            {/* a few stars, only worth drawing at night - positions are
                [y, z] offsets within the pane's own plane (its local x is
                the fixed outward-facing depth, not a second in-plane axis) */}
            {!day && [[0.45, -0.55], [0.5, 0.4], [0.35, 0.6], [0.42, -0.15]].map(([y, z], i) => (
                <mesh key={i} position={[0.08, y - 0.15, z]}>
                    <circleGeometry args={[0.012, 6]} />
                    <meshBasicMaterial color="#e7edf5" toneMapped={false} />
                </mesh>
            ))}

        </group>

    );

}
