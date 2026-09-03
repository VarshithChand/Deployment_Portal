// A wall-mounted switchboard - a plate with a few toggle switches and
// status LEDs. Purely decorative (not clickable, matches Bed/Chair/
// Plant), placed flush against the right wall near the entrance so the
// room reads as a real furnished space with real fixtures, not just the
// six interactive stations.
export default function SwitchBoard({ position = [0, 0, 0], rotation = [0, 0, 0] }) {

    return (

        <group position={position} rotation={rotation}>

            {/* plate */}
            <mesh>
                <boxGeometry args={[0.02, 0.34, 0.24]} />
                <meshStandardMaterial color="#e8ecf0" roughness={0.5} />
            </mesh>

            {/* three toggle switches */}
            {[-0.08, 0, 0.08].map((z, i) => (
                <mesh key={z} position={[0.02, 0.08, z]} rotation={[0, 0, i === 1 ? 0.5 : -0.4]}>
                    <boxGeometry args={[0.03, 0.05, 0.015]} />
                    <meshStandardMaterial color="#20262e" roughness={0.4} metalness={0.3} />
                </mesh>
            ))}

            {/* status LEDs - one lit cyan, matching the room's own accent */}
            {[-0.08, 0, 0.08].map((z, i) => (
                <mesh key={`led-${z}`} position={[0.011, -0.08, z]}>
                    <sphereGeometry args={[0.008, 6, 6]} />
                    <meshStandardMaterial
                        color={i === 0 ? "#22d3ee" : "#3a4250"}
                        emissive={i === 0 ? "#22d3ee" : "#000000"}
                        emissiveIntensity={i === 0 ? 0.9 : 0}
                        toneMapped={false}
                    />
                </mesh>
            ))}

        </group>

    );

}
