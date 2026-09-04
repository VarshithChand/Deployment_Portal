import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import { MONO_FONT } from "../../fonts";
import { useStore } from "../../state/store";
import { labelTextColors } from "../../textTheme";
import { PROJECTS } from "../../data/projects";

const UNIT_HEIGHT = 0.32;

function RackUnit({ project, index, selected, onSelect, reducedMotion, labelColors }) {

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

            {/* brown instead of the original near-black - the whole rack
                read as an almost invisible dark mass against the equally
                dark room/floor. A dark-brown *base color* alone wasn't
                enough - meshStandardMaterial's color is multiplied by
                the scene's own (fairly dim, ~0.3 ambient) lighting, so
                even a real brown crushed down to looking black again in
                this corner of the room. Lighter base color plus a low
                warm emissive gives it a guaranteed-visible floor
                regardless of how much light actually reaches it here -
                still well under the cyan LED's own intensity, so it
                doesn't compete with that as the "lit" focal point. Kept
                dark enough overall that the existing project-title text
                (labelColors, tuned against a dark body in both themes)
                stays readable - a much lighter/white body would have
                flipped light theme's own dark text into the same
                legibility problem from the other direction. */}
            <mesh>
                <boxGeometry args={[0.9, UNIT_HEIGHT, 0.55]} />
                <meshStandardMaterial
                    color={hovered || selected ? "#8a6242" : "#6b4a30"}
                    emissive={hovered || selected ? "#5a3d28" : "#3d2a1a"}
                    emissiveIntensity={0.35}
                    roughness={0.6}
                    metalness={0.1}
                />
            </mesh>

            <mesh ref={ledRef} position={[0.38, 0, 0.28]}>
                <boxGeometry args={[0.03, 0.03, 0.01]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>

            <Billboard position={[0, 0, 0.32]}>
                <Text font={MONO_FONT} fontSize={0.045} color={selected ? labelColors.selected : labelColors.idle} outlineWidth={0.003} outlineColor={labelColors.outline} anchorX="center" anchorY="middle" maxWidth={0.8} textAlign="center">
                    {project.title}
                </Text>
            </Billboard>

        </group>

    );

}

// Server rack against the right wall, turned to face into the room ->
// PROJECTS. Each unit is one project; clicking one slides it out like a
// drawer and opens its architecture/links panel.
export default function ServerRackProjects({ reducedMotion, theme }) {

    const active = useStore((s) => s.active);
    const setActive = useStore((s) => s.setActive);
    const selectedProjectId = useStore((s) => s.selectedProjectId);
    const setSelectedProjectId = useStore((s) => s.setSelectedProjectId);
    const isOpen = active === "projects";
    const labelColors = labelTextColors(theme);

    return (

        <group position={[6.5, 1.4, -2]} rotation={[0, -Math.PI / 2, 0]}>

            {/* rack frame - a slightly darker brown than the units
                themselves (so the frame still reads as "behind" them),
                same emissive-floor treatment as the units below it */}
            <mesh position={[0, 0, -0.02]}>
                <boxGeometry args={[1, PROJECTS.length * (UNIT_HEIGHT + 0.05) + 0.15, 0.6]} />
                <meshStandardMaterial color="#4a3220" emissive="#2e1f14" emissiveIntensity={0.3} roughness={0.85} />
            </mesh>

            {!isOpen && (
                <Billboard position={[0, PROJECTS.length * (UNIT_HEIGHT + 0.05) / 2 + 0.28, 0]}>
                    <Text font={MONO_FONT} fontSize={0.09} color={labelColors.title} outlineWidth={0.006} outlineColor={labelColors.outline} anchorX="center" anchorY="bottom">
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
                    labelColors={labelColors}
                    onSelect={() => { setActive("projects"); setSelectedProjectId(project.id); }}
                />
            ))}

        </group>

    );

}
