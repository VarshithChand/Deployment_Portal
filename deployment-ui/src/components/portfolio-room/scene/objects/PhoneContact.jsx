import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { MONO_FONT } from "../../fonts";
import { useStore } from "../../state/store";

// Office desk phone next to the keyboard -> CONTACT. Handset lifts off
// the cradle while Contact is open, with a small "message" bubble
// popping up above it (like a real phone lighting up with an incoming
// message) instead of just silently opening the 2D panel; a small light
// blinks steadily and pulses brighter every few seconds ("rings")
// whether open or not, so the room reads as alive even when nobody's
// looking at it yet. No audio asset - "soft sound" in the brief was
// explicitly optional.
//
// y=0.84 (not the desk surface's own 0.78) accounts for the base mesh's
// own local offset below the Hotspot's origin (see its position/height
// below) - the base's BOTTOM face needs to land on the desk surface, not
// the Hotspot's origin point itself. The previous y=1.05 put that gap at
// a full 0.22 units above the desk, which is what read as "flying."
export default function PhoneContact({ reducedMotion }) {

    const active = useStore((s) => s.active);
    const setActive = useStore((s) => s.setActive);
    const isOpen = active === "contact";

    const handsetRef = useRef();
    const lightRef = useRef();
    const bubbleRef = useRef();
    const ringPhase = useRef(0);

    useFrame((state, delta) => {

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

        if (bubbleRef.current) {
            const targetScale = isOpen ? 1 : 0;
            const s = bubbleRef.current.scale.x + (targetScale - bubbleRef.current.scale.x) * (reducedMotion ? 1 : 0.2);
            bubbleRef.current.scale.setScalar(s);
            bubbleRef.current.visible = s > 0.02;
            if (isOpen && !reducedMotion) {
                bubbleRef.current.position.y = 0.42 + Math.sin(state.clock.elapsedTime * 2.5) * 0.015;
            }
        }

    });

    return (

        <Hotspot position={[0.7, 0.84, -0.8]} onSelect={() => setActive("contact")} reducedMotion={reducedMotion} float={false}>
            {(hovered) => (
                <>
                    {/* base - a warmer, distinct dark green-gray so the
                        phone doesn't read as just another copy of the
                        monitor's own cooler graphite tone */}
                    <mesh position={[0, -0.03, 0]}>
                        <boxGeometry args={[0.22, 0.05, 0.16]} />
                        <meshStandardMaterial color={hovered ? "#1c3028" : "#15241d"} roughness={0.6} />
                    </mesh>

                    {/* blinking status light */}
                    <mesh ref={lightRef} position={[0.08, 0.005, -0.05]}>
                        <sphereGeometry args={[0.012, 8, 8]} />
                        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
                    </mesh>

                    {/* cradle prongs */}
                    <mesh position={[-0.06, -0.003, 0.02]}>
                        <boxGeometry args={[0.02, 0.02, 0.06]} />
                        <meshStandardMaterial color="#0a130e" />
                    </mesh>
                    <mesh position={[0.06, -0.003, 0.02]}>
                        <boxGeometry args={[0.02, 0.02, 0.06]} />
                        <meshStandardMaterial color="#0a130e" />
                    </mesh>

                    {/* handset - rests on the cradle, lifts when Contact is open */}
                    <mesh ref={handsetRef} position={[0, 0, 0.02]} rotation={[0, 0, isOpen ? 0.15 : 0]}>
                        <boxGeometry args={[0.05, 0.045, 0.2]} />
                        <meshStandardMaterial color={hovered ? "#213a2f" : "#182920"} roughness={0.55} />
                    </mesh>

                    {/* coiled cord to the base - a simple bent tube reads
                        as "phone cord" without needing a real curve asset */}
                    <mesh position={[-0.02, 0.01, -0.08]} rotation={[0.3, 0, 0]}>
                        <cylinderGeometry args={[0.006, 0.006, 0.08, 6]} />
                        <meshStandardMaterial color="#1a2028" />
                    </mesh>

                    {/* "message" bubble - pops up while Contact is open,
                        like a real phone lighting up with a notification,
                        instead of the 2D panel being the only sign
                        anything happened */}
                    <Billboard ref={bubbleRef} position={[0, 0.42, 0]} scale={0}>
                        <mesh>
                            <planeGeometry args={[0.22, 0.09]} />
                            <meshBasicMaterial color="#0e131a" toneMapped={false} />
                        </mesh>
                        <mesh position={[0, -0.052, 0]} rotation={[0, 0, Math.PI / 4]}>
                            <planeGeometry args={[0.025, 0.025]} />
                            <meshBasicMaterial color="#0e131a" toneMapped={false} />
                        </mesh>
                        <Text font={MONO_FONT} fontSize={0.032} color="#22d3ee" anchorX="center" anchorY="middle" position={[0, 0, 0.001]}>
                            1 new message
                        </Text>
                    </Billboard>
                </>
            )}
        </Hotspot>

    );

}
