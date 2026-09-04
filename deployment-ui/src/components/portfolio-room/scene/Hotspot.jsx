import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";

// Shared "clickable 3D object with a hover state" wrapper - glow/scale up
// on hover so it's obvious what's clickable, cursor swaps to a pointer.
// `float` (default true) is the gentle up/down bob that makes floating
// open-air markers (skill atoms, timeline stops) read as alive - pass
// float={false} for anything that's supposed to be resting on a solid
// surface (the monitor/phone sitting on the desk), where the same bob
// just looks like the object is levitating off the table.
export default function Hotspot({ position, onSelect, floatOffset = 0, reducedMotion, float = true, children }) {

    const groupRef = useRef();
    const [hovered, setHovered] = useState(false);
    const time = useRef(floatOffset);

    useFrame((_, delta) => {

        if (!groupRef.current) return;

        if (!reducedMotion && float) {
            time.current += delta;
            groupRef.current.position.y = position[1] + Math.sin(time.current * 0.8) * 0.05;
        }

        const targetScale = hovered ? 1.08 : 1;
        groupRef.current.scale.lerp({ x: targetScale, y: targetScale, z: targetScale }, 0.15);

    });

    return (

        <group
            ref={groupRef}
            position={position}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
            onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = "auto"; }}
        >
            {children(hovered)}
        </group>

    );

}
