import { useScene } from "./sceneStore";
import { TerminalMarker } from "./stations/TerminalAbout";
import { CloudMarker, SkillsGraph } from "./stations/CloudSkills";
import { PipelineMarkers } from "./stations/PipelineProjects";
import { TimelineMarker } from "./stations/TimelineExperience";
import { DashboardMarker } from "./stations/WallDashboard";
import { ContactMarker } from "./stations/ContactConsole";

// The environment itself - low-poly primitives (floor, back/side walls,
// a desk), per the "primitives first, Blender models later" build order.
// No GLB assets loaded here at all yet.
export default function Room({ reducedMotion }) {

    const { activeSection, setActiveSection } = useScene();

    function select(section) {
        setActiveSection(section);
    }

    return (

        <group>

            {/* floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[16, 16]} />
                <meshStandardMaterial color="#0a0e14" roughness={0.85} metalness={0.1} />
            </mesh>

            {/* back wall (dashboard sits on this) */}
            <mesh position={[0, 3, -6]}>
                <planeGeometry args={[16, 8]} />
                <meshStandardMaterial color="#0b0f16" roughness={0.9} />
            </mesh>

            {/* faint floor grid lines - reads as "server room floor" without a texture */}
            <gridHelper args={[16, 32, "#123", "#0c1622"]} position={[0, 0.01, 0]} />

            {/* desk (terminal sits on this) */}
            <mesh position={[0, 0.55, 0.6]}>
                <boxGeometry args={[1.4, 0.08, 0.7]} />
                <meshStandardMaterial color="#12181f" roughness={0.6} metalness={0.3} />
            </mesh>
            <mesh position={[0, 0.27, 0.6]}>
                <boxGeometry args={[0.15, 0.5, 0.15]} />
                <meshStandardMaterial color="#0a0e14" />
            </mesh>

            <TerminalMarker onSelect={() => select("about")} reducedMotion={reducedMotion} />
            <CloudMarker onSelect={() => select("skills")} reducedMotion={reducedMotion} />
            <PipelineMarkers onSelect={() => select("projects")} reducedMotion={reducedMotion} />
            <TimelineMarker onSelect={() => select("experience")} reducedMotion={reducedMotion} />
            <DashboardMarker onSelect={() => select("dashboard")} reducedMotion={reducedMotion} />
            <ContactMarker onSelect={() => select("contact")} reducedMotion={reducedMotion} />

            {activeSection === "skills" && <SkillsGraph reducedMotion={reducedMotion} />}

        </group>

    );

}
