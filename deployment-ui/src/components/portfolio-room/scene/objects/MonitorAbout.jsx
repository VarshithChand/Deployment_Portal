import { Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { MONO_FONT } from "../../fonts";
import { useStore } from "../../state/store";
import { ABOUT } from "../../data/profile";

// Monitor on the desk, screen facing the visitor -> ABOUT. The screen
// pages through ABOUT.whoami's blocks (identity, tagline, education) one
// "container" at a time - real content shown inside the monitor, not all
// stacked at once. The page indicator here is NOT clickable, unlike an
// earlier version of this - clicking the monitor is what opens the About
// panel over top of it in the first place, so a click target living on
// the monitor's own face is covered the instant you're close enough to
// reach it. The panel's own "Next" button (About.jsx) is what actually
// advances `aboutSlide`; this just displays whichever slide that state
// currently points to.
export default function MonitorAbout({ reducedMotion }) {

    const setActive = useStore((s) => s.setActive);
    const slideIndex = useStore((s) => s.aboutSlide);

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

                        <group position={[0, 0, 0.033]}>

                            {displayLines.map((line, i) => (
                                <Text
                                    key={`${slideIndex}-${i}`}
                                    font={MONO_FONT}
                                    fontSize={i === 0 ? 0.06 : 0.05}
                                    color={line.color}
                                    anchorX="center"
                                    anchorY="middle"
                                    maxWidth={0.78}
                                    textAlign="center"
                                    position={[0, 0.15 - i * 0.12, 0]}
                                >
                                    {line.text}
                                </Text>
                            ))}

                            <Text font={MONO_FONT} fontSize={0.04} color="#5eead4" anchorX="center" anchorY="middle" position={[0, -0.21, 0]}>
                                {`${slideIndex + 1} / ${ABOUT.whoami.length}`}
                            </Text>

                        </group>
                    </>
                )}
            </Hotspot>

        </group>

    );

}
