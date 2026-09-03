import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import gsap from "gsap";

// Where the camera flies to for each station, plus the null/room-overview
// default. Position and lookAt are independent so a fly-to can end at an
// angle rather than always facing dead-on - e.g. the wall dashboard is
// viewed from an angle, not head-on, so it doesn't feel like staring flat
// at a texture.
const CAMERA_TARGETS = {
    // Pulled in from the original [0, 2.2, 9]/[0, 1.4, 0] - at that
    // distance every station read as a small, distant shape surrounded by
    // a lot of empty black frame. Closer + lower fov (see Experience.jsx)
    // makes the desk/hotspot cluster fill the view instead.
    room: { position: [0, 1.9, 6.2], lookAt: [0, 1.4, -0.8] },
    about: { position: [0, 1.5, 2.6], lookAt: [0, 1.3, 0.4] },
    skills: { position: [0.5, 3.6, 3.8], lookAt: [0, 3, -0.5] },
    projects: { position: [3.8, 2, 4], lookAt: [1.5, 1.1, -1] },
    experience: { position: [-4.2, 2, 3], lookAt: [-3.2, 1.6, -1.5] },
    dashboard: { position: [0.3, 2.4, -2.6], lookAt: [0, 2.6, -6] },
    contact: { position: [-2.4, 1.5, 2.4], lookAt: [-2.6, 1.2, -0.6] }
};

// Drives all camera movement with GSAP tweens (never React state driving
// camera.position directly - GSAP owns the easing/timing here, matching
// the "~1-1.5s, never jarring" requirement) and layers a very small idle
// drift on top ONLY while sitting at the room-overview target and only
// when reducedMotion is false - a station being actively viewed never
// drifts, since that would fight whatever the visitor is trying to read.
export default function CameraRig({ activeSection, reducedMotion }) {

    const { camera } = useThree();
    const lookAtRef = useRef(new (camera.position.constructor)(0, 1.4, 0));
    const idleTime = useRef(0);

    useEffect(() => {

        const target = CAMERA_TARGETS[activeSection || "room"] || CAMERA_TARGETS.room;
        const duration = reducedMotion ? 0.4 : 1.3;

        gsap.to(camera.position, {
            x: target.position[0],
            y: target.position[1],
            z: target.position[2],
            duration,
            ease: "power2.inOut"
        });

        gsap.to(lookAtRef.current, {
            x: target.lookAt[0],
            y: target.lookAt[1],
            z: target.lookAt[2],
            duration,
            ease: "power2.inOut"
        });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSection, reducedMotion]);

    useFrame((_, delta) => {

        if (!activeSection && !reducedMotion) {

            idleTime.current += delta;
            const drift = Math.sin(idleTime.current * 0.25) * 0.15;
            camera.position.x = CAMERA_TARGETS.room.position[0] + drift;

        }

        camera.lookAt(lookAtRef.current);

    });

    return null;

}
