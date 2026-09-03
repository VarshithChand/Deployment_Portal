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
    // lookAt now matches each marker's actual position exactly (it was
    // only approximate before) and every position was pulled back a bit
    // further - the 2D content panel is always screen-centered, so if the
    // camera's lookAt doesn't land dead-on the marker, the marker projects
    // off to one side and pokes out from behind the panel instead of
    // sitting centered behind it, which is what "About" was doing (see
    // the marker at [0, 1.1, 0.6] vs. the old lookAt of [0, 1.3, 0.4]).
    about: { position: [0, 1.75, 4.1], lookAt: [0, 1.1, 0.6] },
    skills: { position: [0, 3.6, 3.9], lookAt: [0, 3, -0.5] },
    // x recentered from 2.95 to 2.02 - the project row shrank from 6 to
    // 3 boxes (see portfolio3dData.js), moving its midpoint.
    projects: { position: [2.02, 2.15, 4.3], lookAt: [2.02, 0.95, -1] },
    experience: { position: [-3.2, 2.15, 3.5], lookAt: [-3.2, 1.3, -1.5] },
    dashboard: { position: [0, 2.4, -2.9], lookAt: [0, 2.6, -5.7] },
    // x matches ContactMarker's position (see ContactConsole.jsx) -
    // -4.8, not -5.5, so the camera's straight-down-Z sightline doesn't
    // line up with one of the back wall's seam decorations
    contact: { position: [-4.8, 1.5, 3.4], lookAt: [-4.8, 0.9, -0.6] }
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
