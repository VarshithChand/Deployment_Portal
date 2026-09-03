import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { useScene } from "../sceneStore";
import { MONO_FONT } from "../fonts";
import { labelTextColors, purpleTitleColors } from "../textTheme";
import { ALL_SKILLS, SKILL_GROUPS } from "../../../data/portfolio3dData";

export function CloudMarker({ onSelect, reducedMotion, dimmed, theme }) {

    const titleColors = purpleTitleColors(theme);

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

                    {!dimmed && (
                        <Billboard position={[0, 0.65, 0]}>
                            <Text
                                font={MONO_FONT}
                                fontSize={0.11}
                                color={titleColors.title}
                                outlineWidth={0.007}
                                outlineColor={titleColors.outline}
                                anchorX="center"
                                anchorY="bottom"
                            >
                                SKILLS
                            </Text>
                        </Billboard>
                    )}
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
// node in that same group. Clicking a single node selects just that
// skill (brighter, larger sphere). Every atom carries its own name
// label, but a label is only ever visible while its atom has rotated
// around to face the camera - as the cluster spins, atoms "announce"
// themselves coming around and go quiet again on the far side, instead
// of showing 20+ overlapping names at once.
export function SkillsGraph({ reducedMotion, theme }) {

    const { highlightedSkillGroup, setHighlightedSkillGroup } = useScene();
    const labelColors = labelTextColors(theme);
    const groupRef = useRef();
    const labelRefs = useRef([]);
    const [hoveredGroup, setHoveredGroup] = useState(null);
    const [selectedLabel, setSelectedLabel] = useState(null);
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
                    spread,
                    Math.sin(baseAngle) * baseRadius + Math.sin(spiralAngle) * spiralRadius
                ]
            };

        });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useFrame((_, delta) => {

        if (groupRef.current && !reducedMotion) groupRef.current.rotation.y += delta * 0.06;

        // Toggled imperatively via refs (not React state) - a state update
        // per atom per frame would mean a re-render 60 times a second for
        // every atom in the graph, which is exactly the kind of per-frame
        // work useFrame exists to let you sidestep.
        const rotY = groupRef.current ? groupRef.current.rotation.y : 0;
        const cos = Math.cos(rotY);
        const sin = Math.sin(rotY);

        nodes.forEach((node, i) => {

            const label = labelRefs.current[i];
            if (!label) return;

            const [x, , z] = node.position;
            const worldZ = -x * sin + z * cos;
            label.visible = worldZ > 0.3;

        });

    });

    return (

        // Positioned to match CloudMarker's own [0, 3, -0.5] exactly - it
        // previously sat at [0, 0, -0.5] with nodes centered around a
        // local y of 1.5, 1.5 units below where the marker itself lives,
        // so the whole cluster rendered disconnected from (well below)
        // the icosahedron it's meant to surround.
        <group ref={groupRef} position={[0, 3, -0.5]}>

            {nodes.map((node) => {

                const dimmed = activeGroup && node.group !== activeGroup;
                const selected = selectedLabel === node.label;

                return (
                    <mesh
                        key={node.label}
                        position={node.position}
                        onPointerOver={(e) => { e.stopPropagation(); setHoveredGroup(node.group); }}
                        onPointerOut={(e) => { e.stopPropagation(); setHoveredGroup(null); }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLabel((prev) => (prev === node.label ? null : node.label));
                            setHighlightedSkillGroup(node.group);
                        }}
                    >
                        <sphereGeometry args={[selected ? 0.08 : 0.06, 12, 12]} />
                        <meshStandardMaterial
                            color={selected ? "#eafaff" : "#22d3ee"}
                            emissive="#22d3ee"
                            emissiveIntensity={dimmed ? 0.2 : selected ? 1.3 : 0.9}
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

            {/* one label per atom, visibility toggled per-frame above -
                Billboard keeps each one facing the camera regardless of
                the graph's own idle rotation, so whichever ones are
                currently showing stay legible. */}
            {nodes.map((node, i) => {

                if (activeGroup && node.group !== activeGroup) return null;

                const selected = selectedLabel === node.label;

                return (
                    <Billboard
                        key={node.label}
                        ref={(el) => { labelRefs.current[i] = el; }}
                        position={[node.position[0], node.position[1] + 0.13, node.position[2]]}
                    >
                        <Text
                            font={MONO_FONT}
                            fontSize={selected ? 0.065 : 0.05}
                            color={selected ? labelColors.selected : labelColors.idle}
                            outlineWidth={0.004}
                            outlineColor={labelColors.outline}
                            anchorX="center"
                            anchorY="bottom"
                        >
                            {node.label}
                        </Text>
                    </Billboard>
                );

            })}

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
