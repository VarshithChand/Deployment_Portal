import Hotspot from "../Hotspot";
import { ABOUT, PROFILE } from "../../../data/portfolio3dData";

export function TerminalMarker({ onSelect, reducedMotion, dimmed }) {

    return (

        <Hotspot position={[0, 1.1, 0.6]} onSelect={onSelect} reducedMotion={reducedMotion}>
            {(hovered) => (
                <>
                    <mesh>
                        <boxGeometry args={[0.9, 0.55, 0.05]} />
                        <meshStandardMaterial
                            color={hovered ? "#67e8f9" : "#0d3b42"}
                            emissive="#22d3ee"
                            emissiveIntensity={hovered ? 1.1 : dimmed ? 0.15 : 0.75}
                            transparent
                            opacity={dimmed ? 0.2 : 1}
                            toneMapped={false}
                        />
                    </mesh>
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
