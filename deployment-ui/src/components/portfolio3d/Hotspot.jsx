import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";

// Shared "clickable 3D object with a hover state" wrapper every station
// marker uses - glow/scale up on hover (so it's obvious what's clickable,
// per the interaction requirement) and a gentle floating bob so the room
// reads as alive without being busy. Cursor swaps to a pointer on hover
// via onPointerOver/Out, matching normal web affordance expectations even
// inside a canvas.
export default function Hotspot({ position, onSelect, floatOffset = 0, reducedMotion, children }) {

    const groupRef = useRef();
    const [hovered, setHovered] = useState(false);
    const time = useRef(floatOffset);

    useFrame((_, delta) => {

        if (!groupRef.current) return;

        if (!reducedMotion) {
            time.current += delta;
            groupRef.current.position.y = position[1] + Math.sin(time.current * 0.8) * 0.06;
        }

        const targetScale = hovered ? 1.12 : 1;
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
