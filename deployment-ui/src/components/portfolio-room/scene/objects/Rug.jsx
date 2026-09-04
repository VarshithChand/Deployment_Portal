// A small accent rug under the desk/chair - an accent-colored base plane
// with a slightly smaller inset plane on top, reading as a bordered rug
// rather than a plain rectangle. Sits above the room's own full-floor
// carpet (Room.jsx, layers at y=0.006/0.007) as a second, higher layer -
// y bumped up from that earlier baseline once the room itself grew a
// carpet under it, so this one doesn't z-fight the new layer beneath it.
export default function Rug({ position = [0, 0, 0], size = [2.6, 1.8] }) {

    const [w, d] = size;

    return (

        <group position={position}>

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <planeGeometry args={[w, d]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.12} roughness={0.9} />
            </mesh>

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 0]}>
                <planeGeometry args={[w - 0.12, d - 0.12]} />
                <meshStandardMaterial color="#101822" roughness={0.95} />
            </mesh>

        </group>

    );

}
