// The enclosing shell: floor + walls, faint cyan floor grid. Room bounds:
// 16 wide (x: -8..8), 10 deep (z: -5 back wall .. 5 open entrance), 6
// tall (y: 0..6). No wall on the +z side - the visitor enters from
// there, camera starts just outside it.
//
// Dark is the room's original palette; light swaps the base environment
// tone (floor/walls/grid) while keeping cyan as the one constant "glow"
// identity between themes - just a deeper, more saturated cyan in light
// mode (#22d3ee reads pale/washed-out against a white wall). Deliberately
// NOT touched by theme: the monitor and wall-screen "screens" stay
// dark-screened in both, the way a real monitor's screen doesn't turn
// white just because the room around it is bright - see those objects'
// own materials.
const PALETTE = {
    dark: {
        cyan: "#22d3ee",
        floor: "#0b0f16", backWall: "#0d1119", sideWall: "#0b0e15",
        wallEmissive: "#08131a", wallEmissiveIntensity: 0.35, sideWallEmissiveIntensity: 0.25,
        gridMajor: "#0e3540", gridMinor: "#0a1a24",
        ceiling: "#070a10",
        wainscot: "#101f27"
    },
    // First pass had walls sitting only a few % off pure white with the
    // floor barely darker - against the light ambient/directional light
    // (see Experience.jsx) that read as one flat pale haze with no real
    // floor/wall/ceiling distinction, instead of an enclosed room. Walls
    // are now a visibly cooler, darker gray-blue than the floor's own
    // gray-blue (a real floor/wall split, matching how the dark palette
    // already works), and the ceiling darker still - the surface you'd
    // expect to get the least direct light.
    light: {
        cyan: "#0891b2",
        floor: "#b7c3d3", backWall: "#dbe2ea", sideWall: "#d2dae4",
        wallEmissive: "#000000", wallEmissiveIntensity: 0, sideWallEmissiveIntensity: 0,
        gridMajor: "#5b6b83", gridMinor: "#8b98ab",
        ceiling: "#c7d1de",
        wainscot: "#aebfd0"
    }
};

export default function Room({ theme }) {

    const p = PALETTE[theme === "light" ? "light" : "dark"];

    return (

        <group>

            {/* floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[16, 10]} />
                <meshStandardMaterial color={p.floor} roughness={0.9} metalness={0.05} />
            </mesh>

            {/* faint cyan grid on the floor */}
            <gridHelper args={[16, 32, p.gridMajor, p.gridMinor]} position={[0, 0.01, 0]} />

            {/* back wall */}
            <mesh position={[0, 3, -5]}>
                <planeGeometry args={[16, 6]} />
                <meshStandardMaterial color={p.backWall} emissive={p.wallEmissive} emissiveIntensity={p.wallEmissiveIntensity} roughness={0.95} />
            </mesh>

            {/* side walls */}
            <mesh position={[-8, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[10, 6]} />
                <meshStandardMaterial color={p.sideWall} emissive={p.wallEmissive} emissiveIntensity={p.sideWallEmissiveIntensity} roughness={0.95} />
            </mesh>
            <mesh position={[8, 3, 0]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[10, 6]} />
                <meshStandardMaterial color={p.sideWall} emissive={p.wallEmissive} emissiveIntensity={p.sideWallEmissiveIntensity} roughness={0.95} />
            </mesh>

            {/* a painted lower band on every wall, plus a thin cyan trim
                line at its top edge - the previous walls were a single
                flat color floor-to-ceiling, which read as bare drywall
                rather than an actually finished, painted room */}
            <mesh position={[0, 0.7, -4.99]}>
                <planeGeometry args={[16, 1.4]} />
                <meshStandardMaterial color={p.wainscot} roughness={0.85} />
            </mesh>
            <mesh position={[-7.99, 0.7, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[10, 1.4]} />
                <meshStandardMaterial color={p.wainscot} roughness={0.85} />
            </mesh>
            <mesh position={[7.99, 0.7, 0]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[10, 1.4]} />
                <meshStandardMaterial color={p.wainscot} roughness={0.85} />
            </mesh>
            <mesh position={[0, 1.41, -4.98]}>
                <boxGeometry args={[16, 0.02, 0.02]} />
                <meshStandardMaterial color={p.cyan} emissive={p.cyan} emissiveIntensity={0.5} toneMapped={false} />
            </mesh>
            <mesh position={[-7.98, 1.41, 0]}>
                <boxGeometry args={[0.02, 0.02, 10]} />
                <meshStandardMaterial color={p.cyan} emissive={p.cyan} emissiveIntensity={0.3} toneMapped={false} />
            </mesh>
            <mesh position={[7.98, 1.41, 0]}>
                <boxGeometry args={[0.02, 0.02, 10]} />
                <meshStandardMaterial color={p.cyan} emissive={p.cyan} emissiveIntensity={0.3} toneMapped={false} />
            </mesh>

            {/* ceiling - mostly there so the pendant light's cord/mount
                has something to attach to visually */}
            <mesh position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <planeGeometry args={[16, 10]} />
                <meshStandardMaterial color={p.ceiling} roughness={1} />
            </mesh>

            {/* thin cyan rim strips along the top of every wall - the back
                wall's own rim was the only one before, which read fine
                head-on but left the side walls fading into the fog with
                no defined edge once the camera turned toward them. All
                three together give the room a consistent, legible
                boundary regardless of which way you're looking. */}
            <mesh position={[0, 5.97, -4.98]}>
                <boxGeometry args={[16, 0.04, 0.04]} />
                <meshStandardMaterial color={p.cyan} emissive={p.cyan} emissiveIntensity={0.8} toneMapped={false} />
            </mesh>
            <mesh position={[-7.98, 5.97, 0]}>
                <boxGeometry args={[0.04, 0.04, 10]} />
                <meshStandardMaterial color={p.cyan} emissive={p.cyan} emissiveIntensity={0.5} toneMapped={false} />
            </mesh>
            <mesh position={[7.98, 5.97, 0]}>
                <boxGeometry args={[0.04, 0.04, 10]} />
                <meshStandardMaterial color={p.cyan} emissive={p.cyan} emissiveIntensity={0.5} toneMapped={false} />
            </mesh>

        </group>

    );

}
