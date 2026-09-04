import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

// One bird, drawn as a pair of thin bars pivoting from a shared center
// point (rotation.x, since the pane's own 2D plane is the y/z axes here,
// not x/y - see the file-level comment on that convention) so they read
// as a flapping "M" silhouette rather than a static dot. Loops across
// the pane's full z-span and back to the start rather than resetting
// abruptly, using a wrapped modulo so the loop point is invisible during
// normal viewing (birds cross back off-pane before reappearing).
function Bird({ z0, y, speed, phase, reducedMotion }) {

    const groupRef = useRef();
    const leftWingRef = useRef();
    const rightWingRef = useRef();

    useFrame((state) => {

        const t = state.clock.elapsedTime;

        if (groupRef.current && !reducedMotion) {
            const span = 1.7;
            const z = (((z0 + t * speed) % span) + span) % span - span / 2;
            groupRef.current.position.z = z;
            groupRef.current.position.y = y + Math.sin(t * 1.3 + phase) * 0.018;
        }

        const flap = reducedMotion ? 0.35 : Math.sin(t * 10 + phase) * 0.4 + 0.45;
        if (leftWingRef.current) leftWingRef.current.rotation.x = flap;
        if (rightWingRef.current) rightWingRef.current.rotation.x = -flap;

    });

    return (
        <group ref={groupRef} position={[0.111, y, z0]}>
            {/* small body dot anchoring both wings - without it, at the
                distance this window is actually viewed from (the fixed
                overview camera, ~11 units away - the room has no
                dedicated close-up window view), the two wing bars alone
                read as disconnected specks rather than one bird */}
            <mesh>
                <sphereGeometry args={[0.011, 6, 6]} />
                <meshBasicMaterial color="#16212e" toneMapped={false} />
            </mesh>
            <group ref={leftWingRef}>
                <mesh position={[0, 0, -0.05]}>
                    <boxGeometry args={[0.012, 0.012, 0.1]} />
                    <meshBasicMaterial color="#16212e" toneMapped={false} />
                </mesh>
            </group>
            <group ref={rightWingRef}>
                <mesh position={[0, 0, 0.05]}>
                    <boxGeometry args={[0.012, 0.012, 0.1]} />
                    <meshBasicMaterial color="#16212e" toneMapped={false} />
                </mesh>
            </group>
        </group>
    );
}

// A handful of birds, staggered start position/height/speed/flap phase
// so they don't all move or flap in lockstep.
const BIRDS = [
    { z0: -0.7, y: 0.55, speed: 0.11, phase: 0 },
    { z0: -0.15, y: 0.24, speed: 0.085, phase: 1.7 },
    { z0: 0.4, y: 0.42, speed: 0.13, phase: 3.4 },
    { z0: 0.05, y: 0.62, speed: 0.07, phase: 5.1 }
];

// One twinkling star. meshBasicMaterial has no lit/emissive response, so
// the twinkle is driven by opacity instead - each star gets its own
// phase so the pane doesn't pulse as one unit.
function Star({ y, z, size, phase, reducedMotion }) {

    const ref = useRef();

    useFrame((state) => {
        if (!ref.current || reducedMotion) return;
        const t = state.clock.elapsedTime;
        ref.current.material.opacity = 0.45 + (Math.sin(t * 1.6 + phase) + 1) / 2 * 0.55;
    });

    return (
        <mesh ref={ref} position={[0.104, y, z]} rotation={[0, Math.PI / 2, 0]}>
            <circleGeometry args={[size, 6]} />
            <meshBasicMaterial color="#e7edf5" transparent opacity={1} toneMapped={false} />
        </mesh>
    );
}

// One star per quadrant of the 4-light pane (see the muntin bars below -
// a vertical bar at z=0 and a horizontal bar at y=0 split the glass into
// four sections). The original pass only ever placed stars in the top
// two sections; the bottom two stayed empty at night. Kept the original
// four positions (converted to this component) and added one per
// quadrant so every "mirror" of the window actually shows stars.
// Sizes bumped up from the original 0.013-0.0156 (same reasoning as the
// birds above - too small to read from the fixed ~11-unit overview
// camera, the only view that ever sees this window).
const STARS = [
    // top-left / top-right (original placements)
    { y: 0.39, z: -0.715, size: 0.032, phase: 0.2 },
    { y: 0.455, z: 0.52, size: 0.032, phase: 2.1 },
    { y: 0.26, z: 0.78, size: 0.032, phase: 4.0 },
    { y: 0.351, z: -0.195, size: 0.032, phase: 5.6 },
    // bottom-left / bottom-right (new)
    { y: -0.3, z: -0.6, size: 0.032, phase: 1.1 },
    { y: -0.55, z: -0.25, size: 0.027, phase: 3.3 },
    { y: -0.25, z: 0.62, size: 0.027, phase: 0.7 },
    { y: -0.58, z: 0.3, size: 0.032, phase: 4.8 }
];

