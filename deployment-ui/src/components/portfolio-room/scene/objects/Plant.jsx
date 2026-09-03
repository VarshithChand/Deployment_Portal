// A simple potted plant - a pot, a trunk, and a few overlapping foliage
// blobs. Purely decorative (not clickable), built from primitives like
// everything else in the room, placed in otherwise-empty corners to make
// the space read as a lived-in room rather than a bare showroom.
export default function Plant({ position = [0, 0, 0], scale = 1 }) {

    return (

        <group position={position} scale={scale}>

            <mesh position={[0, 0.12, 0]}>
                <cylinderGeometry args={[0.16, 0.13, 0.24, 10]} />
                <meshStandardMaterial color="#3a2a20" roughness={0.9} />
            </mesh>

            <mesh position={[0, 0.28, 0]}>
                <cylinderGeometry args={[0.025, 0.03, 0.18, 6]} />
                <meshStandardMaterial color="#2f4a2e" roughness={0.8} />
            </mesh>

            {[
                [0, 0.5, 0, 0.22],
                [0.13, 0.42, 0.08, 0.16],
                [-0.14, 0.44, -0.05, 0.17],
                [0.02, 0.58, -0.1, 0.15],
                [-0.08, 0.36, 0.12, 0.14]
            ].map(([x, y, z, r], i) => (
                <mesh key={i} position={[x, y, z]}>
                    <icosahedronGeometry args={[r, 0]} />
                    <meshStandardMaterial color={i % 2 === 0 ? "#2f6b3f" : "#3a7d4a"} roughness={0.85} flatShading />
                </mesh>
            ))}

        </group>

    );

}
