import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Room from "./Room";
import CameraRig from "./CameraRig";
import Desk from "./objects/Desk";
import MonitorAbout from "./objects/MonitorAbout";
import PhoneContact from "./objects/PhoneContact";
import CeilingLightSkills from "./objects/CeilingLightSkills";
import WallDashboard from "./objects/WallDashboard";
import ServerRackProjects from "./objects/ServerRackProjects";
import WallTimelineExperience from "./objects/WallTimelineExperience";
import GreeterErrorBoundary from "./objects/GreeterErrorBoundary";
import Greeter from "./objects/Greeter";

// Canvas root - camera, lights, fog, bloom. Dark is the room's only mode,
// not a toggle - the whole point is a lit-up control room, not a bright
// space with an on/off switch for that.
export default function Experience({ reducedMotion }) {

    return (

        <Canvas
            gl={{ antialias: true }}
            camera={{ position: [0, 1.6, 6], fov: 50, near: 0.1, far: 40 }}
            dpr={[1, 1.5]}
        >

            <color attach="background" args={["#0a0e14"]} />
            <fog attach="fog" args={["#0a0e14", 9, 26]} />

            <ambientLight intensity={0.3} />
            <directionalLight position={[3, 6, 4]} intensity={0.7} />
            <pointLight color="#22d3ee" position={[-6, 4, -2]} intensity={1.4} />
            <pointLight color="#a78bfa" position={[3, 3, -4]} intensity={0.6} />

            <Suspense fallback={null}>

                <Room />
                <Desk />
                <MonitorAbout reducedMotion={reducedMotion} />
                <PhoneContact reducedMotion={reducedMotion} />
                <CeilingLightSkills reducedMotion={reducedMotion} />
                <WallDashboard reducedMotion={reducedMotion} />
                <ServerRackProjects reducedMotion={reducedMotion} />
                <WallTimelineExperience reducedMotion={reducedMotion} />

                <GreeterErrorBoundary>
                    <Greeter reducedMotion={reducedMotion} />
                </GreeterErrorBoundary>

            </Suspense>

            <CameraRig />

            <EffectComposer>
                <Bloom intensity={0.9} luminanceThreshold={0.2} mipmapBlur />
            </EffectComposer>

        </Canvas>

    );

}
