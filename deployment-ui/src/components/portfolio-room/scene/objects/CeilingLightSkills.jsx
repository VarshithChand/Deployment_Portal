import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, DoubleSide } from "three";
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
    const beamRef = useRef();
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

        // idle-on (switch flipped on, but not standing at the Skills
        // station) was 0.15 - dim enough that "the switch is on" wasn't
        // actually visible from anywhere else in the room, which is the
        // whole point of a switch defaulting on at night. 0.4 reads as a
        // clearly-lit fixture at rest; isOpen's fuller 1 (plus the
        // flicker-in burst below) is still the brighter, focused state.
        const targetIntensity = !clusterSwitchOn ? 0 : isOpen ? 1 : 0.4;

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
            // idle-on eased back down from 0.28 to 0.16 - the glow shell
            // is a WIREFRAME icosahedron, and pushing its opacity up
            // that far made every edge cross Bloom's threshold and
            // bloom into a thick glowing bar instead of a delicate
            // wireframe halo - it read as a solid faceted blob ("the
            // cluster is getting thick"), not a light. The actual
            // illumination effect belongs to the real pointLight below,
            // not this decorative shell.
            const targetOpacity = !clusterSwitchOn ? 0.02 : isOpen ? 0.5 : 0.16;
            glowRef.current.material.opacity += (targetOpacity - glowRef.current.material.opacity) * 0.15;
        }

        if (beamRef.current) {
            // visible downward light shaft, on top of the actual
            // pointLight above - "I need light exposure like that" (a
            // sketch of rays fanning down from the pendant onto the
            // desk). Kept subtle (additive, low opacity) rather than a
            // solid cone - a light shaft should look like it's made of
            // the light itself, not an opaque object with a light-ish
            // color, which is exactly what over-brightened the wireframe
            // shell into a "thick" blob last round.
            const targetOpacity = !clusterSwitchOn ? 0 : isOpen ? 0.16 : 0.09;
            beamRef.current.material.opacity += (targetOpacity - beamRef.current.material.opacity) * 0.12;
        }

        if (roomLightRef.current) {
            // was 1.6 at a 9-unit falloff - almost the room's own
            // diagonal - bright enough combined with Bloom's fairly low
            // threshold (Experience.jsx, luminanceThreshold=0.2) to
            // overexpose the desk/monitor and everything else nearby
            // into blown highlights instead of just lighting the area.
            // Also now gives an idle-on baseline (0.5, not 0) once the
            // switch itself is on - same reasoning as the core/glow
            // above: a light that's "on" should visibly cast something
            // even before you've walked over to look straight at it.
            const targetRoomLight = !clusterSwitchOn ? 0 : isOpen ? 0.9 : 0.5;
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

            {/* distance pulled in from 9 to 5.5 - close to the room's own
                diagonal, so this "pendant over the desk" light was
                reaching well past the desk and into the rest of the
                room instead of staying a localized glow */}
            <pointLight ref={roomLightRef} color="#22d3ee" intensity={0} distance={5.5} />

            {/* visible light shaft - a hollow cone (openEnded, no solid
                caps) with its narrow tip at the fixture and its wide
                base down at desk height (this group's own origin is
                already at the fixture's world y=4.2, and the desk
                surface sits at world y~0.785, so local y=-3.415 is
                "desk height" from here). Cone's default orientation
                already puts the apex up/base down, matching a light
                narrowing at the source and spreading as it reaches a
                surface, so no rotation is needed - only the mesh's own
                y is offset so that apex and base land on those two
                points. Additive + no depthWrite, same convention as
                every other glow/beam-style material in this room, so it
                reads as light rather than a solid tinted object. */}
            <mesh ref={beamRef} position={[0, -1.7075, 0]}>
                <coneGeometry args={[1.05, 3.415, 20, 1, true]} />
                <meshBasicMaterial
                    color="#22d3ee"
                    transparent
                    opacity={0}
                    blending={AdditiveBlending}
                    side={DoubleSide}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>

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
