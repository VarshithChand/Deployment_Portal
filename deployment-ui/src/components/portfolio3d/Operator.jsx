import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";

// Real rigged/animated character (Khronos glTF-Sample-Assets "CesiumMan",
// CC-BY 4.0 - https://github.com/KhronosGroup/glTF-Sample-Assets, credit
// Cesium 2017), replacing the earlier hand-built primitive figure at the
// user's request for something that actually reads as human rather than
// a stylized capsule/sphere build. Self-hosted under /public/models
// (same reasoning as the self-hosted font: same-origin, works within the
// existing CSP with no policy changes). The file ships exactly one
// animation clip - a full-body walk cycle, no separate idle/wave clip -
// so "paused" freezes the mixer mid-pose (action.paused = true) and the
// greeting wave at home is done by hand, rotating the
// "Skeleton_arm_joint_R" shoulder joint directly while the mixer is
// frozen (safe: a paused mixer doesn't re-drive that bone each frame, so
// the manual rotation isn't fought/overwritten - it's cleared again
// automatically the moment the mixer unpauses and resumes evaluating the
// clip). The exact wave rotation axis/sign is a best-effort guess from
// the joint's name alone (no visual tool available to verify the rig's
// rest pose against) - flag it if it looks off and it's a one-line fix.
const MODEL_URL = "/models/CesiumMan.glb";

useGLTF.preload(MODEL_URL);

// Floor waypoints near (not on top of) each station - see the previous
// version's own note: index 0 is "home", near the desk, where it starts
// and returns to each loop, and where it waves instead of idling.
const WAYPOINTS = [
    [0.9, 0, 1.6],
    [0.9, 0, -0.9],
    [2.6, 0, -0.6],
    [0.6, 0, -4.2],
    [-2.2, 0, -1.1]
];

const WALK_SPEED = 0.7;
const PAUSE_SECONDS = 2.4;
// Roughly matches the room's other human-scale primitives (the desk,
// the terminal screen) - the model's native units aren't assumed, its
// real bounding-box height is measured at runtime and scaled to this.
const TARGET_HEIGHT = 0.7;

export default function Operator({ reducedMotion }) {

    const rootRef = useRef();
    const armRRef = useRef(null);
    const targetIndex = useRef(0);
    const pauseTimer = useRef(0);
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
        if (action) action.play();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actions]);

    useFrame((_, delta) => {

        if (!rootRef.current) return;

        const action = Object.values(actions)[0];
        const target = WAYPOINTS[targetIndex.current];
        const pos = rootRef.current.position;
        const dx = target[0] - pos.x;
        const dz = target[2] - pos.z;
        const dist = Math.hypot(dx, dz);
        const walking = dist > 0.05;
        const atHome = targetIndex.current === 0;

        if (walking) {

            const step = Math.min(dist, WALK_SPEED * delta);
            pos.x += (dx / dist) * step;
            pos.z += (dz / dist) * step;
            rootRef.current.rotation.y = Math.atan2(dx, dz);

            if (action) action.paused = false;

        } else {

            pauseTimer.current += delta;
            if (action) action.paused = true;

            if (atHome && armRRef.current) {

                waveTime.current += delta * 7;
                armRRef.current.rotation.z = -1.3 + Math.sin(waveTime.current) * 0.3;

            }

            if (pauseTimer.current > PAUSE_SECONDS) {
                pauseTimer.current = 0;
                waveTime.current = 0;
                targetIndex.current = (targetIndex.current + 1) % WAYPOINTS.length;
            }

        }

    });

    if (reducedMotion) return null;

    return (

        <group ref={rootRef} position={WAYPOINTS[0]}>
            <primitive object={scene} />
        </group>

    );

}
