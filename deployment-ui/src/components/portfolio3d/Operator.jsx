import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import { MONO_FONT } from "./fonts";

// A hand-built cartoon greeter avatar (ported from a standalone raw-
// three.js page the user provided into this app's actual R3F/drei
// stack - the original used its own <script src=cdn three.min.js>,
// scene, camera and render loop, none of which can just be dropped in
// here: a second copy of three.js from an external CDN would violate
// this app's CSP (script-src 'self') and conflict with the one real
// copy already bundled, and a standalone camera/render loop would
// fight the room's own CameraRig-driven camera). Replaces the earlier
// CesiumMan GLTF figure entirely - no external model/texture asset
// anymore, so no CSP/async-load risk the way that one had.
//
// The source design was built at "fills a dedicated hero canvas" scale
// (~2.5 units tall); SCALE below brings it down to roughly match the
// room's other human-scale elements (the desk, the terminal screen,
// ~0.7 units).
const SCALE = 0.28;
// Moved further right, past the project row (x up to 4.5 at z=-1),
// into the open floor space there - z=-1 matches the project row's own
// depth so it reads as sitting in that same area rather than randomly
// placed; x=6 still keeps real margin inside the room-overview
// camera's frustum at that depth (forward distance 7.2, safe |x| up to
// ~7.4 - see the earlier frustum-position fix's own math).
const POSITION = [6, 0, -1];
// The avatar's own face (eyes/smile) is built facing its local +Z - no
// rotation needed to have it face the front/camera, since the room's
// default view sits at a higher Z than this position. The previous
// atan2-toward-room-center calculation pointed it ~117 degrees off
// that, facing back toward the room instead of toward the viewer.
const FACING = 0;

const COLOR = {
    skin: "#f1c8a0", hair: "#252a31", shirt: "#1c2733", pants: "#141a22",
    cyan: "#22d3ee", platform: "#11161f", eye: "#1a1f26", mouth: "#8a4a3a"
};

const PARTICLE_COUNT = 90;

