// An office/gaming chair - high back with an integrated headrest bump,
// armrests, a gas-lift pole, and a 5-star wheeled base, replacing the
// earlier plain 4-legged desk chair. Purely decorative, tucked under the
// desk facing the monitor so the desk reads as a real workspace rather
// than furniture with nobody meant to sit at it.
//
// Local +z is "behind the seat" (backrest side) - with the seat facing
// -z toward the desk, this leans away from it, same convention the old
// chair used, so the call site's position/rotation still line up.
const ACCENT = "#22d3ee";

export default function Chair({ position = [0, 0, 0], rotation = [0, 0, 0] }) {

    return (

        <group position={position} rotation={rotation}>

            {/* gas-lift pole */}
            <mesh position={[0, 0.2, 0]}>
                <cylinderGeometry args={[0.035, 0.04, 0.4, 10]} />
                <meshStandardMaterial color="#20262e" roughness={0.35} metalness={0.6} />
            </mesh>

            {/* 5-star wheeled base */}
            {Array.from({ length: 5 }).map((_, i) => {
                const angle = (i / 5) * Math.PI * 2;
                const len = 0.32;
                const midX = Math.cos(angle) * len * 0.5;
                const midZ = Math.sin(angle) * len * 0.5;
                const endX = Math.cos(angle) * len;
                const endZ = Math.sin(angle) * len;
                return (
                    <group key={i}>
                        <mesh position={[midX, 0.024, midZ]} rotation={[0, -angle, 0]}>
                            <boxGeometry args={[len, 0.028, 0.045]} />
                            <meshStandardMaterial color="#14181f" roughness={0.5} />
                        </mesh>
                        <mesh position={[endX, 0.02, endZ]}>
                            <sphereGeometry args={[0.026, 8, 8]} />
                            <meshStandardMaterial color="#0a0d13" roughness={0.55} metalness={0.2} />
                        </mesh>
                    </group>
                );
            })}

            {/* seat - a base cushion plus a slightly smaller top layer,
                the same "inset panel" trick used for the desk rug, so it
                reads as a padded cushion instead of a flat slab */}
            <mesh position={[0, 0.42, 0]}>
                <boxGeometry args={[0.5, 0.09, 0.48]} />
                <meshStandardMaterial color="#1c2430" roughness={0.55} />
            </mesh>
            <mesh position={[0, 0.468, 0]}>
                <boxGeometry args={[0.44, 0.012, 0.42]} />
                <meshStandardMaterial color="#262f3c" roughness={0.5} />
            </mesh>

            {/* high back with an integrated headrest bump, instead of the
                old flat backrest - reads as an office/gaming chair's
                silhouette rather than a plain kitchen chair */}
            <mesh position={[0, 0.78, 0.21]}>
                <boxGeometry args={[0.46, 0.72, 0.07]} />
                <meshStandardMaterial color="#1c2430" roughness={0.55} />
            </mesh>
            <mesh position={[0, 1.16, 0.195]}>
                <boxGeometry args={[0.3, 0.18, 0.09]} />
                <meshStandardMaterial color="#20262e" roughness={0.5} />
            </mesh>

            {/* cyan accent stripe down the backrest center - ties into
                the room's own cyan identity (switchboard LEDs, rack
                trim, wall rim strips) rather than an arbitrary color */}
            <mesh position={[0, 0.78, 0.246]}>
                <boxGeometry args={[0.05, 0.66, 0.006]} />
                <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.5} toneMapped={false} />
            </mesh>

            {/* armrests */}
            {[-0.29, 0.29].map((x) => (
                <group key={x}>
                    <mesh position={[x, 0.56, 0.02]}>
                        <boxGeometry args={[0.045, 0.22, 0.045]} />
                        <meshStandardMaterial color="#14181f" roughness={0.5} />
                    </mesh>
                    <mesh position={[x, 0.675, 0.02]}>
                        <boxGeometry args={[0.09, 0.03, 0.24]} />
                        <meshStandardMaterial color="#0a0d13" roughness={0.55} />
                    </mesh>
                </group>
            ))}

        </group>

    );

}
