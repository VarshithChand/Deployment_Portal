import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useStore } from "../../state/store";

// Ceiling fan over the bed - on by default (per the explicit request),
// toggled by the switchboard's "fan" switch or the o+1/f+1 keyboard
// shortcuts (see PortfolioRoom.jsx). Purely decorative, not clickable
// itself - the switchboard is the control for it.
export default function Fan({ position = [0, 0, 0] }) {

    const on = useStore((s) => s.switches.fan);
    const bladesRef = useRef();

    useFrame((_, delta) => {

        if (bladesRef.current && on) {
            bladesRef.current.rotation.y += delta * 6;
        }

    });

    return (

        <group position={position}>

            {/* mount rod from the ceiling */}
            <mesh position={[0, 0.15, 0]}>
                <cylinderGeometry args={[0.015, 0.015, 0.3, 6]} />
                <meshStandardMaterial color="#1a2028" />
            </mesh>

            {/* motor housing */}
            <mesh>
                <cylinderGeometry args={[0.06, 0.06, 0.06, 12]} />
                <meshStandardMaterial color="#171d26" roughness={0.5} metalness={0.4} />
            </mesh>

            {/* power indicator - lit while on */}
            <mesh position={[0, -0.035, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.015, 10]} />
                <meshBasicMaterial color={on ? "#22d3ee" : "#20262e"} toneMapped={false} />
            </mesh>

            {/* 2 blade meshes, each spanning the full diameter through the
                hub (symmetric on both sides of center) - a 4-pointed fan
                silhouette without a 3rd/4th mesh that would just overlap
                the first two exactly at 180 degrees apart */}
            <group ref={bladesRef}>
                <mesh position={[0, -0.02, 0]}>
                    <boxGeometry args={[0.5, 0.015, 0.09]} />
                    <meshStandardMaterial color="#20262e" roughness={0.6} />
                </mesh>
                <mesh position={[0, -0.02, 0]} rotation={[0, Math.PI / 2, 0]}>
                    <boxGeometry args={[0.5, 0.015, 0.09]} />
                    <meshStandardMaterial color="#20262e" roughness={0.6} />
                </mesh>
            </group>

        </group>

    );

}
