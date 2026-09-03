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

// Canvas root - camera, lights, fog, bloom. `theme` re-themes the room's
// environment (background/fog/floor/walls/grid) and its floating open-air
// labels to match the rest of the application - see PortfolioRoom.jsx,
// which reads the same shared ThemeContext every other page uses rather
// than a room-local preference. Left unchanged between themes on purpose:
// the accent point lights (cyan/purple - the room's deliberate "glow"
// identity, reads fine against either backdrop) and the monitor/wall-
// screen "screen" materials (a real screen doesn't turn white just
// because the room around it is bright).
export default function Experience({ reducedMotion, theme }) {

    const light = theme === "light";
    const bg = light ? "#eef2f7" : "#0a0e14";

    return (

        <Canvas
            gl={{ antialias: true }}
            camera={{ position: [0, 1.6, 6], fov: 50, near: 0.1, far: 40 }}
            dpr={[1, 1.5]}
        >

            <color attach="background" args={[bg]} />
            <fog attach="fog" args={[bg, 9, 26]} />

            <ambientLight intensity={light ? 0.45 : 0.3} />
            <directionalLight position={[3, 6, 4]} intensity={light ? 0.9 : 0.7} />
            <pointLight color="#22d3ee" position={[-6, 4, -2]} intensity={1.4} />
            <pointLight color="#a78bfa" position={[3, 3, -4]} intensity={0.6} />

            <Suspense fallback={null}>

                <Room theme={theme} />
                <Desk />
                <MonitorAbout reducedMotion={reducedMotion} />
                <PhoneContact reducedMotion={reducedMotion} />
                <CeilingLightSkills reducedMotion={reducedMotion} theme={theme} />
                <WallDashboard reducedMotion={reducedMotion} />
                <ServerRackProjects reducedMotion={reducedMotion} theme={theme} />
                <WallTimelineExperience reducedMotion={reducedMotion} theme={theme} />

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
