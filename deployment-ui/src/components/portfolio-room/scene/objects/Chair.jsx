// A simple desk chair - seat, backrest, four legs. Purely decorative,
// tucked under the desk facing the monitor so the desk reads as a real
// workspace rather than furniture with nobody meant to sit at it.
export default function Chair({ position = [0, 0, 0], rotation = [0, 0, 0] }) {

    return (

        <group position={position} rotation={rotation}>

            {/* seat */}
            <mesh position={[0, 0.42, 0]}>
                <boxGeometry args={[0.42, 0.05, 0.42]} />
                <meshStandardMaterial color="#1c2430" roughness={0.6} />
            </mesh>

            {/* backrest - sits behind the seat (local +z), so with the
                seat facing -z toward the desk this leans away from it */}
            <mesh position={[0, 0.68, 0.19]}>
                <boxGeometry args={[0.4, 0.5, 0.05]} />
                <meshStandardMaterial color="#1c2430" roughness={0.6} />
            </mesh>

            {/* legs */}
            {[[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].map(([x, z]) => (
                <mesh key={`${x}-${z}`} position={[x, 0.2, z]}>
                    <boxGeometry args={[0.04, 0.42, 0.04]} />
                    <meshStandardMaterial color="#0a0d13" />
                </mesh>
            ))}

        </group>

    );

}
