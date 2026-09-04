import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { MONO_FONT } from "../../fonts";
import { useStore } from "../../state/store";
import { labelTextColors } from "../../textTheme";
import { SKILL_GROUPS, ALL_SKILLS } from "../../data/skills";

// Pendant light hanging over the desk -> SKILLS. Starts dim/off; arriving
// at the station flickers it on, brightens the room (a real PointLight
// ramps up with it, not just the fixture's own emissive), and spreads
// the skill nodes ("atoms") out around it by default, grouped and
// connected by thin cyan lines - not gated behind an extra click on the
// fixture itself. Also gated by the switchboard's "cluster" switch (off
// by default) - like a real fixture's master power, independent of
// `isOpen`: with the switch off, it stays fully dark no matter what.
//
// `selectedLabel`/`setSelectedLabel` read/write the shared store's
// `selectedSkill`, not local state - clicking a specific atom is also
// what opens the Skills 2D panel (see PortfolioRoom.jsx), the same
// "click a specific thing, not just arrive at the station" pattern
// Projects/Experience already use for their own panels. That's the only
// thing that stays gated behind a click here; the atoms themselves show
// as soon as you're at the station.
export default function CeilingLightSkills({ reducedMotion, theme }) {

    const active = useStore((s) => s.active);
    const setActive = useStore((s) => s.setActive);
    const selectedLabel = useStore((s) => s.selectedSkill);
    const setSelectedLabel = useStore((s) => s.setSelectedSkill);
    const clusterSwitchOn = useStore((s) => s.switches.cluster);
    const isOpen = active === "skills";
    const labelColors = labelTextColors(theme);

    const coreRef = useRef();
    const glowRef = useRef();
    const roomLightRef = useRef();
    const flickerT = useRef(0);
    const [hoveredGroup, setHoveredGroup] = useState(null);
    const groupRef = useRef();
    const labelRefs = useRef([]);

    // Golden-angle spiral within each skill group's own cluster - keeps a
    // group's nodes close together and non-overlapping without hand-tuned
    // per-item offsets.
    const nodes = useMemo(() => {

        const groupCount = SKILL_GROUPS.length;

        return ALL_SKILLS.map((skill) => {

            const groupIndex = SKILL_GROUPS.findIndex((g) => g.key === skill.group);
            const group = SKILL_GROUPS[groupIndex];
            const withinGroup = group.items.indexOf(skill.label);
            const groupSize = group.items.length;

            const baseAngle = (groupIndex / groupCount) * Math.PI * 2;
            const baseRadius = 1.5;
            const spiralAngle = withinGroup * 2.4;
            const spiralRadius = 0.12 + Math.sqrt(withinGroup) * 0.11;
            const spread = (withinGroup - (groupSize - 1) / 2) * 0.13;

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

    const activeGroup = hoveredGroup;

    useFrame((state, delta) => {

        const targetIntensity = !clusterSwitchOn ? 0 : isOpen ? 1 : 0.15;

        if (coreRef.current) {
            let intensity = targetIntensity;
            // brief flicker-on burst right after opening
            if (clusterSwitchOn && isOpen && flickerT.current < 0.5 && !reducedMotion) {
                flickerT.current += delta;
                intensity = Math.random() > 0.5 ? 1 : 0.2;
            } else if (!isOpen) {
                flickerT.current = 0;
            }
            coreRef.current.material.emissiveIntensity += (intensity - coreRef.current.material.emissiveIntensity) * 0.25;
        }

        if (glowRef.current) {
            const targetOpacity = !clusterSwitchOn ? 0.02 : isOpen ? 0.5 : 0.12;
            glowRef.current.material.opacity += (targetOpacity - glowRef.current.material.opacity) * 0.15;
        }

        if (roomLightRef.current) {
            const targetRoomLight = clusterSwitchOn && isOpen ? 1.6 : 0;
            roomLightRef.current.intensity += (targetRoomLight - roomLightRef.current.intensity) * 0.1;
        }

        if (groupRef.current && isOpen && !reducedMotion) {
            groupRef.current.rotation.y += delta * 0.08;
        }

        if (!groupRef.current) return;

        const rotY = groupRef.current.rotation.y;
        const cos = Math.cos(rotY);
        const sin = Math.sin(rotY);

        nodes.forEach((node, i) => {
            const label = labelRefs.current[i];
            if (!label) return;
            const [x, , z] = node.position;
            const worldZ = -x * sin + z * cos;
            label.visible = worldZ > 0.2;
        });

    });

    return (

        <group position={[0, 4.2, -1]}>

            {/* cord to the ceiling */}
            <mesh position={[0, 0.9, 0]}>
                <cylinderGeometry args={[0.008, 0.008, 1.8, 6]} />
                <meshStandardMaterial color="#1a2028" />
            </mesh>

            <pointLight ref={roomLightRef} color="#22d3ee" intensity={0} distance={9} />

            <Hotspot position={[0, 0, 0]} onSelect={() => setActive("skills")} reducedMotion={reducedMotion}>
                {(hovered) => (
                    <>
                        <mesh ref={coreRef}>
                            <icosahedronGeometry args={[0.22, 0]} />
                            <meshStandardMaterial
                                color="#a78bfa"
                                emissive={hovered ? "#c4b5fd" : "#a78bfa"}
                                emissiveIntensity={0.15}
                                toneMapped={false}
                            />
                        </mesh>
                        <mesh ref={glowRef}>
                            <icosahedronGeometry args={[0.34, 0]} />
                            <meshBasicMaterial color="#a78bfa" wireframe transparent opacity={0.12} toneMapped={false} />
                        </mesh>
                    </>
                )}
            </Hotspot>

            {isOpen && (

                <group ref={groupRef}>

                    {nodes.map((node) => {
                        const dimmed = activeGroup && node.group !== activeGroup;
                        const selected = selectedLabel === node.label;
                        return (
                            <mesh
                                key={node.label}
                                position={node.position}
                                onPointerOver={(e) => { e.stopPropagation(); setHoveredGroup(node.group); }}
                                onPointerOut={(e) => { e.stopPropagation(); setHoveredGroup(null); }}
                                onClick={(e) => { e.stopPropagation(); setSelectedLabel((prev) => (prev === node.label ? null : node.label)); }}
                            >
                                <sphereGeometry args={[selected ? 0.07 : 0.05, 12, 12]} />
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

                    {nodes.map((node, i) => {
                        if (activeGroup && node.group !== activeGroup) return null;
                        const selected = selectedLabel === node.label;
                        return (
                            <Billboard key={node.label} ref={(el) => { labelRefs.current[i] = el; }} position={[node.position[0], node.position[1] + 0.11, node.position[2]]}>
                                <Text
                                    font={MONO_FONT}
                                    fontSize={selected ? 0.06 : 0.045}
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

            )}

        </group>

    );

}
