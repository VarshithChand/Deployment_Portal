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

            {/* near/far pushed well past the room's own depth (back wall sits
                ~15 units from the default camera) - the previous 6/18 range
                fogged the back wall ~75% into the background color, which is
                nearly identical to the wall's own color, so the whole back
                half of the room (dashboard included) read as empty void. */}
            <fog attach="fog" args={["#05070b", 12, 34]} />
            <color attach="background" args={["#05070b"]} />

            <hemisphereLight args={["#1c3a4a", "#05070b", 0.55]} />
            <ambientLight intensity={0.5} />
            <pointLight position={[0, 4, 2]} intensity={1.4} color="#22d3ee" distance={16} />
            <pointLight position={[-3, 3, -2]} intensity={0.9} color="#a78bfa" distance={14} />
            <pointLight position={[3, 3, -3]} intensity={0.8} color="#22d3ee" distance={14} />
            <pointLight position={[0, 3.5, -5.5]} intensity={1} color="#22d3ee" distance={10} />

            <Suspense fallback={null}>
                <Room reducedMotion={reducedMotion} />
            </Suspense>

            <CameraRig activeSection={activeSection} reducedMotion={reducedMotion} />

        </Canvas>

    );

}
