import { useState } from "react";
import { Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { MONO_FONT } from "../../fonts";
import { useStore } from "../../state/store";
import { ABOUT } from "../../data/profile";

// Monitor on the desk, screen facing the visitor -> ABOUT. The screen
// pages through ABOUT.whoami's blocks (identity, tagline, education) one
// "container" at a time via a real click target on the screen itself.
//
// Everything (content + the "> Next" prompt) is left-aligned and
// anchored toward the screen's own top-left, not centered - clicking the
// monitor is what opens the About panel over top of it, and that panel
// (centered, up to 560px wide) covers a column through roughly the
// middle of the screen at every reasonable desktop width. The top-left
// corner is the one region most likely to stay clear of it regardless of
// exact window size, so that's where the actually-interactive part
// lives. This can't be a hard guarantee for every viewport - it's a
// best-effort placement, not a real clip/overlap query against the 2D
// panel's DOM rect - but it's the most robust corner available.
export default function MonitorAbout({ reducedMotion }) {

    const setActive = useStore((s) => s.setActive);
    const [slideIndex, setSlideIndex] = useState(0);

    const slide = ABOUT.whoami[slideIndex];
    const displayLines = [
        ...(slide.prompt ? [{ text: slide.prompt, color: "#5eead4" }] : []),
        ...slide.lines.map((text) => ({ text, color: "#eafaff" }))
    ];

    return (

        <group position={[0, 0, 0]}>

            {/* stand - matches the bezel's own color, both a distinct
                warm-graphite tone from the CPU tower's cool blue and the
                phone's dark green, so the three desk devices read as
                separate objects rather than identical black boxes */}
            <mesh position={[0, 0.9, -1.2]}>
                <boxGeometry args={[0.05, 0.2, 0.05]} />
                <meshStandardMaterial color="#1e1a24" />
            </mesh>

            <Hotspot position={[0, 1.3, -1.2]} onSelect={() => setActive("about")} reducedMotion={reducedMotion}>
                {(hovered) => (
                    <>
                        {/* bezel */}
                        <mesh>
                            <boxGeometry args={[1, 0.62, 0.06]} />
                            <meshStandardMaterial color="#221f2c" roughness={0.7} />
                        </mesh>

                        {/* screen - meshBasicMaterial so it reads as an
                            emitting screen regardless of scene lighting,
                            not a lit slab that brightens/darkens with the
                            room's own lights */}
                        <mesh position={[0, 0, 0.031]}>
                            <planeGeometry args={[0.88, 0.5]} />
                            <meshBasicMaterial color={hovered ? "#0e5a63" : "#04141a"} toneMapped={false} />
                        </mesh>

                        <group position={[-0.41, 0, 0.033]}>

                            {displayLines.map((line, i) => (
                                <Text
                                    key={`${slideIndex}-${i}`}
                                    font={MONO_FONT}
                                    fontSize={i === 0 ? 0.052 : 0.044}
                                    color={line.color}
                                    anchorX="left"
                                    anchorY="middle"
                                    maxWidth={0.7}
                                    position={[0, 0.19 - i * 0.09, 0]}
                                >
                                    {line.text}
                                </Text>
                            ))}

                            {/* the real click target - stopPropagation
                                keeps it from also re-triggering the
                                Hotspot's own onSelect.
                                A fixed y, not one computed from
                                displayLines.length - the tagline slide is
                                one long string that wraps into ~4 visual
                                lines under maxWidth, but it's still just
                                1 entry in displayLines, so a length-based
                                offset only ever reserved room for 1 line
                                and Next rendered on top of the wrapped
                                text's 3rd/4th line instead of below it.
                                This fixed position sits below the worst
                                case (the tagline's own wrap) regardless
                                of which slide is showing. */}
                            <Text
                                font={MONO_FONT}
                                fontSize={0.045}
                                color="#5eead4"
                                anchorX="left"
                                anchorY="middle"
                                position={[0, -0.18, 0]}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSlideIndex((i) => (i + 1) % ABOUT.whoami.length);
                                }}
                                onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
                                onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = "auto"; }}
                            >
                                {`> Next (${slideIndex + 1}/${ABOUT.whoami.length})`}
                            </Text>

                        </group>
                    </>
                )}
            </Hotspot>

        </group>

    );

}
