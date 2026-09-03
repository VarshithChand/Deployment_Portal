import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import Hotspot from "../Hotspot";
import { ALL_SKILLS, SKILL_GROUPS } from "../../../data/portfolio3dData";

export function CloudMarker({ onSelect, reducedMotion }) {

    return (

        <Hotspot position={[0, 3, -0.5]} onSelect={onSelect} reducedMotion={reducedMotion}>
            {(hovered) => (
                <>
                    <mesh>
                        <icosahedronGeometry args={[0.4, 0]} />
                        <meshStandardMaterial
                            color={hovered ? "#c4b5fd" : "#3b2a6b"}
                            emissive="#a78bfa"
                            emissiveIntensity={hovered ? 1 : 0.5}
                            wireframe
                        />
                    </mesh>
                    <mesh>
                        <icosahedronGeometry args={[0.22, 0]} />
                        <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={0.8} />
                    </mesh>
                </>
            )}
        </Hotspot>

    );

}

// The "3D nodes connected by lines" graph, only mounted while the skills
// panel is open (not part of the always-visible room, since it's dense
// enough to be visual clutter otherwise). Positions are computed once
// per mount; hovering a node highlights its own group's connections
// rather than literally every pairwise line, which is what "hovering a
// node highlights its connected nodes" means here (nodes in the same
// skill group read as "connected").
export function SkillsGraph({ reducedMotion }) {

    const groupRef = useRef();
    const [hoveredGroup, setHoveredGroup] = useState(null);

    const nodes = useMemo(() => {

        const groupCount = SKILL_GROUPS.length;

        return ALL_SKILLS.map((skill, i) => {

            const groupIndex = SKILL_GROUPS.findIndex((g) => g.key === skill.group);
            const angle = (groupIndex / groupCount) * Math.PI * 2;
            const withinGroup = SKILL_GROUPS[groupIndex].items.indexOf(skill.label);
            const radius = 1.6 + (withinGroup % 3) * 0.35;

            return {
                ...skill,
                position: [
                    Math.cos(angle) * radius + (Math.random() - 0.5) * 0.3,
                    1.5 + Math.sin(i * 1.7) * 0.6,
                    Math.sin(angle) * radius + (Math.random() - 0.5) * 0.3
                ]
            };

        });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useFrame((_, delta) => {
        if (groupRef.current && !reducedMotion) groupRef.current.rotation.y += delta * 0.06;
    });

    return (

        <group ref={groupRef} position={[0, 0, -0.5]}>

            {nodes.map((node) => {

                const dimmed = hoveredGroup && node.group !== hoveredGroup;

                return (
                    <mesh
                        key={node.label}
                        position={node.position}
                        onPointerOver={(e) => { e.stopPropagation(); setHoveredGroup(node.group); }}
                        onPointerOut={(e) => { e.stopPropagation(); setHoveredGroup(null); }}
                    >
                        <sphereGeometry args={[0.06, 12, 12]} />
                        <meshStandardMaterial
                            color="#22d3ee"
                            emissive="#22d3ee"
                            emissiveIntensity={dimmed ? 0.2 : 0.9}
                            transparent
                            opacity={dimmed ? 0.35 : 1}
                        />
                    </mesh>
                );

            })}

            {nodes.map((a, i) => nodes.slice(i + 1).map((b) => {

                if (a.group !== b.group) return null;

                const dimmed = hoveredGroup && a.group !== hoveredGroup;
                const points = [a.position, b.position].flat();

                return (
                    <line key={`${a.label}-${b.label}`}>
                        <bufferGeometry>
                            <bufferAttribute attach="attributes-position" args={[new Float32Array(points), 3]} />
                        </bufferGeometry>
                        <lineBasicMaterial color="#22d3ee" transparent opacity={dimmed ? 0.05 : 0.25} />
                    </line>
                );

            }))}

        </group>

    );

}

export function SkillsContent() {

    return (

        <div className="p3d-skills">
            {SKILL_GROUPS.map((group) => (
                <div key={group.key} className="p3d-skills-group">
                    <h3>{group.label}</h3>
                    <div className="p3d-skills-tags">
                        {group.items.map((item) => <span key={item} className="p3d-tag">{item}</span>)}
                    </div>
                </div>
            ))}
        </div>

    );

}
