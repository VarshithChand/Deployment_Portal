// A simple desk chair - seat, backrest, four legs. Purely decorative,
// tucked under the desk facing the monitor so the desk reads as a real
// workspace rather than furniture with nobody meant to sit at it.
//
// Sized up ~1.2x from the original pass. Seat/leg height (0.42) is kept
// as-is rather than growing along with everything else, so the seat
// stays well clear of the desk surface at y=0.75+.
export default function Chair({ position = [0, 0, 0], rotation = [0, 0, 0] }) {

    return (

        <group position={position} rotation={rotation}>

            {/* seat */}
            <mesh position={[0, 0.42, 0]}>
                <boxGeometry args={[0.5, 0.06, 0.5]} />
                <meshStandardMaterial color="#1c2430" roughness={0.6} />
            </mesh>

            {/* backrest - sits behind the seat (local +z), so with the
                seat facing -z toward the desk this leans away from it */}
            <mesh position={[0, 0.72, 0.22]}>
                <boxGeometry args={[0.48, 0.55, 0.06]} />
                <meshStandardMaterial color="#1c2430" roughness={0.6} />
            </mesh>

            {/* legs */}
            {[[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([x, z]) => (
                <mesh key={`${x}-${z}`} position={[x, 0.2, z]}>
                    <boxGeometry args={[0.048, 0.42, 0.048]} />
                    <meshStandardMaterial color="#0a0d13" />
                </mesh>
            ))}

        </group>

    );

}
