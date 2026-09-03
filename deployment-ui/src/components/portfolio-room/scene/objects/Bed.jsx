// A simple low-poly bed - frame, mattress, pillow, headboard. Purely
// decorative, tucked into the back-left corner (clear of the wall
// timeline's stops and the rack) so the room reads as an actual lived-in
// space rather than an empty demo showroom.
export default function Bed({ position = [0, 0, 0], rotation = [0, 0, 0] }) {

    return (

        <group position={position} rotation={rotation}>

            {/* frame */}
            <mesh position={[0, 0.18, 0]}>
                <boxGeometry args={[1.3, 0.16, 2]} />
                <meshStandardMaterial color="#151a22" roughness={0.6} />
            </mesh>

            {/* legs */}
            {[[-0.58, -0.9], [0.58, -0.9], [-0.58, 0.9], [0.58, 0.9]].map(([x, z]) => (
                <mesh key={`${x}-${z}`} position={[x, 0.09, z]}>
                    <boxGeometry args={[0.07, 0.18, 0.07]} />
                    <meshStandardMaterial color="#0a0d13" />
                </mesh>
            ))}

            {/* headboard */}
            <mesh position={[0, 0.55, -1.03]}>
                <boxGeometry args={[1.3, 0.7, 0.06]} />
                <meshStandardMaterial color="#171d26" roughness={0.7} />
            </mesh>

            {/* mattress */}
            <mesh position={[0, 0.32, 0]}>
                <boxGeometry args={[1.2, 0.16, 1.9]} />
                <meshStandardMaterial color="#2a3442" roughness={0.85} />
            </mesh>

            {/* pillow */}
            <mesh position={[0, 0.44, -0.75]}>
                <boxGeometry args={[0.9, 0.1, 0.4]} />
                <meshStandardMaterial color="#3d4a5c" roughness={0.8} />
            </mesh>

            {/* blanket fold */}
            <mesh position={[0, 0.42, 0.35]}>
                <boxGeometry args={[1.18, 0.08, 1.1]} />
                <meshStandardMaterial color="#1c2b3a" roughness={0.8} />
            </mesh>

        </group>

    );

}
