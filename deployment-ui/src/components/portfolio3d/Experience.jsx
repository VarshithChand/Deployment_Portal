import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import Room from "./Room";
import CameraRig from "./CameraRig";
import { useScene } from "./sceneStore";

// Canvas root - camera, lights, fog. No @react-three/postprocessing here
// for real bloom: the emissive materials on every glowing object (see
// Hotspot-based stations) plus ACES tone mapping already read as "soft
// glow" without a second rendering pass, and postprocessing isn't in the
// explicitly-requested stack - real bloom is a reasonable follow-up if
// the emissive-only look isn't glowy enough once you can actually see it
// running, not something to add speculatively now.
export default function Experience({ reducedMotion }) {

    const { activeSection } = useScene();

    return (

        <Canvas
            gl={{ antialias: true, toneMapping: 3 /* THREE.ACESFilmicToneMapping */, toneMappingExposure: 1.1 }}
            camera={{ position: [0, 2.2, 9], fov: 55, near: 0.1, far: 60 }}
            dpr={[1, 1.5]}
        >

            <fog attach="fog" args={["#05070b", 6, 18]} />
            <color attach="background" args={["#05070b"]} />

            <ambientLight intensity={0.35} />
            <pointLight position={[0, 4, 2]} intensity={1.1} color="#22d3ee" distance={12} />
            <pointLight position={[-3, 3, -2]} intensity={0.6} color="#a78bfa" distance={10} />
            <pointLight position={[3, 3, -3]} intensity={0.5} color="#22d3ee" distance={10} />

            <Suspense fallback={null}>
                <Room reducedMotion={reducedMotion} />
            </Suspense>

            <CameraRig activeSection={activeSection} reducedMotion={reducedMotion} />

        </Canvas>

    );

}