export default function Operator({ reducedMotion }) {

    const avatarRef = useRef();
    const headRef = useRef();
    const rightArmRef = useRef();
    const particlesRef = useRef();
    const timeRef = useRef(0);

    const particlePositions = useMemo(() => {

        const arr = new Float32Array(PARTICLE_COUNT * 3);
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            arr[i * 3] = (Math.random() - 0.5) * 10;
            arr[i * 3 + 1] = Math.random() * 6;
            arr[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
        }
        return arr;

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useFrame((_, delta) => {

        if (reducedMotion) return;

        timeRef.current += delta;
        const t = timeRef.current;

        if (rightArmRef.current) rightArmRef.current.rotation.z = 2.35 + Math.sin(t * 6) * 0.24;
        if (avatarRef.current) avatarRef.current.position.y = Math.sin(t * 1.4) * 0.03;
        if (headRef.current) headRef.current.rotation.z = Math.sin(t * 1.4) * 0.03;
        if (particlesRef.current) particlesRef.current.rotation.y = t * 0.03;

    });

    return (

        <group position={POSITION} rotation={[0, FACING, 0]} scale={SCALE}>

            {/* platform + glow rings */}
            <mesh position={[0, -0.06, 0]}>
                <cylinderGeometry args={[1.5, 1.6, 0.12, 48]} />
                <meshStandardMaterial color={COLOR.platform} roughness={0.65} metalness={0.05} />
            </mesh>
            <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[1, 0.012, 8, 64]} />
                <meshStandardMaterial color={COLOR.cyan} emissive={COLOR.cyan} emissiveIntensity={0.9} roughness={0.4} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[1.35, 0.008, 8, 64]} />
                <meshStandardMaterial color={COLOR.cyan} emissive={COLOR.cyan} emissiveIntensity={0.9} roughness={0.4} toneMapped={false} />
            </mesh>

            {/* ambient particle field */}
            <points ref={particlesRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[particlePositions, 3]} />
                </bufferGeometry>
                <pointsMaterial color={COLOR.cyan} size={0.03} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
            </points>

            <group ref={avatarRef}>

                {/* legs + feet */}
                {[-0.2, 0.2].map((x) => (
                    <group key={x}>
                        <mesh position={[x, 0.45, 0]}>
                            <cylinderGeometry args={[0.16, 0.14, 0.85, 20]} />
                            <meshStandardMaterial color={COLOR.pants} roughness={0.65} metalness={0.05} />
                        </mesh>
                        <mesh position={[x, 0.05, 0.05]} scale={[1, 0.6, 1.4]}>
                            <sphereGeometry args={[0.17, 16, 16]} />
                            <meshStandardMaterial color={COLOR.pants} roughness={0.65} metalness={0.05} />
                        </mesh>
                    </group>
                ))}

                {/* hips + torso + collar */}
                <mesh position={[0, 0.92, 0]} scale={[1, 0.7, 1]}>
                    <sphereGeometry args={[0.37, 24, 24]} />
                    <meshStandardMaterial color={COLOR.pants} roughness={0.65} metalness={0.05} />
                </mesh>
                <mesh position={[0, 1.32, 0]}>
                    <cylinderGeometry args={[0.34, 0.42, 0.82, 28]} />
                    <meshStandardMaterial color={COLOR.shirt} roughness={0.65} metalness={0.05} />
                </mesh>
                <mesh position={[0, 1.66, 0]} scale={[1, 0.7, 0.9]}>
                    <sphereGeometry args={[0.43, 24, 24]} />
                    <meshStandardMaterial color={COLOR.shirt} roughness={0.65} metalness={0.05} />
                </mesh>
                <mesh position={[0, 1.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.34, 0.02, 8, 40]} />
                    <meshStandardMaterial color={COLOR.cyan} emissive={COLOR.cyan} emissiveIntensity={0.9} roughness={0.4} toneMapped={false} />
                </mesh>

                {/* neck + head */}
                <mesh position={[0, 1.82, 0]}>
                    <cylinderGeometry args={[0.12, 0.13, 0.16, 16]} />
                    <meshStandardMaterial color={COLOR.skin} roughness={0.65} metalness={0.05} />
                </mesh>

                <group ref={headRef} position={[0, 2.12, 0]}>

                    <mesh>
                        <sphereGeometry args={[0.4, 32, 32]} />
                        <meshStandardMaterial color={COLOR.skin} roughness={0.65} metalness={0.05} />
                    </mesh>

                    {/* hair cap + fringe */}
                    <mesh position={[0, 0.06, -0.03]} scale={[1, 0.95, 1]}>
                        <sphereGeometry args={[0.43, 32, 32]} />
                        <meshStandardMaterial color={COLOR.hair} roughness={0.8} />
                    </mesh>
                    <mesh position={[0, 0.28, 0]}>
                        <boxGeometry args={[0.86, 0.16, 0.5]} />
                        <meshStandardMaterial color={COLOR.hair} roughness={0.8} />
                    </mesh>

                    {/* eyes */}
                    {[-0.14, 0.14].map((x) => (
                        <mesh key={x} position={[x, 0.04, 0.36]}>
                            <sphereGeometry args={[0.05, 16, 16]} />
                            <meshStandardMaterial color={COLOR.eye} roughness={0.65} metalness={0.05} />
                        </mesh>
                    ))}

                    {/* smile */}
                    <mesh position={[0, -0.1, 0.34]} rotation={[0, 0, Math.PI]}>
                        <torusGeometry args={[0.12, 0.02, 8, 20, Math.PI]} />
                        <meshStandardMaterial color={COLOR.mouth} roughness={0.65} metalness={0.05} />
                    </mesh>

                </group>

                {/* arms - shoulder pivot, hangs down -y. Right arm waves,
                    left rests at a slight inward angle. */}
                <group ref={rightArmRef} position={[0.5, 1.6, 0]}>
                    <mesh position={[0, -0.25, 0]}>
                        <cylinderGeometry args={[0.12, 0.11, 0.5, 16]} />
                        <meshStandardMaterial color={COLOR.shirt} roughness={0.65} metalness={0.05} />
                    </mesh>
                    <mesh position={[0, -0.5, 0]}>
                        <sphereGeometry args={[0.12, 16, 16]} />
                        <meshStandardMaterial color={COLOR.shirt} roughness={0.65} metalness={0.05} />
                    </mesh>
                    <mesh position={[0, -0.72, 0]}>
                        <cylinderGeometry args={[0.11, 0.1, 0.45, 16]} />
                        <meshStandardMaterial color={COLOR.skin} roughness={0.65} metalness={0.05} />
                    </mesh>
                    <mesh position={[0, -1, 0]}>
                        <sphereGeometry args={[0.14, 20, 20]} />
                        <meshStandardMaterial color={COLOR.skin} roughness={0.65} metalness={0.05} />
                    </mesh>
                </group>
                <group position={[-0.5, 1.6, 0]} rotation={[0, 0, -0.16]}>
                    <mesh position={[0, -0.25, 0]}>
                        <cylinderGeometry args={[0.12, 0.11, 0.5, 16]} />
                        <meshStandardMaterial color={COLOR.shirt} roughness={0.65} metalness={0.05} />
                    </mesh>
                    <mesh position={[0, -0.5, 0]}>
                        <sphereGeometry args={[0.12, 16, 16]} />
                        <meshStandardMaterial color={COLOR.shirt} roughness={0.65} metalness={0.05} />
                    </mesh>
                    <mesh position={[0, -0.72, 0]}>
                        <cylinderGeometry args={[0.11, 0.1, 0.45, 16]} />
                        <meshStandardMaterial color={COLOR.skin} roughness={0.65} metalness={0.05} />
                    </mesh>
                    <mesh position={[0, -1, 0]}>
                        <sphereGeometry args={[0.14, 20, 20]} />
                        <meshStandardMaterial color={COLOR.skin} roughness={0.65} metalness={0.05} />
                    </mesh>
                </group>

            </group>

            {/* greeting label - "Hi, I'm Varshith" in the source became
                just "HI, WELCOME" per the request */}
            <Billboard position={[0, 2.9, 0]}>
                <Text
                    font={MONO_FONT}
                    fontSize={0.32}
                    color="#eafaff"
                    outlineWidth={0.02}
                    outlineColor="#031014"
                    anchorX="center"
                    anchorY="bottom"
                >
                    HI, WELCOME
                </Text>
            </Billboard>

        </group>

    );

}
