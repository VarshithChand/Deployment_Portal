import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useStore } from "../state/store";

// One camera position + lookAt target per station, tuned to frame each
// object from a natural standing distance. "overview" is the doorway view
// from the brief: camera at (0, 1.6, 6) looking toward the desk.
//
// about/contact orbit the desk cluster (desk/chair/monitor/phone/rug/
// plant), which Experience.jsx now shifts back by DESK_SHIFT_Z so the
// desk sits close to the back wall instead of floating in the open
// middle of the room - both targets shift by the exact same amount in
// pos and look so each camera keeps the identical framing it already had
// relative to the desk, just following it back.
//
// skills gets its OWN, smaller shift (SKILLS_SHIFT_Z) rather than
// following the desk cluster the full way - its pendant light spreads a
// node graph out to roughly a 1.9-unit radius when open, and shifting it
// the same -2.7 as the desk would push some nodes past the back wall
// (z=-5) at the far side of their rotation. -1.5 keeps every node's
// worst-case reach comfortably inside the room.
export const DESK_SHIFT_Z = -2.7;
export const SKILLS_SHIFT_Z = -1.5;

// Starting point for the one-time "walking in" dolly on arrival - further
// back and a little higher than the overview position itself, so the
// intro tween reads as stepping into the room through the doorway rather
// than the room just fading into view already fully framed. Only used
// once, right when the boot loader (Loader.jsx) finishes and hands off
// to the real scene - see the `loaded`-gated effect below.
const ENTRANCE = { pos: [0, 2.35, 11], look: [0, 1.3, -1] };

export const CAMERA_TARGETS = {
    overview: { pos: [0, 1.6, 6], look: [0, 1.3, -1] },
    about: { pos: [0, 1.4, -0.1 + DESK_SHIFT_Z], look: [0, 1.3, -1.2 + DESK_SHIFT_Z] },
    // y values also follow PhoneContact.jsx's own corrected height
    // (0.84, down from an old 1.05 that had the phone floating ~0.22
    // units above the desk surface) - pos.y shifted by the same -0.21
    // delta as look.y, preserving the original camera-above-target angle.
    contact: { pos: [0.75, 1.04, 0.15 + DESK_SHIFT_Z], look: [0.7, 0.84, -0.8 + DESK_SHIFT_Z] },
    skills: { pos: [0, 3.3, 1.7 + SKILLS_SHIFT_Z], look: [0, 3.9, -1 + SKILLS_SHIFT_Z] },
    dashboard: { pos: [0, 2.3, -1.6], look: [0, 2.4, -4.7] },
    projects: { pos: [3.6, 1.5, -1.6], look: [6.3, 1.4, -2] },
    experience: { pos: [-4, 2, -0.6], look: [-6.3, 2, -2] }
};

// GSAP-driven camera fly-to. A plain object (not the camera itself) is
// tweened, then applied to the real camera in onUpdate - tweening
// camera.position directly works for position but there's no single
// tweenable "lookAt" property, so a proxy with both position and look
// components keeps one smooth, synchronized motion instead of two
// separate tweens drifting out of step with each other.
export default function CameraRig() {

    const { camera } = useThree();
    const active = useStore((s) => s.active);
    const reducedMotion = useStore((s) => s.reducedMotion);
    const loaded = useStore((s) => s.loaded);
    const back = useStore((s) => s.back);

    const mounted = useRef(false);
    const introDone = useRef(false);
    const introPlaying = useRef(false);
    const proxy = useRef({
        x: CAMERA_TARGETS.overview.pos[0], y: CAMERA_TARGETS.overview.pos[1], z: CAMERA_TARGETS.overview.pos[2],
        lx: CAMERA_TARGETS.overview.look[0], ly: CAMERA_TARGETS.overview.look[1], lz: CAMERA_TARGETS.overview.look[2]
    });

    useEffect(() => {

        const target = CAMERA_TARGETS[active] || CAMERA_TARGETS.overview;

        // First render: park at the entrance pose (under reduced motion,
        // skip straight to the real doorway view - there's nothing to
        // walk in from in that case). The actual walk-in happens below,
        // once the boot loader hands off - not here, since the loader
        // overlay is still covering the canvas at this point anyway.
        if (!mounted.current) {
            mounted.current = true;
            const start = reducedMotion ? target : ENTRANCE;
            camera.position.set(...start.pos);
            camera.lookAt(...start.look);
            proxy.current = {
                x: start.pos[0], y: start.pos[1], z: start.pos[2],
                lx: start.look[0], ly: start.look[1], lz: start.look[2]
            };
            if (reducedMotion) introDone.current = true;
            return;
        }

        gsap.killTweensOf(proxy.current);
        gsap.to(proxy.current, {
            x: target.pos[0], y: target.pos[1], z: target.pos[2],
            lx: target.look[0], ly: target.look[1], lz: target.look[2],
            duration: reducedMotion ? 0.01 : 1.3,
            ease: "power2.inOut",
            onUpdate: () => {
                camera.position.set(proxy.current.x, proxy.current.y, proxy.current.z);
                camera.lookAt(proxy.current.lx, proxy.current.ly, proxy.current.lz);
            }
        });

    }, [active, camera, reducedMotion]);

    // One-time "walking in" dolly from the entrance pose to the real
    // overview, timed to start exactly when the boot loader finishes
    // (Loader.jsx's fade-out) - so the room reveal and the camera motion
    // land together instead of the camera sitting still under an opaque
    // overlay. Only ever runs once per mount (introDone), and only when
    // still at the overview (active is null) - if reduced motion is on
    // the camera is already at the overview from the mount effect above,
    // so this just marks intro as done without moving anything.
    useEffect(() => {

        if (!loaded || introDone.current || reducedMotion || active) return;

        introDone.current = true;
        introPlaying.current = true;

        const target = CAMERA_TARGETS.overview;
        gsap.killTweensOf(proxy.current);
        gsap.to(proxy.current, {
            x: target.pos[0], y: target.pos[1], z: target.pos[2],
            lx: target.look[0], ly: target.look[1], lz: target.look[2],
            duration: 1.9,
            ease: "power3.out",
            onUpdate: () => {
                camera.position.set(proxy.current.x, proxy.current.y, proxy.current.z);
                camera.lookAt(proxy.current.lx, proxy.current.ly, proxy.current.lz);
            },
            onComplete: () => { introPlaying.current = false; }
        });

    }, [loaded, active, reducedMotion, camera]);

    // Escape returns to the room overview from anywhere.
    useEffect(() => {

        function onKeyDown(e) {
            if (e.key === "Escape") back();
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);

    }, [back]);

    // Gentle idle drift when nothing is selected, so the room feels alive
    // without being distracting - skipped under reduced motion and while
    // the intro dolly is still playing (both would otherwise fight over
    // camera.position on the same frames, since idle drift reads/writes
    // the exact same proxy the intro tween is actively animating).
    useFrame((state) => {

        if (active || reducedMotion || introPlaying.current) return;

        const t = state.clock.elapsedTime;
        camera.position.x = proxy.current.x + Math.sin(t * 0.15) * 0.12;
        camera.position.y = proxy.current.y + Math.sin(t * 0.11) * 0.04;
        camera.lookAt(proxy.current.lx, proxy.current.ly, proxy.current.lz);

    });

    return null;

}
