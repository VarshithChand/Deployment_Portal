// Simple desk at the center of the room - the anchor everything else is
// arranged around. Not clickable itself; it just holds the monitor and
// phone. Kept to boxes, matching the "simple primitives" build order.
export default function Desk() {

    return (

        <group position={[0, 0, -1]}>

            <mesh position={[0, 0.75, 0]}>
                <boxGeometry args={[1.6, 0.06, 0.75]} />
                <meshStandardMaterial color="#151a22" roughness={0.5} metalness={0.3} />
            </mesh>

            {[[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]].map(([x, z]) => (
                <mesh key={`${x}-${z}`} position={[x, 0.37, z]}>
                    <boxGeometry args={[0.06, 0.75, 0.06]} />
                    <meshStandardMaterial color="#0a0d13" />
                </mesh>
            ))}

            {/* keyboard */}
            <mesh position={[0, 0.79, 0.15]}>
                <boxGeometry args={[0.55, 0.02, 0.2]} />
                <meshStandardMaterial color="#10141b" roughness={0.6} />
            </mesh>

        </group>

    );

}
