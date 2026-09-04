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
//
// Sized up ~1.3x from the original pass. At its position (world x=3),
// this grows its world x-footprint to roughly x=2-4 after the external
// wall-mount rotation - checked against the dashboard screen (x -1.05 to
// 1.05) and the switchboard (~x 4.2-4.6, itself grown this same round):
// still clear of both with margin.
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
                <boxGeometry args={[0.104, 1.482, 2.002]} />
                <meshStandardMaterial color="#241a12" roughness={0.7} />
            </mesh>

            {/* solid cyan trim strips around the opening - 4 separate
                opaque boxes, not one overlapping semi-transparent plane
                (transparent materials sorting against several other
                near-coplanar surfaces was part of the z-fighting above) */}
            <mesh position={[0.065, 0.8905, 0]}>
                <boxGeometry args={[0.0195, 0.039, 1.82]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[0.065, -0.8905, 0]}>
                <boxGeometry args={[0.0195, 0.039, 1.82]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[0.065, 0, 0.8905]}>
                <boxGeometry args={[0.0195, 1.43, 0.039]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[0.065, 0, -0.8905]}>
                <boxGeometry args={[0.0195, 1.43, 0.039]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>

            {/* glass pane */}
            <mesh position={[0.078, 0, 0]}>
                <planeGeometry args={[1.235, 1.755]} />
                <meshBasicMaterial color={sky} toneMapped={false} />
            </mesh>

            {/* muntin bars - splits the pane into four lights, reads as a
                real window instead of a flat colored rectangle */}
            <mesh position={[0.091, 0, 0]}>
                <boxGeometry args={[0.013, 1.43, 0.039]} />
                <meshStandardMaterial color="#241a12" />
            </mesh>
            <mesh position={[0.091, 0, 0]}>
                <boxGeometry args={[0.013, 0.039, 1.95]} />
                <meshStandardMaterial color="#241a12" />
            </mesh>

            {/* sun (day) / moon (night) disc, low in the pane */}
            <mesh position={[0.104, 0.364, day ? -0.455 : 0.455]}>
                <circleGeometry args={[0.143, 20]} />
                <meshBasicMaterial color={glow} toneMapped={false} />
            </mesh>

            {/* a few stars, only worth drawing at night - positions are
                [y, z] offsets within the pane's own plane (its local x is
                the fixed outward-facing depth, not a second in-plane axis) */}
            {!day && [[0.585, -0.715], [0.65, 0.52], [0.455, 0.78], [0.546, -0.195]].map(([y, z], i) => (
                <mesh key={i} position={[0.104, y - 0.195, z]}>
                    <circleGeometry args={[0.0156, 6]} />
                    <meshBasicMaterial color="#e7edf5" toneMapped={false} />
                </mesh>
            ))}

        </group>

    );

}
