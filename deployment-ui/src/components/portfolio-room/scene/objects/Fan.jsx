import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useStore } from "../../state/store";

// Ceiling fan over the bed - on by default (per the explicit request),
// toggled by the switchboard's "fan" switch or the o+1/f+1 keyboard
// shortcuts (see PortfolioRoom.jsx). Purely decorative, not clickable
// itself - the switchboard is the control for it.
//
// Sized up further this round (~1.4x on top of an earlier ~1.4x pass,
// the blades were still hard to make out near the ceiling) - it sits in
// open air well clear of anything else, so no neighbor clearance to
// check here.
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

            {/* mount rod from the ceiling - length kept to 0.45 (not the
                same 1.4x as everything else below it) so the rod top
                (Fan sits at world y=5.5, ceiling is at y=6) stays clear
                of the ceiling plane instead of poking through it */}
            <mesh position={[0, 0.225, 0]}>
                <cylinderGeometry args={[0.03, 0.03, 0.45, 6]} />
                <meshStandardMaterial color="#1a2028" />
            </mesh>

            {/* motor housing */}
            <mesh>
                <cylinderGeometry args={[0.12, 0.12, 0.12, 12]} />
                <meshStandardMaterial color="#171d26" roughness={0.5} metalness={0.4} />
            </mesh>

            {/* power indicator - lit while on */}
            <mesh position={[0, -0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.03, 10]} />
                <meshBasicMaterial color={on ? "#22d3ee" : "#20262e"} toneMapped={false} />
            </mesh>

            {/* 2 blade meshes, each spanning the full diameter through the
                hub (symmetric on both sides of center) - a 4-pointed fan
                silhouette without a 3rd/4th mesh that would just overlap
                the first two exactly at 180 degrees apart */}
            <group ref={bladesRef}>
                <mesh position={[0, -0.04, 0]}>
                    <boxGeometry args={[1, 0.03, 0.18]} />
                    <meshStandardMaterial color="#20262e" roughness={0.6} />
                </mesh>
                <mesh position={[0, -0.04, 0]} rotation={[0, Math.PI / 2, 0]}>
                    <boxGeometry args={[1, 0.03, 0.18]} />
                    <meshStandardMaterial color="#20262e" roughness={0.6} />
                </mesh>
            </group>

        </group>

    );

}
