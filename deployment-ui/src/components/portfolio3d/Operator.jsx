import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";

// Real rigged/animated character (Khronos glTF-Sample-Assets "CesiumMan",
// CC-BY 4.0 - https://github.com/KhronosGroup/glTF-Sample-Assets, credit
// Cesium 2017). Self-hosted under /public/models (same reasoning as the
// self-hosted font: same-origin, works within the existing CSP with no
// policy changes). The file ships exactly one animation clip - a
// full-body walk cycle, no separate idle/wave clip - which isn't used
// for walking here (the figure no longer roams, see below); it's kept
// paused at frame 0 for a consistent standing pose, and the greeting
// wave is done by hand on the "Skeleton_arm_joint_R" shoulder joint
// while the mixer sits frozen (safe: a paused mixer doesn't re-drive
// that bone each frame, so the manual rotation isn't fought).
const MODEL_URL = "/models/CesiumMan.glb";

useGLTF.preload(MODEL_URL);

// Fixed spot toward the room's front-right - no longer walks a
// waypoint loop, just stands here facing back toward the room and
// waves periodically.
//
// x=4.4/z=2.8 (the first version of this) put the figure entirely
// outside the room-overview camera's frustum: an object close to the
// camera needs a much smaller x-offset to stay in frame than a far
// one does, for the same field of view, and z=2.8 is close (camera
// sits at z=6.2) while x=4.4 is the kind of offset that only works
// far away (e.g. the project row, out at z=-1). Verified this time by
// computing the camera's actual half-FOV rather than eyeballing it -
// x=2.0/z=1.0 keeps a real margin inside the frustum at the room's
// default aspect ratio.
const POSITION = [2, 0, 1];
const FACING = Math.atan2(-POSITION[0], -POSITION[2]);

// Roughly matches the room's other human-scale primitives (the desk,
// the terminal screen) - the model's native units aren't assumed, its
// real bounding-box height is measured at runtime and scaled to this.
const TARGET_HEIGHT = 0.7;

const WAVE_EVERY_SECONDS = 6;
const WAVE_DURATION_SECONDS = 2.2;

export default function Operator({ reducedMotion }) {

    const rootRef = useRef();
    const armRRef = useRef(null);
    const cycleTimer = useRef(0);
    const waveTime = useRef(0);
    const setUpDone = useRef(false);

    const { scene, animations } = useGLTF(MODEL_URL);
    const { actions } = useAnimations(animations, rootRef);

    useEffect(() => {

        if (!setUpDone.current) {

            const box = new THREE.Box3().setFromObject(scene);
            const height = box.max.y - box.min.y;
            if (height > 0) scene.scale.setScalar(TARGET_HEIGHT / height);

            // re-measure after scaling and sit the feet exactly at y=0,
            // regardless of where the model's own origin/pivot was
            const box2 = new THREE.Box3().setFromObject(scene);
            scene.position.y -= box2.min.y;

            armRRef.current = scene.getObjectByName("Skeleton_arm_joint_R") || null;
            setUpDone.current = true;

        }

        const action = Object.values(actions)[0];
        if (action) {
            action.play();
            action.time = 0;
            action.paused = true;
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actions]);

    useFrame((_, delta) => {

        if (!rootRef.current || !armRRef.current) return;

        cycleTimer.current += delta;
        if (cycleTimer.current > WAVE_EVERY_SECONDS) cycleTimer.current = 0;

        const waving = cycleTimer.current < WAVE_DURATION_SECONDS;

        if (waving) {

            waveTime.current += delta * 7;
            armRRef.current.rotation.z = -1.3 + Math.sin(waveTime.current) * 0.3;

        } else {

            waveTime.current = 0;
            armRRef.current.rotation.z = THREE.MathUtils.lerp(armRRef.current.rotation.z, 0, 0.1);

        }

    });

    if (reducedMotion) return null;

    return (

        <group ref={rootRef} position={POSITION} rotation={[0, FACING, 0]}>
            <primitive object={scene} />
        </group>

    );

}
