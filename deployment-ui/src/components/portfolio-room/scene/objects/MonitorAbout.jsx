import { Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { MONO_FONT } from "../../fonts";
import { useStore } from "../../state/store";
import { PROFILE } from "../../data/profile";

// Monitor on the desk, screen facing the visitor -> ABOUT. Plain, static
// screen content - the paginated "container" version of this (a "> Next"
// prompt cycling through ABOUT.whoami's blocks) was removed per explicit
// feedback after several rounds of it fighting the About panel that
// opens over the same part of the screen the moment it's reachable.
//
// Bezel/screen/text sized up ~1.25x from the original pass (kept modest
// here specifically - unlike the rest of the desk, this is the subject
// of the "about" camera's own ~1-unit close-up shot, CameraRig.jsx, so
// growing it too far would overflow the frame rather than just reading
// as a bigger, clearer screen). The Hotspot's own position is untouched,
// so that camera framing keeps working exactly as tuned.
export default function MonitorAbout({ reducedMotion }) {

    const setActive = useStore((s) => s.setActive);

    function goToProjects(e) {
        e.stopPropagation();
        setActive("projects");
    }

    return (

        <group position={[0, 0, 0]}>

            {/* stand - matches the bezel's own color, both a distinct
                warm-graphite tone from the CPU tower's cool blue and the
                phone's dark green, so the three desk devices read as
                separate objects rather than identical black boxes */}
            <mesh position={[0, 0.9, -1.2]}>
                <boxGeometry args={[0.06, 0.2, 0.06]} />
                <meshStandardMaterial color="#1e1a24" />
            </mesh>

            <Hotspot position={[0, 1.3, -1.2]} onSelect={() => setActive("about")} reducedMotion={reducedMotion} float={false}>
                {(hovered) => (
                    <>
                        {/* bezel */}
                        <mesh>
                            <boxGeometry args={[1.25, 0.775, 0.075]} />
                            <meshStandardMaterial color="#221f2c" roughness={0.7} />
                        </mesh>

                        {/* screen - meshBasicMaterial so it reads as an
                            emitting screen regardless of scene lighting,
                            not a lit slab that brightens/darkens with the
                            room's own lights */}
                        <mesh position={[0, 0, 0.038]}>
                            <planeGeometry args={[1.1, 0.625]} />
                            <meshBasicMaterial color={hovered ? "#0e5a63" : "#04141a"} toneMapped={false} />
                        </mesh>

                        <group position={[0, 0, 0.04]}>
                            <Text font={MONO_FONT} fontSize={0.075} color="#5eead4" anchorX="center" anchorY="middle" position={[0, 0.2, 0]}>
                                $ whoami
                            </Text>
                            <Text font={MONO_FONT} fontSize={0.081} color="#eafaff" anchorX="center" anchorY="middle" position={[0, 0.0375, 0]}>
                                {PROFILE.name}
                            </Text>
                            <Text font={MONO_FONT} fontSize={0.063} color="#9fd8e0" anchorX="center" anchorY="middle" position={[0, -0.1125, 0]}>
                                {PROFILE.role}
                            </Text>
                            {/* real, distinct action - clicking this line
                                specifically jumps straight to Projects
                                (what "my work" actually refers to), not
                                just a copy of what clicking anywhere else
                                on the monitor already did. stopPropagation
                                so it doesn't also trigger the parent
                                Hotspot's own onSelect (which would
                                otherwise re-fire right after, sending the
                                camera to "about" instead). */}
                            <Text
                                font={MONO_FONT}
                                fontSize={0.056}
                                color={hovered ? "#eafaff" : "#5eead4"}
                                anchorX="center"
                                anchorY="middle"
                                maxWidth={1}
                                textAlign="center"
                                position={[0, -0.2375, 0]}
                                onClick={goToProjects}
                                onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
                                onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = "auto"; }}
                            >
                                &gt; Explore my work
                            </Text>
                        </group>
                    </>
                )}
            </Hotspot>

        </group>

    );

}
