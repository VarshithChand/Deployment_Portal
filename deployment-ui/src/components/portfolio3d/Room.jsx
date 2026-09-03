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

            {/* floor - lightened from the original #0a0e14 so it reads
                against the #05070b void instead of nearly matching it */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[16, 16]} />
                <meshStandardMaterial color="#0e141d" roughness={0.85} metalness={0.1} />
            </mesh>

            {/* back wall (dashboard sits on this) */}
            <mesh position={[0, 3, -6]}>
                <planeGeometry args={[16, 8]} />
                <meshStandardMaterial color="#101722" roughness={0.9} />
            </mesh>

            {/* side walls - the room previously had a back wall but no
                sides, so it read as a floor floating in a void rather than
                an enclosed space */}
            <mesh position={[-8, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[16, 8]} />
                <meshStandardMaterial color="#0d131c" roughness={0.9} />
            </mesh>
            <mesh position={[8, 3, 0]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[16, 8]} />
                <meshStandardMaterial color="#0d131c" roughness={0.9} />
            </mesh>

            {/* thin emissive rim strips along the top of each wall - cheap
                way to make the walls legibly *there* instead of blending
                into the fog/background at a glance */}
            <mesh position={[0, 6.98, -5.99]}>
                <boxGeometry args={[16, 0.05, 0.05]} />
                <meshStandardMaterial color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.8} toneMapped={false} />
            </mesh>
            <mesh position={[-7.99, 6.98, 0]}>
                <boxGeometry args={[0.05, 0.05, 16]} />
                <meshStandardMaterial color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.5} toneMapped={false} />
            </mesh>
            <mesh position={[7.99, 6.98, 0]}>
                <boxGeometry args={[0.05, 0.05, 16]} />
                <meshStandardMaterial color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.5} toneMapped={false} />
            </mesh>

            {/* faint floor grid lines - reads as "server room floor" without a texture */}
            <gridHelper args={[16, 32, "#1a2c3d", "#101a26"]} position={[0, 0.01, 0]} />

            {/* desk (terminal sits on this) */}
            <mesh position={[0, 0.55, 0.6]}>
                <boxGeometry args={[1.4, 0.08, 0.7]} />
                <meshStandardMaterial color="#12181f" roughness={0.6} metalness={0.3} />
            </mesh>
            <mesh position={[0, 0.27, 0.6]}>
                <boxGeometry args={[0.15, 0.5, 0.15]} />
                <meshStandardMaterial color="#0a0e14" />
            </mesh>

            {/* floor accent strips tying each cluster of hotspots together
                visually, so the pipeline/timeline read as built structures
                rather than a scatter of identical unrelated boxes */}
            <mesh position={[3.05, 0.02, -1]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[4, 0.1]} />
                <meshStandardMaterial color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[-3.2, 0.02, -1.5]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[1.1, 0.1]} />
                <meshStandardMaterial color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
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
