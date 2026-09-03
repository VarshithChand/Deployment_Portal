import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import Hotspot from "../Hotspot";
import { useStore } from "../../state/store";

// Office desk phone next to the keyboard -> CONTACT. Handset lifts off
// the cradle while Contact is open; a small light blinks steadily and
// pulses brighter every few seconds ("rings") whether open or not, so
// the room reads as alive even when nobody's looking at it yet. No audio
// asset - "soft sound" in the brief was explicitly optional.
export default function PhoneContact({ reducedMotion }) {

    const active = useStore((s) => s.active);
    const setActive = useStore((s) => s.setActive);
    const isOpen = active === "contact";

    const handsetRef = useRef();
    const lightRef = useRef();
    const ringPhase = useRef(0);

    useFrame((_, delta) => {

        if (handsetRef.current) {
            const targetY = isOpen ? 0.09 : 0;
            const targetZ = isOpen ? 0.04 : 0;
            handsetRef.current.position.y += (targetY - handsetRef.current.position.y) * 0.12;
            handsetRef.current.position.z += (targetZ - handsetRef.current.position.z) * 0.12;
        }

        if (lightRef.current && !reducedMotion) {
            ringPhase.current += delta;
            // steady blink plus a brighter pulse every ~4s
            const blink = Math.sin(ringPhase.current * 3) > 0 ? 1 : 0.3;
            const ringPulse = (Math.sin(ringPhase.current * 0.4) + 1) / 2;
            lightRef.current.material.emissiveIntensity = 0.6 * blink + ringPulse * 0.8;
        }

    });

    return (

        <Hotspot position={[0.7, 1.05, -0.8]} onSelect={() => setActive("contact")} reducedMotion={reducedMotion}>
            {(hovered) => (
                <>
                    {/* base */}
                    <mesh position={[0, -0.03, 0]}>
                        <boxGeometry args={[0.22, 0.05, 0.16]} />
                        <meshStandardMaterial color={hovered ? "#14202b" : "#0f141b"} roughness={0.6} />
                    </mesh>

                    {/* blinking status light */}
                    <mesh ref={lightRef} position={[0.08, 0.005, -0.05]}>
                        <sphereGeometry args={[0.012, 8, 8]} />
                        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
                    </mesh>

                    {/* cradle prongs */}
                    <mesh position={[-0.06, -0.003, 0.02]}>
                        <boxGeometry args={[0.02, 0.02, 0.06]} />
                        <meshStandardMaterial color="#0a0d13" />
                    </mesh>
                    <mesh position={[0.06, -0.003, 0.02]}>
                        <boxGeometry args={[0.02, 0.02, 0.06]} />
                        <meshStandardMaterial color="#0a0d13" />
                    </mesh>

                    {/* handset - rests on the cradle, lifts when Contact is open */}
                    <mesh ref={handsetRef} position={[0, 0, 0.02]} rotation={[0, 0, isOpen ? 0.15 : 0]}>
                        <boxGeometry args={[0.05, 0.045, 0.2]} />
                        <meshStandardMaterial color={hovered ? "#182530" : "#12181f"} roughness={0.55} />
                    </mesh>

                    {/* coiled cord to the base - a simple bent tube reads
                        as "phone cord" without needing a real curve asset */}
                    <mesh position={[-0.02, 0.01, -0.08]} rotation={[0.3, 0, 0]}>
                        <cylinderGeometry args={[0.006, 0.006, 0.08, 6]} />
                        <meshStandardMaterial color="#1a2028" />
                    </mesh>
                </>
            )}
        </Hotspot>

    );

}
