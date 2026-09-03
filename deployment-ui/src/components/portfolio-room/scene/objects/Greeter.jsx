import { useEffect, useRef } from "react";
import { useGLTF, useAnimations, Html } from "@react-three/drei";
import { PROFILE } from "../../data/profile";

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
export default function Greeter({ reducedMotion }) {

    const group = useRef();
    const { scene, animations } = useGLTF(MODEL_URL);
    const { actions, names } = useAnimations(animations, group);

    useEffect(() => {

        const waveName = names.find((n) => /wave/i.test(n)) || names[0];
        const action = waveName && actions[waveName];

        if (!action) return;

        action.reset().fadeIn(0.3).play();
        if (reducedMotion) action.paused = true;

        return () => action.fadeOut(0.3);

    }, [actions, names, reducedMotion]);

    return (

        <group position={[2.5, 0, 4]} rotation={[0, Math.PI, 0]}>

            <group ref={group} scale={0.42}>
                <primitive object={scene} />
            </group>

            <Html position={[0, 2, 0]} center distanceFactor={8} occlude={false}>
                <div className="proom-speech-bubble mono">Hi, I&apos;m {PROFILE.name.split(" ")[0]}</div>
            </Html>

        </group>

    );

}

useGLTF.preload(MODEL_URL);
