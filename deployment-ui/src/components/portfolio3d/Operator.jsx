import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

// Floor waypoints near (not on top of) each station, so the figure
// reads as doing rounds of the room - checking the terminal, glancing
// at the skills board, walking the project row, checking the wall
// dashboard, then the timeline - rather than pacing one empty patch of
// floor. Deliberately not the exact hotspot positions, so it never
// blocks a click target.
const WAYPOINTS = [
    [0.9, 0, 1.6],
    [0.9, 0, -0.9],
    [2.6, 0, -0.6],
    [0.6, 0, -4.2],
    [-2.2, 0, -1.1]
];

const WALK_SPEED = 0.7;
const PAUSE_SECONDS = 2.4;
const OPERATOR_MATERIAL = { color: "#1a2530", emissive: "#5eead4", emissiveIntensity: 0.32, roughness: 0.65 };

// A small ambient figure built from primitives (capsules/spheres, no
// GLB model - see this file group's own "primitives first" build
// order) that walks a loop between stations and pauses at each one, a
// bit of a leg-swing while moving and a slight "reviewing the screen"
// bob while stopped. Purely decorative - no click target, carries no
// information - it exists only so the room reads as a place someone
// actually works in rather than a static diorama with nobody in it.
// Skipped entirely under prefers-reduced-motion, same as every other
// purely-decorative motion already in the room (idle camera drift, the
// loader's reveal, hotspot float/bob).
export default function Operator({ reducedMotion }) {

    const rootRef = useRef();
    const legLRef = useRef();
    const legRRef = useRef();
    const armLRef = useRef();
    const armRRef = useRef();
    const targetIndex = useRef(0);
    const pauseTimer = useRef(0);
    const walkPhase = useRef(0);

    useFrame((_, delta) => {

        if (!rootRef.current) return;

        const target = WAYPOINTS[targetIndex.current];
        const pos = rootRef.current.position;
        const dx = target[0] - pos.x;
        const dz = target[2] - pos.z;
        const dist = Math.hypot(dx, dz);
        const walking = dist > 0.05;

        if (walking) {

            const step = Math.min(dist, WALK_SPEED * delta);
            pos.x += (dx / dist) * step;
            pos.z += (dz / dist) * step;
            rootRef.current.rotation.y = Math.atan2(dx, dz);

            walkPhase.current += delta * 9;
            const swing = Math.sin(walkPhase.current) * 0.55;
            if (legLRef.current) legLRef.current.rotation.x = swing;
            if (legRRef.current) legRRef.current.rotation.x = -swing;
            if (armLRef.current) armLRef.current.rotation.x = -swing * 0.6;
            if (armRRef.current) armRRef.current.rotation.x = swing * 0.6;

        } else {

            pauseTimer.current += delta;

            // legs ease back to a neutral standing pose
            if (legLRef.current) legLRef.current.rotation.x *= 0.85;
            if (legRRef.current) legRRef.current.rotation.x *= 0.85;
            if (armLRef.current) armLRef.current.rotation.x *= 0.85;
            if (armRRef.current) armRRef.current.rotation.x *= 0.85;

            if (pauseTimer.current > PAUSE_SECONDS) {
                pauseTimer.current = 0;
                targetIndex.current = (targetIndex.current + 1) % WAYPOINTS.length;
            }

        }

    });

    if (reducedMotion) return null;

    return (

        <group ref={rootRef} position={WAYPOINTS[0]}>

            {/* legs - grouped so rotation pivots at the hip, not the leg's own center */}
            <group ref={legLRef} position={[-0.055, 0.22, 0]}>
                <mesh position={[0, -0.1, 0]}>
                    <capsuleGeometry args={[0.032, 0.15, 4, 6]} />
                    <meshStandardMaterial {...OPERATOR_MATERIAL} />
                </mesh>
            </group>
            <group ref={legRRef} position={[0.055, 0.22, 0]}>
                <mesh position={[0, -0.1, 0]}>
                    <capsuleGeometry args={[0.032, 0.15, 4, 6]} />
                    <meshStandardMaterial {...OPERATOR_MATERIAL} />
                </mesh>
            </group>

            {/* torso */}
            <mesh position={[0, 0.4, 0]}>
                <capsuleGeometry args={[0.085, 0.2, 4, 8]} />
                <meshStandardMaterial {...OPERATOR_MATERIAL} />
            </mesh>

            {/* arms - grouped so rotation pivots at the shoulder */}
            <group ref={armLRef} position={[-0.12, 0.48, 0]}>
                <mesh position={[0, -0.08, 0]}>
                    <capsuleGeometry args={[0.026, 0.15, 4, 6]} />
                    <meshStandardMaterial {...OPERATOR_MATERIAL} />
                </mesh>
            </group>
            <group ref={armRRef} position={[0.12, 0.48, 0]}>
                <mesh position={[0, -0.08, 0]}>
                    <capsuleGeometry args={[0.026, 0.15, 4, 6]} />
                    <meshStandardMaterial {...OPERATOR_MATERIAL} />
                </mesh>
            </group>

            {/* head */}
            <mesh position={[0, 0.58, 0]}>
                <sphereGeometry args={[0.075, 12, 12]} />
                <meshStandardMaterial {...OPERATOR_MATERIAL} emissiveIntensity={0.4} />
            </mesh>

        </group>

    );

}
