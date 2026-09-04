import { useStore } from "../../state/store";

// A small wall sconce above the bed's headboard, toggled by the
// switchboard's "bedLight" switch or the o+2/f+2 keyboard shortcuts (see
// PortfolioRoom.jsx). Off by default. Purely decorative, not clickable
// itself - the switchboard is the control for it.
export default function BedLight({ position = [0, 0, 0] }) {

    const on = useStore((s) => s.switches.bedLight);

    return (

        <group position={position}>

            <mesh>
                <boxGeometry args={[0.12, 0.06, 0.05]} />
                <meshStandardMaterial color="#1a2028" roughness={0.6} />
            </mesh>

            <mesh position={[0, -0.02, 0.03]}>
                <planeGeometry args={[0.1, 0.03]} />
                <meshBasicMaterial color={on ? "#ffe9b8" : "#2a2620"} toneMapped={false} />
            </mesh>

            {/* intensity/distance bumped up (0.6/3.5 -> 1.1/4.5) - at the
                old values this technically lit the bed/wall but weakly
                enough to barely register against the room's other,
                brighter accent lights; this should now visibly wash the
                headboard and nearby wall/floor when switched on, not
                just tint them. */}
            {on && <pointLight color="#ffe9b8" intensity={1.1} distance={4.5} position={[0, -0.1, 0.1]} />}

        </group>

    );

}
