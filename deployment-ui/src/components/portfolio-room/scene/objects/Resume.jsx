import { Billboard, Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { MONO_FONT } from "../../fonts";
import { useStore } from "../../state/store";
import { labelTextColors } from "../../textTheme";

// A paper sheet resting on the desk's open front-left corner (clear of
// the keyboard/mouse/phone footprints - see Experience.jsx for the exact
// spot). Clicking it opens the resume viewer panel (PortfolioRoom.jsx
// renders it from the store's resumeOpen flag) - deliberately NOT a
// "station" like About/Skills/etc: it doesn't move the camera, it just
// pops the viewer open where you already are, the way picking up an
// actual paper on a desk wouldn't relocate you first (see store.js's
// resumeOpen for the same reasoning). A slight rotation on the outer
// group gives it a casually-set-down look rather than a perfectly
// axis-aligned tile.
export default function Resume({ position = [0, 0, 0], reducedMotion, theme }) {

    const setResumeOpen = useStore((s) => s.setResumeOpen);
    const labelColors = labelTextColors(theme);

    return (

        <group position={position} rotation={[0, 0.16, 0]}>

            <Hotspot position={[0, 0, 0]} onSelect={() => setResumeOpen(true)} reducedMotion={reducedMotion} float={false}>
                {(hovered) => (
                    <>
                        {/* the sheet itself */}
                        <mesh>
                            <boxGeometry args={[0.32, 0.012, 0.42]} />
                            <meshStandardMaterial
                                color={hovered ? "#ffffff" : "#f1efe9"}
                                emissive={hovered ? "#22d3ee" : "#000000"}
                                emissiveIntensity={hovered ? 0.12 : 0}
                                roughness={0.85}
                            />
                        </mesh>

                        {/* header accent bar, near the top edge - reads as
                            a resume's own name/title header rather than a
                            blank page */}
                        <mesh position={[0, 0.0066, -0.15]}>
                            <boxGeometry args={[0.24, 0.001, 0.04]} />
                            <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.5} toneMapped={false} />
                        </mesh>

                        {/* a few thin gray strips standing in for body text
                            lines, varied width so it doesn't read as a
                            uniform ladder */}
                        {[
                            [-0.09, 0.24], [-0.04, 0.2], [0.01, 0.24],
                            [0.06, 0.16], [0.11, 0.22]
                        ].map(([z, w], i) => (
                            <mesh key={i} position={[-(0.24 - w) / 2, 0.0066, z]}>
                                <boxGeometry args={[w, 0.001, 0.014]} />
                                <meshStandardMaterial color="#9aa3b0" />
                            </mesh>
                        ))}

                        {/* fontSize doubled (0.062 -> 0.13) - same lesson
                            as the window's birds/stars: this paper is a
                            small object seen from the room's normal
                            standing/overview distance, not a close-up
                            camera target, and the original size read as
                            illegible there rather than just modest */}
                        <Billboard position={[0, 0.24, 0]}>
                            <Text
                                font={MONO_FONT}
                                fontSize={0.13}
                                color={labelColors.title}
                                outlineWidth={0.008}
                                outlineColor={labelColors.outline}
                                anchorX="center"
                                anchorY="bottom"
                            >
                                RESUME
                            </Text>
                        </Billboard>
                    </>
                )}
            </Hotspot>

        </group>

    );

}
