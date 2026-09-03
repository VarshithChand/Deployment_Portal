import { Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { MONO_FONT } from "../../fonts";
import { useStore } from "../../state/store";
import { PROFILE } from "../../data/profile";

// Monitor on the desk, screen facing the visitor -> ABOUT.
export default function MonitorAbout({ reducedMotion }) {

    const setActive = useStore((s) => s.setActive);

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
                            <Text font={MONO_FONT} fontSize={0.06} color="#5eead4" anchorX="center" anchorY="middle" position={[0, 0.16, 0]}>
                                $ whoami
                            </Text>
                            <Text font={MONO_FONT} fontSize={0.065} color="#eafaff" anchorX="center" anchorY="middle" position={[0, 0.03, 0]}>
                                {PROFILE.name}
                            </Text>
                            <Text font={MONO_FONT} fontSize={0.05} color="#9fd8e0" anchorX="center" anchorY="middle" position={[0, -0.09, 0]}>
                                {PROFILE.role}
                            </Text>
                            <Text font={MONO_FONT} fontSize={0.045} color="#5eead4" anchorX="center" anchorY="middle" maxWidth={0.8} textAlign="center" position={[0, -0.19, 0]}>
                                {hovered ? "> Explore my work" : "_"}
                            </Text>
                        </group>
                    </>
                )}
            </Hotspot>

        </group>

    );

}
