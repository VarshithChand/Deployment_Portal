// A simple floor rug under the desk/chair - an accent-colored base plane
// with a slightly smaller inset plane on top, reading as a bordered rug
// rather than a plain rectangle. Sits a hair above the floor (increasing
// y per layer) to avoid z-fighting with the floor plane and the grid
// helper underneath it.
export default function Rug({ position = [0, 0, 0], size = [2.6, 1.8] }) {

    const [w, d] = size;

    return (

        <group position={position}>

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
                <planeGeometry args={[w, d]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.12} roughness={0.9} />
            </mesh>

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.007, 0]}>
                <planeGeometry args={[w - 0.12, d - 0.12]} />
                <meshStandardMaterial color="#101822" roughness={0.95} />
            </mesh>

        </group>

    );

}
