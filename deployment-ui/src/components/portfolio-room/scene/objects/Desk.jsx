// Simple desk at the center of the room - the anchor everything else is
// arranged around. Not clickable itself; it just holds the monitor and
// phone. Kept to boxes, matching the "simple primitives" build order.
//
// Sized up ~1.3x from the original pass (which read as too small/sparse
// against the room in an overview shot) by growing each primitive's own
// dimensions, not by wrapping the group in a scale transform - a group
// scale would also multiply position offsets like the CPU tower's, which
// would shift it into the desk's own now-wider footprint. Growing each
// mesh's own args keeps every anchor point exactly where it already was.
export default function Desk() {

    return (

        <group position={[0, 0, -1]}>

            {/* a warm wood tone rather than another dark graphite slab -
                everything else on/around the desk (legs, monitor, phone,
                CPU tower) is already some shade of near-black, so the
                desktop itself is the one surface that reads as a
                distinct material instead of blending into that set */}
            <mesh position={[0, 0.75, 0]}>
                <boxGeometry args={[2.08, 0.07, 0.975]} />
                <meshStandardMaterial color="#5c3f2a" roughness={0.65} metalness={0.05} />
            </mesh>

            {[[-0.91, -0.39], [0.91, -0.39], [-0.91, 0.39], [0.91, 0.39]].map(([x, z]) => (
                <mesh key={`${x}-${z}`} position={[x, 0.37, z]}>
                    <boxGeometry args={[0.08, 0.75, 0.08]} />
                    <meshStandardMaterial color="#0a0d13" />
                </mesh>
            ))}

            {/* keyboard - a grid of individual raised keys on top of the
                base slab, not just a flat featureless box, so it actually
                reads as a keyboard up close rather than a plain block */}
            <group position={[0, 0.79, 0.15]}>
                <mesh>
                    <boxGeometry args={[0.715, 0.026, 0.26]} />
                    <meshStandardMaterial color="#10141b" roughness={0.6} />
                </mesh>
                {Array.from({ length: 4 }).flatMap((_, row) =>
                    Array.from({ length: 12 }).map((_, col) => (
                        <mesh key={`${row}-${col}`} position={[-0.286 + col * 0.052, 0.021, -0.078 + row * 0.052]}>
                            <boxGeometry args={[0.042, 0.016, 0.042]} />
                            <meshStandardMaterial color="#1c222b" roughness={0.45} />
                        </mesh>
                    ))
                )}
            </group>

            {/* mouse, beside the keyboard - a rounded body (a scaled
                sphere, its lower half embedded in/occluded by the desk
                surface) instead of a flat box, plus a scroll-wheel accent
                strip, so it actually reads as a mouse rather than a
                second small rectangle */}
            <group position={[0.44, 0.78, 0.23]}>
                <mesh scale={[0.059, 0.031, 0.098]}>
                    <sphereGeometry args={[1, 16, 12]} />
                    <meshStandardMaterial color="#10141b" roughness={0.4} />
                </mesh>
                <mesh position={[0, 0.034, 0.013]}>
                    <boxGeometry args={[0.008, 0.01, 0.026]} />
                    <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.4} toneMapped={false} />
                </mesh>
            </group>

            {/* CPU tower - floor-standing beside the desk, a color of its
                own (a cool blue-graphite) rather than matching the
                monitor/desk exactly, with a small cyan power LED. Moved
                further out (x -1.02 -> -1.3) so its own bigger footprint
                doesn't clip into the desktop's now-wider left edge
                (desktop spans to x=-1.04). */}
            <mesh position={[-1.3, 0.42, -0.15]}>
                <boxGeometry args={[0.336, 0.84, 0.6]} />
                <meshStandardMaterial color="#1a2230" roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[-1.3, 0.72, 0.162]}>
                <boxGeometry args={[0.348, 0.018, 0.018]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[-1.108, 0.18, 0.342]}>
                <sphereGeometry args={[0.0144, 8, 8]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.8} toneMapped={false} />
            </mesh>

        </group>

    );

}
