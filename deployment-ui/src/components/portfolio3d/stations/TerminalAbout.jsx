import { Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { ABOUT, PROFILE } from "../../../data/portfolio3dData";

// drei's <Text> needs an actual font file to rasterize glyphs from. Its
// own default font is fetched from an external CDN at runtime, which
// this app's CSP blocks (connect-src is locked to same-origin + the API
// only, see vite.config.js) - self-hosting under /public keeps it a
// same-origin request the CSP already allows.
const MONO_FONT = "/fonts/JetBrainsMono-Medium.ttf";

export function TerminalMarker({ onSelect, reducedMotion, dimmed }) {

    return (

        <Hotspot position={[0, 1.1, 0.6]} onSelect={onSelect} reducedMotion={reducedMotion}>
            {(hovered) => (
                <>
                    <mesh>
                        <boxGeometry args={[0.9, 0.55, 0.05]} />
                        <meshStandardMaterial
                            color={hovered ? "#0e5a63" : "#0d3b42"}
                            emissive="#22d3ee"
                            emissiveIntensity={hovered ? 0.5 : dimmed ? 0.1 : 0.35}
                            transparent
                            opacity={dimmed ? 0.2 : 1}
                            toneMapped={false}
                        />
                    </mesh>

                    {/* real terminal-style text on the screen's face,
                        mirroring the panel's own opening lines - a flat
                        colored slab with nothing on it just reads as a
                        blank rectangle, not a terminal */}
                    {!dimmed && (
                        <group position={[0, 0, 0.028]}>
                            <Text font={MONO_FONT} fontSize={0.07} color="#5eead4" anchorX="center" anchorY="middle" position={[0, 0.17, 0]}>
                                $ whoami
                            </Text>
                            <Text font={MONO_FONT} fontSize={0.075} color="#eafaff" anchorX="center" anchorY="middle" position={[0, 0.03, 0]}>
                                {PROFILE.name}
                            </Text>
                            <Text font={MONO_FONT} fontSize={0.06} color="#9fd8e0" anchorX="center" anchorY="middle" position={[0, -0.1, 0]}>
                                DevOps Engineer
                            </Text>
                            <Text font={MONO_FONT} fontSize={0.055} color="#5eead4" anchorX="center" anchorY="middle" position={[0, -0.21, 0]}>
                                {hovered ? "> Explore my work" : "_"}
                            </Text>
                        </group>
                    )}

                    <mesh position={[0, -0.35, 0]}>
                        <boxGeometry args={[0.15, 0.15, 0.15]} />
                        <meshStandardMaterial color="#111827" transparent opacity={dimmed ? 0.2 : 1} />
                    </mesh>
                </>
            )}
        </Hotspot>

    );

}

export function AboutContent() {

    return (

        <div className="p3d-terminal mono">
            {ABOUT.whoami.map((block, i) => (
                <div key={i} className="p3d-terminal-block">
                    {block.prompt && <div className="p3d-terminal-prompt">{block.prompt}</div>}
                    {block.lines.map((line) => <div key={line} className="p3d-terminal-line">{line}</div>)}
                </div>
            ))}
            <div className="p3d-terminal-block">
                <div className="p3d-terminal-prompt">&gt; Explore my work</div>
            </div>
            <p className="p3d-terminal-note">{PROFILE.role}</p>
        </div>

    );

}