// A wall-mounted window - frame + glass pane, tinted to match the room's
// current theme (a saturated day sky when light, a real night blue when
// dark) rather than a fixed color. Since theme itself already tracks
// real local time by default (see ThemeContext.jsx - light during the
// day, dark at night, until manually overridden), this window is a
// visual echo of that same day/night state, not a separate clock. By
// day, a few birds drift across the pane; by night, twinkling stars
// spread across all four panes rather than sitting in one corner.
// Purely decorative, not clickable.
//
// Every layer (glass/trim/muntins/sun-moon) sits a full 0.01 units apart
// in local x - the first pass packed them 0.001-0.003 apart, which is
// well within z-fighting range at normal viewing distance: the depth
// buffer couldn't reliably resolve which nearly-coplanar surface was in
// front, so most layers randomly failed to render at all instead of
// forming the intended window face.
//
// Sized up ~1.3x from the original pass. At its position (world x=3),
// this grows its world x-footprint to roughly x=2-4 after the external
// wall-mount rotation - checked against the dashboard screen (x -1.05 to
// 1.05) and the switchboard (~x 4.2-4.6, itself grown this same round):
// still clear of both with margin.
export default function Window({ position = [0, 0, 0], rotation = [0, 0, 0], theme, reducedMotion = false }) {

    const day = theme !== "dark";
    // Saturated, real colors rather than pale washes - a pale sky blue
    // sat close enough to the light theme's own pale wall color that the
    // glass barely read as different from the wall it's set into.
    const sky = day ? "#3f8fd1" : "#16233f";
    const glow = day ? "#fef3c7" : "#dbe4f0";

    return (

        <group position={position} rotation={rotation}>

            {/* frame */}
            <mesh>
                <boxGeometry args={[0.104, 1.482, 2.002]} />
                <meshStandardMaterial color="#241a12" roughness={0.7} />
            </mesh>

            {/* solid cyan trim strips around the opening - 4 separate
                opaque boxes, not one overlapping semi-transparent plane
                (transparent materials sorting against several other
                near-coplanar surfaces was part of the z-fighting above) */}
            <mesh position={[0.065, 0.8905, 0]}>
                <boxGeometry args={[0.0195, 0.039, 1.82]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[0.065, -0.8905, 0]}>
                <boxGeometry args={[0.0195, 0.039, 1.82]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[0.065, 0, 0.8905]}>
                <boxGeometry args={[0.0195, 1.43, 0.039]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[0.065, 0, -0.8905]}>
                <boxGeometry args={[0.0195, 1.43, 0.039]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>

            {/* glass pane - rotation.y=90deg is load-bearing, not
                decoration: PlaneGeometry defaults to the local X-Y plane
                (face normal on local Z), but every box in this file
                (frame/trim/muntins) was built on the opposite convention
                - local X is "outward through the wall," Y is height, Z
                is width (see the file-level comment below). Without this
                rotation the pane's face was perpendicular to the wall
                instead of flush with it, so the camera saw it edge-on -
                a barely-visible sliver, with the dark frame showing
                through everywhere else. Same fix applied to the sun/moon
                disc below and to each Star. */}
            <mesh position={[0.078, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[1.95, 1.43]} />
                <meshBasicMaterial color={sky} toneMapped={false} />
            </mesh>

            {/* muntin bars - splits the pane into four lights, reads as a
                real window instead of a flat colored rectangle */}
            <mesh position={[0.091, 0, 0]}>
                <boxGeometry args={[0.013, 1.43, 0.039]} />
                <meshStandardMaterial color="#241a12" />
            </mesh>
            <mesh position={[0.091, 0, 0]}>
                <boxGeometry args={[0.013, 0.039, 1.95]} />
                <meshStandardMaterial color="#241a12" />
            </mesh>

            {/* sun (day) / moon (night) disc, low in the pane */}
            <mesh position={[0.104, 0.364, day ? -0.455 : 0.455]} rotation={[0, Math.PI / 2, 0]}>
                <circleGeometry args={[0.143, 20]} />
                <meshBasicMaterial color={glow} toneMapped={false} />
            </mesh>

            {/* birds by day, twinkling stars (spread across all four
                panes) by night */}
            {day
                ? BIRDS.map((bird, i) => <Bird key={i} {...bird} reducedMotion={reducedMotion} />)
                : STARS.map((star, i) => <Star key={i} {...star} reducedMotion={reducedMotion} />)}

        </group>

    );

}
