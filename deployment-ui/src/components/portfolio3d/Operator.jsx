import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

// Floor waypoints near (not on top of) each station, so the figure
// reads as doing rounds of the room - checking the terminal, glancing
// at the skills board, walking the project row, checking the wall
// dashboard, then the timeline - rather than pacing one empty patch of
// floor. Deliberately not the exact hotspot positions, so it never
// blocks a click target. Index 0 doubles as "home" - the spot near the
// desk it starts at and returns to each loop, where it waves instead
// of just idling.
const WAYPOINTS = [
    [0.9, 0, 1.6],
    [0.9, 0, -0.9],
    [2.6, 0, -0.6],
    [0.6, 0, -4.2],
    [-2.2, 0, -1.1]
];

const WALK_SPEED = 0.7;
const PAUSE_SECONDS = 2.4;

// Color-blocked (skin/hair vs. shirt vs. pants) instead of one uniform
// material for the whole body - a single flat color reading as one
// blob is exactly what made the earlier version look like a toy rather
// than a person; real clothing/skin contrast is what a silhouette
// actually needs to read as human even at this low a poly count.
const SKIN = { color: "#e0b48c", roughness: 0.6 };
const HAIR = { color: "#1c140f", roughness: 0.7 };
const SHIRT = { color: "#124452", emissive: "#22d3ee", emissiveIntensity: 0.22, roughness: 0.55 };
const PANTS = { color: "#12181f", roughness: 0.6 };

// A small ambient figure built from primitives (capsules/spheres, no
// GLB model - see this file group's own "primitives first" build
// order) that walks a loop between stations and pauses at each one:
// legs/arms swing while walking, and it waves whenever it's back at
// its "home" spot near the desk (targetIndex 0) rather than just
// idling everywhere identically. Purely ambient - no click target,
// carries no information. Skipped entirely under
// prefers-reduced-motion, same as every other purely-decorative motion
// already in the room.
export default function Operator({ reducedMotion }) {

    const rootRef = useRef();
    const legLRef = useRef();
    const legRRef = useRef();
    const armLRef = useRef();
    const armRRef = useRef();
    const targetIndex = useRef(0);
    const pauseTimer = useRef(0);
    const walkPhase = useRef(0);
    const waveTime = useRef(0);

    useFrame((_, delta) => {

        if (!rootRef.current) return;

        const target = WAYPOINTS[targetIndex.current];
        const pos = rootRef.current.position;
        const dx = target[0] - pos.x;
        const dz = target[2] - pos.z;
        const dist = Math.hypot(dx, dz);
        const walking = dist > 0.05;
        const atHome = targetIndex.current === 0;

        if (walking) {

            const step = Math.min(dist, WALK_SPEED * delta);
            pos.x += (dx / dist) * step;
            pos.z += (dz / dist) * step;
            rootRef.current.rotation.y = Math.atan2(dx, dz);

            walkPhase.current += delta * 9;
            const swing = Math.sin(walkPhase.current) * 0.55;
            if (legLRef.current) legLRef.current.rotation.x = swing;
            if (legRRef.current) legRRef.current.rotation.x = -swing;
            // .rotation.set (not just .rotation.x) - clears any leftover
            // z-rotation from the wave gesture so an arm doesn't stay
            // twisted mid-wave once it starts walking away from home
            if (armLRef.current) armLRef.current.rotation.set(-swing * 0.6, 0, 0);
            if (armRRef.current) armRRef.current.rotation.set(swing * 0.6, 0, 0);

        } else {

            pauseTimer.current += delta;

            if (legLRef.current) legLRef.current.rotation.x *= 0.85;
            if (legRRef.current) legRRef.current.rotation.x *= 0.85;

            if (atHome) {

                // greeting wave - right arm lifts out and up (z), then
                // wiggles side to side (x) like an actual hand wave
                waveTime.current += delta * 7;
                if (armRRef.current) {
                    armRRef.current.rotation.z = -1.9;
                    armRRef.current.rotation.x = Math.sin(waveTime.current) * 0.35;
                }
                if (armLRef.current) {
                    armLRef.current.rotation.x *= 0.85;
                    armLRef.current.rotation.z *= 0.85;
                }

            } else {

                waveTime.current = 0;
                if (armLRef.current) { armLRef.current.rotation.x *= 0.85; armLRef.current.rotation.z *= 0.85; }
                if (armRRef.current) { armRRef.current.rotation.x *= 0.85; armRRef.current.rotation.z *= 0.85; }

            }

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
            <group ref={legLRef} position={[-0.06, 0.22, 0]}>
                <mesh position={[0, -0.1, 0]}>
                    <capsuleGeometry args={[0.035, 0.16, 4, 6]} />
                    <meshStandardMaterial {...PANTS} />
                </mesh>
            </group>
            <group ref={legRRef} position={[0.06, 0.22, 0]}>
                <mesh position={[0, -0.1, 0]}>
                    <capsuleGeometry args={[0.035, 0.16, 4, 6]} />
                    <meshStandardMaterial {...PANTS} />
                </mesh>
            </group>

            {/* torso */}
            <mesh position={[0, 0.4, 0]}>
                <capsuleGeometry args={[0.095, 0.2, 4, 8]} />
                <meshStandardMaterial {...SHIRT} />
            </mesh>

            {/* arms - grouped so rotation pivots at the shoulder, hand at the end */}
            <group ref={armLRef} position={[-0.13, 0.48, 0]}>
                <mesh position={[0, -0.08, 0]}>
                    <capsuleGeometry args={[0.028, 0.15, 4, 6]} />
                    <meshStandardMaterial {...SHIRT} />
                </mesh>
                <mesh position={[0, -0.18, 0]}>
                    <sphereGeometry args={[0.032, 10, 10]} />
                    <meshStandardMaterial {...SKIN} />
                </mesh>
            </group>
            <group ref={armRRef} position={[0.13, 0.48, 0]}>
                <mesh position={[0, -0.08, 0]}>
                    <capsuleGeometry args={[0.028, 0.15, 4, 6]} />
                    <meshStandardMaterial {...SHIRT} />
                </mesh>
                <mesh position={[0, -0.18, 0]}>
                    <sphereGeometry args={[0.032, 10, 10]} />
                    <meshStandardMaterial {...SKIN} />
                </mesh>
            </group>

            {/* head + a simple hair cap (partial sphere) */}
            <mesh position={[0, 0.6, 0]}>
                <sphereGeometry args={[0.078, 14, 14]} />
                <meshStandardMaterial {...SKIN} />
            </mesh>
            <mesh position={[0, 0.635, -0.005]}>
                <sphereGeometry args={[0.082, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
                <meshStandardMaterial {...HAIR} />
            </mesh>

        </group>

    );

}
