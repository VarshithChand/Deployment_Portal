import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import { MONO_FONT } from "../../fonts";
import { useStore } from "../../state/store";
import { PROJECTS } from "../../data/projects";

const UNIT_HEIGHT = 0.32;

function RackUnit({ project, index, selected, onSelect, reducedMotion }) {

    const groupRef = useRef();
    const ledRef = useRef();
    const [hovered, setHovered] = useState(false);

    useFrame((state) => {

        if (groupRef.current) {
            const targetZ = selected ? 0.22 : 0;
            groupRef.current.position.z += (targetZ - groupRef.current.position.z) * 0.15;
        }

        if (ledRef.current && !reducedMotion) {
            const blink = (Math.sin(state.clock.elapsedTime * 2 + index) + 1) / 2;
            ledRef.current.material.emissiveIntensity = 0.4 + blink * 0.6;
        }

    });

    return (

        <group
            ref={groupRef}
            position={[0, index * (UNIT_HEIGHT + 0.05), 0]}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
            onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = "auto"; }}
        >

            <mesh>
                <boxGeometry args={[0.9, UNIT_HEIGHT, 0.55]} />
                <meshStandardMaterial color={hovered || selected ? "#151f28" : "#0e131a"} roughness={0.6} metalness={0.2} />
            </mesh>

            <mesh ref={ledRef} position={[0.38, 0, 0.28]}>
                <boxGeometry args={[0.03, 0.03, 0.01]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>

            <Billboard position={[0, 0, 0.32]}>
                <Text font={MONO_FONT} fontSize={0.045} color={selected ? "#eafaff" : "#9fd8e0"} outlineWidth={0.003} outlineColor="#05141a" anchorX="center" anchorY="middle" maxWidth={0.8} textAlign="center">
                    {project.title}
                </Text>
            </Billboard>

        </group>

    );

}

// Server rack against the right wall, turned to face into the room ->
// PROJECTS. Each unit is one project; clicking one slides it out like a
// drawer and opens its architecture/links panel.
export default function ServerRackProjects({ reducedMotion }) {

    const active = useStore((s) => s.active);
    const setActive = useStore((s) => s.setActive);
    const selectedProjectId = useStore((s) => s.selectedProjectId);
    const setSelectedProjectId = useStore((s) => s.setSelectedProjectId);
    const isOpen = active === "projects";

    return (

        <group position={[6.5, 1.4, -2]} rotation={[0, -Math.PI / 2, 0]}>

            {/* rack frame */}
            <mesh position={[0, 0, -0.02]}>
                <boxGeometry args={[1, PROJECTS.length * (UNIT_HEIGHT + 0.05) + 0.15, 0.6]} />
                <meshStandardMaterial color="#080a0f" roughness={0.85} />
            </mesh>

            {!isOpen && (
                <Billboard position={[0, PROJECTS.length * (UNIT_HEIGHT + 0.05) / 2 + 0.28, 0]}>
                    <Text font={MONO_FONT} fontSize={0.09} color="#67e8f9" outlineWidth={0.006} outlineColor="#031014" anchorX="center" anchorY="bottom">
                        PROJECTS
                    </Text>
                </Billboard>
            )}

            {PROJECTS.map((project, i) => (
                <RackUnit
                    key={project.id}
                    project={project}
                    index={i}
                    selected={isOpen && selectedProjectId === project.id}
                    reducedMotion={reducedMotion}
                    onSelect={() => { setActive("projects"); setSelectedProjectId(project.id); }}
                />
            ))}

        </group>

    );

}
