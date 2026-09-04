import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, Html } from "@react-three/drei";
import { useStore } from "../../state/store";

const MODEL_URL = "/models/Greeter.glb";

// Rigged avatar standing near the entrance, waving hello, with a speech
// bubble. Self-hosted under /public (same reasoning as the self-hosted
// font - the CSP's connect-src is locked to same-origin + the API, so a
// CDN-fetched model would be blocked outright) rather than pointed at a
// Mixamo/Ready Player Me CDN URL.
//
// Placeholder note: this is Tomas Laulhe's CC0-licensed "RobotExpressive"
// rig (distributed via three.js's own examples), used here specifically
// because it ships a real "Wave" animation clip - the same asset commonly
// used for exactly this "wave hello" demo pattern. It is NOT a custom
// Mixamo/Ready Player Me export of a human figure, since generating one
// of those requires using Adobe's or RPM's own web apps interactively,
// which isn't something this tool can do on your behalf. Swap the file at
// public/models/Greeter.glb for your own export whenever you have one -
// nothing else needs to change as long as the new file also has a clip
// with "wave" in its name (see the animation lookup below).
// Default facing (into the room, per the original placement); turns to
// face the opposite way - toward the "room" overview camera, which sits
// well outside the entrance the greeter already stands near - while that
// view is active. FACE_ROOM is just the negation of FACE_DEFAULT rather
// than a precisely-aimed angle at the camera's exact position - a full
// turnaround reads as "now facing you" regardless of the model's own
// raw forward axis, without needing to know that axis for real.
const FACE_DEFAULT = Math.PI;
const FACE_ROOM = 0;

export default function Greeter({ reducedMotion }) {

    const group = useRef();
    const outerRef = useRef();
    const { scene, animations } = useGLTF(MODEL_URL);
    const { actions, names } = useAnimations(animations, group);
    const active = useStore((s) => s.active);
    const facingRoom = active === "room";
    const [showGreeting, setShowGreeting] = useState(false);

    useEffect(() => {

        const waveName = names.find((n) => /wave/i.test(n)) || names[0];
        const action = waveName && actions[waveName];

        if (!action) return;

        action.reset().fadeIn(0.3).play();
        if (reducedMotion) action.paused = true;

        return () => action.fadeOut(0.3);

    }, [actions, names, reducedMotion]);

    // Turn first, speak after - the message only appears once the turn
    // has had time to mostly finish (skipped under reduced motion, where
    // the turn itself is instant anyway).
    useEffect(() => {

        if (!facingRoom) {
            setShowGreeting(false);
            return;
        }

        const timer = setTimeout(() => setShowGreeting(true), reducedMotion ? 0 : 550);
        return () => clearTimeout(timer);

    }, [facingRoom, reducedMotion]);

    useFrame(() => {

        if (!outerRef.current) return;

        const target = facingRoom ? FACE_ROOM : FACE_DEFAULT;

        if (reducedMotion) {
            outerRef.current.rotation.y = target;
            return;
        }

        outerRef.current.rotation.y += (target - outerRef.current.rotation.y) * 0.06;

    });

    return (

        // z pulled in from 4 to 2 (further from the entrance, deeper into
        // the room) - at the old z=4 it sat close enough to the elevated
        // "room" overview camera (CameraRig.jsx, positioned up and behind
        // the entrance) that it fell near the bottom edge of that shot's
        // frustum and read as clipped/sinking below the visible frame.
        // x nudged in from 2.5 to 2.1 - extra clearance from the rack
        // further along the right wall, now that the model reads at its
        // true (much larger than expected) size at this camera distance.
        <group ref={outerRef} position={[2.1, 0, 2]} rotation={[0, FACE_DEFAULT, 0]}>

            {/* scale roughly halved (0.42 -> 0.2) - at 0.42 this GLB's own
                raw export size towered over the desk/rack/door, which
                only became obvious once it was fully in frame (see the
                z-position note above; before that it was clipped near
                the bottom edge, hiding how big it actually was). */}
            <group ref={group} scale={0.2}>
                <primitive object={scene} />
            </group>

            {/* y halved along with scale, roughly matching the model's
                own new height so the bubble still sits just above its
                head instead of floating high over a now-shorter figure */}
            <Html position={[0, 1, 0]} center distanceFactor={8} occlude={false}>
                <div className="proom-speech-bubble mono">
                    {showGreeting ? "Welcome - take a look around!" : "Hi, I'm a bot! How can I help you?"}
                </div>
            </Html>

        </group>

    );

}

useGLTF.preload(MODEL_URL);
