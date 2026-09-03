import { useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { MONO_FONT } from "../../fonts";
import { useStore } from "../../state/store";
import { DASHBOARD } from "../../data/dashboard";
import { PROJECTS } from "../../data/projects";
import { ALL_SKILLS } from "../../data/skills";

// Always shows the real `value` by default - it used to start at 0 and
// stay there until `trigger` (the Dashboard panel being opened) fired
// even once, but this screen renders constantly on the back wall, fully
// visible from other stations/the overview long before anyone opens
// Dashboard - "0 DEPLOYS · 0 PROJECTS · 0 TECH" was a real, visibly
// false claim sitting on the wall by default, not just an animation
// that hadn't started yet. Now `trigger` only controls the flourish - a
// drop-to-0-and-count-back-up - replayed each time Dashboard opens,
// rather than gating whether the real number ever appears at all.
function useCountUp(value, trigger, reducedMotion) {

    const [n, setN] = useState(value);

    useEffect(() => {

        if (!trigger || reducedMotion) return;

        setN(0);
        let raf;
        const start = performance.now();
        const duration = 900;

        function tick(now) {
            const t = Math.min((now - start) / duration, 1);
            setN(Math.round(value * (1 - Math.pow(1 - t, 3))));
            if (t < 1) raf = requestAnimationFrame(tick);
        }

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);

    }, [value, trigger, reducedMotion]);

    return n;

}

// Large screen on the back wall -> DASHBOARD. Powers on with a quick
// flicker when the camera turns to it, then counts its numbers up.
export default function WallDashboard({ reducedMotion }) {

    const active = useStore((s) => s.active);
    const setActive = useStore((s) => s.setActive);
    const isOpen = active === "dashboard";

    const screenRef = useRef();
    const flickerT = useRef(0);

    const deployments = useCountUp(DASHBOARD.illustrativeDeployments, isOpen, reducedMotion);
    const projects = useCountUp(PROJECTS.length, isOpen, reducedMotion);
    const technologies = useCountUp(ALL_SKILLS.length, isOpen, reducedMotion);

    useFrame((_, delta) => {

        if (!screenRef.current) return;

        const targetOpacity = isOpen ? 1 : 0.55;

        if (isOpen && flickerT.current < 0.4 && !reducedMotion) {
            flickerT.current += delta;
            screenRef.current.material.opacity = Math.random() > 0.4 ? targetOpacity : 0.15;
        } else {
            if (!isOpen) flickerT.current = 0;
            screenRef.current.material.opacity += (targetOpacity - screenRef.current.material.opacity) * 0.2;
        }

    });

    return (

        <Hotspot position={[0, 2.4, -4.8]} onSelect={() => setActive("dashboard")} reducedMotion={reducedMotion}>
            {(hovered) => (
                <>
                    <mesh>
                        <boxGeometry args={[2.1, 1.2, 0.06]} />
                        <meshStandardMaterial color="#0a0d13" roughness={0.7} />
                    </mesh>

                    <mesh ref={screenRef} position={[0, 0, 0.031]}>
                        <planeGeometry args={[2, 1.1]} />
                        <meshBasicMaterial color={hovered ? "#0d3844" : "#04141a"} transparent opacity={0.55} toneMapped={false} />
                    </mesh>

                    <group position={[0, 0, 0.033]}>
                        <Text font={MONO_FONT} fontSize={0.09} color="#5eead4" anchorX="center" anchorY="middle" position={[0, 0.4, 0]}>
                            STATUS
                        </Text>
                        {DASHBOARD.services.map((s, i) => (
                            <Text key={s.name} font={MONO_FONT} fontSize={0.06} color="#c9f4f9" anchorX="center" anchorY="middle" position={[0, 0.21 - i * 0.13, 0]}>
                                {`${s.name.padEnd(9)} ● ${s.status.toUpperCase()}`}
                            </Text>
                        ))}
                        <Text font={MONO_FONT} fontSize={0.052} color="#5eead4" anchorX="center" anchorY="middle" position={[0, -0.42, 0]}>
                            {`${deployments} DEPLOYS · ${projects} PROJECTS · ${technologies} TECH`}
                        </Text>
                    </group>
                </>
            )}
        </Hotspot>

    );

}
