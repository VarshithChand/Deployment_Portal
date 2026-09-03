import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import Hotspot from "../Hotspot";
import { useScene } from "../sceneStore";
import { ALL_SKILLS, SKILL_GROUPS } from "../../../data/portfolio3dData";

export function CloudMarker({ onSelect, reducedMotion, dimmed }) {

    return (

        <Hotspot position={[0, 3, -0.5]} onSelect={onSelect} reducedMotion={reducedMotion}>
            {(hovered) => (
                <>
                    <mesh>
                        <icosahedronGeometry args={[0.5, 0]} />
                        <meshStandardMaterial
                            color={hovered ? "#c4b5fd" : "#3b2a6b"}
                            emissive="#a78bfa"
                            emissiveIntensity={hovered ? 1 : dimmed ? 0.15 : 0.7}
                            wireframe
                            transparent
                            opacity={dimmed ? 0.2 : 1}
                            toneMapped={false}
                        />
                    </mesh>
                    <mesh>
                        <icosahedronGeometry args={[0.26, 0]} />
                        <meshStandardMaterial
                            color="#a78bfa"
                            emissive="#a78bfa"
                            emissiveIntensity={dimmed ? 0.15 : 0.9}
                            transparent
                            opacity={dimmed ? 0.2 : 1}
                            toneMapped={false}
                        />
                    </mesh>
                </>
            )}
        </Hotspot>

    );

}

// The "3D nodes connected by lines" graph, only mounted while the skills
// panel is open (not part of the always-visible room, since it's dense
// enough to be visual clutter otherwise). Each skill group gets its own
// compact cluster arranged around a ring (a golden-angle spiral packs a
// group's own nodes close together without overlap) - the previous
// layout derived a node's HEIGHT from its position in the flat, global
// skill list rather than its own group, which scattered a single
// group's nodes across nearly the whole vertical range and made the
// graph read as noise instead of six recognizable categories. Hovering
// a node, or clicking its skill's tag in the 2D panel (see
// SkillsContent's setHighlightedSkillGroup below), highlights every
// node in that same group.
export function SkillsGraph({ reducedMotion }) {

    const { highlightedSkillGroup } = useScene();
    const groupRef = useRef();
    const [hoveredGroup, setHoveredGroup] = useState(null);
    const activeGroup = hoveredGroup || highlightedSkillGroup;

    const nodes = useMemo(() => {

        const groupCount = SKILL_GROUPS.length;

        return ALL_SKILLS.map((skill) => {

            const groupIndex = SKILL_GROUPS.findIndex((g) => g.key === skill.group);
            const group = SKILL_GROUPS[groupIndex];
            const withinGroup = group.items.indexOf(skill.label);
            const groupSize = group.items.length;

            const baseAngle = (groupIndex / groupCount) * Math.PI * 2;
            const baseRadius = 1.9;

            // golden-angle spiral within the cluster - keeps a group's
            // own nodes close and non-overlapping without needing to
            // hand-tune per-item offsets.
            const spiralAngle = withinGroup * 2.4;
            const spiralRadius = 0.14 + Math.sqrt(withinGroup) * 0.13;
            const spread = (withinGroup - (groupSize - 1) / 2) * 0.15;

            return {
                ...skill,
                position: [
                    Math.cos(baseAngle) * baseRadius + Math.cos(spiralAngle) * spiralRadius,
                    1.5 + spread,
                    Math.sin(baseAngle) * baseRadius + Math.sin(spiralAngle) * spiralRadius
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

                const dimmed = activeGroup && node.group !== activeGroup;

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

                const dimmed = activeGroup && a.group !== activeGroup;
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

    const { highlightedSkillGroup, setHighlightedSkillGroup } = useScene();

    return (

        <div className="p3d-skills">
            {SKILL_GROUPS.map((group) => {

                const active = highlightedSkillGroup === group.key;

                return (
                    <div key={group.key} className={`p3d-skills-group${active ? " active" : ""}`}>
                        <h3>{group.label}</h3>
                        <div className="p3d-skills-tags">
                            {group.items.map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    className={`p3d-tag${active ? " on" : ""}`}
                                    aria-pressed={active}
                                    onClick={() => setHighlightedSkillGroup(active ? null : group.key)}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                    </div>
                );

            })}
        </div>

    );

}
