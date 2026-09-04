// Simple desk at the center of the room - the anchor everything else is
// arranged around. Not clickable itself; it just holds the monitor and
// phone. Kept to boxes, matching the "simple primitives" build order.
export default function Desk() {

    return (

        <group position={[0, 0, -1]}>

            {/* a warm wood tone rather than another dark graphite slab -
                everything else on/around the desk (legs, monitor, phone,
                CPU tower) is already some shade of near-black, so the
                desktop itself is the one surface that reads as a
                distinct material instead of blending into that set */}
            <mesh position={[0, 0.75, 0]}>
                <boxGeometry args={[1.6, 0.06, 0.75]} />
                <meshStandardMaterial color="#5c3f2a" roughness={0.65} metalness={0.05} />
            </mesh>

            {[[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]].map(([x, z]) => (
                <mesh key={`${x}-${z}`} position={[x, 0.37, z]}>
                    <boxGeometry args={[0.06, 0.75, 0.06]} />
                    <meshStandardMaterial color="#0a0d13" />
                </mesh>
            ))}

            {/* keyboard - a grid of individual raised keys on top of the
                base slab, not just a flat featureless box, so it actually
                reads as a keyboard up close rather than a plain block */}
            <group position={[0, 0.79, 0.15]}>
                <mesh>
                    <boxGeometry args={[0.55, 0.02, 0.2]} />
                    <meshStandardMaterial color="#10141b" roughness={0.6} />
                </mesh>
                {Array.from({ length: 4 }).flatMap((_, row) =>
                    Array.from({ length: 12 }).map((_, col) => (
                        <mesh key={`${row}-${col}`} position={[-0.22 + col * 0.04, 0.016, -0.06 + row * 0.04]}>
                            <boxGeometry args={[0.032, 0.012, 0.032]} />
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
            <group position={[0.34, 0.78, 0.18]}>
                <mesh scale={[0.045, 0.024, 0.075]}>
                    <sphereGeometry args={[1, 16, 12]} />
                    <meshStandardMaterial color="#10141b" roughness={0.4} />
                </mesh>
                <mesh position={[0, 0.026, 0.01]}>
                    <boxGeometry args={[0.006, 0.008, 0.02]} />
                    <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.4} toneMapped={false} />
                </mesh>
            </group>

            {/* CPU tower - floor-standing beside the desk, a color of its
                own (a cool blue-graphite) rather than matching the
                monitor/desk exactly, with a small cyan power LED */}
            <mesh position={[-1.02, 0.35, -0.15]}>
                <boxGeometry args={[0.28, 0.7, 0.5]} />
                <meshStandardMaterial color="#1a2230" roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[-1.02, 0.6, 0.11]}>
                <boxGeometry args={[0.29, 0.015, 0.015]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[-0.86, 0.15, 0.26]}>
                <sphereGeometry args={[0.012, 8, 8]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.8} toneMapped={false} />
            </mesh>

        </group>

    );

}
