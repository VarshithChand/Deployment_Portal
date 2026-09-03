// The enclosing shell: dark graphite floor + walls, faint cyan floor grid.
// Room bounds: 16 wide (x: -8..8), 10 deep (z: -5 back wall .. 5 open
// entrance), 6 tall (y: 0..6) - matches the brief's own approximate
// dimensions. Everything else (desk, monitor, phone, rack, etc.) is
// positioned relative to these same bounds. No wall on the +z side - the
// visitor enters from there, camera starts just outside it.
export default function Room() {

    return (

        <group>

            {/* floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[16, 10]} />
                <meshStandardMaterial color="#0b0f16" roughness={0.9} metalness={0.05} />
            </mesh>

            {/* faint cyan grid on the floor */}
            <gridHelper args={[16, 32, "#0e3540", "#0a1a24"]} position={[0, 0.01, 0]} />

            {/* back wall */}
            <mesh position={[0, 3, -5]}>
                <planeGeometry args={[16, 6]} />
                <meshStandardMaterial color="#0d1119" emissive="#08131a" emissiveIntensity={0.35} roughness={0.95} />
            </mesh>

            {/* side walls */}
            <mesh position={[-8, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[10, 6]} />
                <meshStandardMaterial color="#0b0e15" emissive="#08131a" emissiveIntensity={0.25} roughness={0.95} />
            </mesh>
            <mesh position={[8, 3, 0]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[10, 6]} />
                <meshStandardMaterial color="#0b0e15" emissive="#08131a" emissiveIntensity={0.25} roughness={0.95} />
            </mesh>

            {/* ceiling - kept faint, mostly there so the pendant light's
                cord/mount has something to attach to visually */}
            <mesh position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <planeGeometry args={[16, 10]} />
                <meshStandardMaterial color="#070a10" roughness={1} />
            </mesh>

            {/* thin cyan rim strip along the top of the back wall - keeps
                the wall legibly *there* against the fog instead of it
                blending flat into the background at a glance */}
            <mesh position={[0, 5.97, -4.98]}>
                <boxGeometry args={[16, 0.04, 0.04]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.8} toneMapped={false} />
            </mesh>

        </group>

    );

}
