import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Room from "./Room";
import CameraRig, { DESK_SHIFT_Z, SKILLS_SHIFT_Z } from "./CameraRig";
import Desk from "./objects/Desk";
import Chair from "./objects/Chair";
import Bed from "./objects/Bed";
import Plant from "./objects/Plant";
import SwitchBoard from "./objects/SwitchBoard";
import Window from "./objects/Window";
import Clock from "./objects/Clock";
import Rug from "./objects/Rug";
import Door from "./objects/Door";
import Fan from "./objects/Fan";
import BedLight from "./objects/BedLight";
import MonitorAbout from "./objects/MonitorAbout";
import PhoneContact from "./objects/PhoneContact";
import CeilingLightSkills from "./objects/CeilingLightSkills";
import WallDashboard from "./objects/WallDashboard";
import ServerRackProjects from "./objects/ServerRackProjects";
import WallTimelineExperience from "./objects/WallTimelineExperience";
import WelcomeSign from "./objects/WelcomeSign";
import GreeterErrorBoundary from "./objects/GreeterErrorBoundary";
import Greeter from "./objects/Greeter";

// Canvas root - camera, lights, fog, bloom. `theme` re-themes the room's
// environment (background/fog/floor/walls/grid) and its floating open-air
// labels to match the rest of the application - see PortfolioRoom.jsx,
// which reads the same shared ThemeContext every other page uses rather
// than a room-local preference. The monitor/wall-screen "screen"
// materials are left unchanged between themes on purpose - a real screen
// doesn't turn white just because the room around it is bright.
//
// The cyan/purple accent point lights ARE toned down for light mode,
// unlike everything else here that stays fixed - at their original dark-
// mode intensity, sitting close to a wall, they blew the wall's diffuse
// lighting out into an ugly soft blob once that wall was pale instead of
// near-black (an almost-black surface has much more room to brighten
// before clipping to white than a pale one does). Moved back from the
// wall too, so the same "glow accent" effect reads as a highlight rather
// than a localized hot spot either way.
export default function Experience({ reducedMotion, theme, onExit }) {

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

            <ambientLight intensity={light ? 0.35 : 0.3} />
            <directionalLight position={[3, 6, 4]} intensity={light ? 0.55 : 0.7} />
            <pointLight color="#22d3ee" position={[-6, 4, -1]} intensity={light ? 0.7 : 1.4} distance={12} decay={2} />
            <pointLight color="#a78bfa" position={[3, 3, -2]} intensity={light ? 0.3 : 0.6} distance={10} decay={2} />

            {/* key={theme} forces the whole room to remount (not just
                re-render) whenever the theme flips - a defensive
                safeguard on top of the normal prop-driven re-theming
                above and throughout Room.jsx/the station files: every
                material in here gets freshly created against the
                current theme's values instead of relying on React/R3F
                correctly propagating a changed prop through this much
                nested custom-component depth. Costs a brief re-creation
                of the scene's primitives, but only on a deliberate,
                infrequent user action (toggling the theme), not on
                every render. */}
            <Suspense key={theme} fallback={null}>

                <Room theme={theme} />

                {/* The desk cluster (desk/chair/monitor/phone/rug/plant),
                    shifted back toward the back wall as one rigid group -
                    "the table needs to be placed near the wall," instead
                    of floating in the open middle of the room where it
                    was before. Every object inside still uses the exact
                    same relative coordinates that were already tuned
                    against each other; only the group's own position
                    moves. about/contact camera targets (CameraRig.jsx)
                    are shifted by the identical DESK_SHIFT_Z so they keep
                    the same framing, just following the desk back. */}
                <group position={[0, 0, DESK_SHIFT_Z]}>
                    <Desk />
                    <Chair position={[0, 0, -0.3]} />
                    <MonitorAbout reducedMotion={reducedMotion} />
                    <PhoneContact reducedMotion={reducedMotion} />
                    <Rug position={[0, 0, -0.6]} size={[3, 2.2]} />
                </group>

                {/* Skills pendant light - a smaller shift than the desk
                    cluster (SKILLS_SHIFT_Z, see CameraRig.jsx) rather than
                    following it the full way back: its node graph spreads
                    out to roughly a 1.9-unit radius when open, and the
                    full desk shift would push some nodes past the back
                    wall at the far side of their rotation. */}
                <group position={[0, 0, SKILLS_SHIFT_Z]}>
                    <CeilingLightSkills reducedMotion={reducedMotion} theme={theme} />
                </group>

                <WallDashboard reducedMotion={reducedMotion} />
                <ServerRackProjects reducedMotion={reducedMotion} theme={theme} />
                <WallTimelineExperience reducedMotion={reducedMotion} theme={theme} />
                <WelcomeSign theme={theme} />

                {/* remaining furnishing - purely decorative, makes the
                    space read as an actual room rather than a bare demo
                    showroom. Positions are checked against every camera
                    angle the room actually uses (CameraRig.jsx's
                    CAMERA_TARGETS, plus the overview) - the room has no
                    free-look, only those fixed views plus a little idle
                    drift, so anything placed well outside all of them is
                    permanently invisible no matter what, regardless of
                    its own color/lighting. */}
                <Bed position={[-6, 0, -4]} />
                {/* fan hangs directly over the bed, on by default; the
                    sconce sits on the back wall right behind the
                    headboard */}
                <Fan position={[-6, 5.5, -4]} />
                <BedLight position={[-6, 1.3, -4.98]} />
                {/* between the door and the window, per the explicit
                    request - was near the rack instead */}
                <SwitchBoard position={[4.4, 1.4, -4.85]} rotation={[0, -Math.PI / 2, 0]} />
                {/* moved onto the back wall, right of the dashboard
                    screen and directly in the desk/monitor's own sightline
                    - "the desk should be in front of the window" - instead
                    of the side wall near the timeline station, which put
                    it nowhere near the desk at all */}
                <Window position={[3, 2.2, -4.85]} rotation={[0, -Math.PI / 2, 0]} theme={theme} reducedMotion={reducedMotion} />
                <Clock position={[-3, 2.6, -4.83]} scale={1.1} />
                {/* the plant, beside the door rather than next to the
                    desk - moved per the explicit request. Nudged a bit
                    further right (6.9 -> 7.1) than before - both this and
                    the door grew this round, and the door's frame now
                    reaches close enough to x=6.45 that the original spot
                    left too little margin. */}
                <Plant position={[7.1, 0, -4.4]} scale={1.3} />
                {/* The exit door - flush-mounted on the back wall (far
                    right, clear of the dashboard/window cluster), not
                    standing free-floating in the middle of the floor with
                    nothing behind it. Not placed at the room's own literal
                    open +z boundary either (z=5, only ~1.7 units from the
                    overview camera at z=6) - there being no actual wall
                    there to mount it on is exactly the problem, and at
                    that distance a 2.5-unit-tall door would either fill
                    the entire view or get clipped by the camera's own
                    vertical FOV. Clicking it exits, same as the corner
                    Exit button. */}
                <Door position={[5.8, 0, -4.9]} onExit={onExit} theme={theme} />

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
