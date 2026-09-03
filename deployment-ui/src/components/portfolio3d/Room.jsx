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

    const { activeSection, setActiveSection, setOpenPanel } = useScene();

    // Clicking an actual object in the room (a hotspot's own click, not
    // Nav/scroll arriving at the station) is the one thing that opens
    // that station's content panel - see sceneStore.jsx's header comment.
    function select(section) {
        setActiveSection(section);
        setOpenPanel(section);
    }

    return (

        <group>

            {/* floor - lightened from the original #0a0e14 so it reads
                against the #05070b void instead of nearly matching it */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[16, 16]} />
                <meshStandardMaterial color="#0e141d" roughness={0.85} metalness={0.1} />
            </mesh>

            {/* back wall (dashboard sits on this). Walls carry their own
                small emissive base now - relying on point lights alone
                left them reading as pure black against the void whenever
                the light falloff didn't quite reach a given patch of
                surface, which is most of a wall this large. A constant
                low backlit tone guarantees the wall is always legibly
                *there*, independent of light placement. */}
            <mesh position={[0, 3, -6]}>
                <planeGeometry args={[16, 8]} />
                <meshStandardMaterial color="#101722" emissive="#0a1a24" emissiveIntensity={0.5} roughness={0.9} />
            </mesh>

            {/* vertical seam panels on the back wall - breaks up the flat
                plane into something that reads as a built server-room
                wall rather than a flat rectangle */}
            {[-6, -3.6, -1.2, 1.2, 3.6, 6].map((x) => (
                <mesh key={x} position={[x, 3, -5.97]}>
                    <boxGeometry args={[0.04, 8, 0.02]} />
                    <meshStandardMaterial color="#1c2b3a" emissive="#164e63" emissiveIntensity={0.4} toneMapped={false} />
                </mesh>
            ))}

            {/* side walls - the room previously had a back wall but no
                sides, so it read as a floor floating in a void rather than
                an enclosed space */}
            <mesh position={[-8, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[16, 8]} />
                <meshStandardMaterial color="#0d131c" emissive="#0a1a24" emissiveIntensity={0.4} roughness={0.9} />
            </mesh>
            <mesh position={[8, 3, 0]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[16, 8]} />
                <meshStandardMaterial color="#0d131c" emissive="#0a1a24" emissiveIntensity={0.4} roughness={0.9} />
            </mesh>

            {/* same vertical seam treatment as the back wall, on both side
                walls too - floor-to-roof panel lines, not just one wall */}
            {[-6, -3.6, -1.2, 1.2, 3.6, 6].map((z) => (
                <mesh key={`left-${z}`} position={[-7.97, 3, z]}>
                    <boxGeometry args={[0.02, 8, 0.04]} />
                    <meshStandardMaterial color="#1c2b3a" emissive="#164e63" emissiveIntensity={0.4} toneMapped={false} />
                </mesh>
            ))}
            {[-6, -3.6, -1.2, 1.2, 3.6, 6].map((z) => (
                <mesh key={`right-${z}`} position={[7.97, 3, z]}>
                    <boxGeometry args={[0.02, 8, 0.04]} />
                    <meshStandardMaterial color="#1c2b3a" emissive="#164e63" emissiveIntensity={0.4} toneMapped={false} />
                </mesh>
            ))}

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
            <mesh position={[2.95, 0.02, -1]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[3.5, 0.1]} />
                <meshStandardMaterial color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[-3.2, 0.02, -1.5]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[1.1, 0.1]} />
                <meshStandardMaterial color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>

            {/* All six markers render all the time (the room is one scene,
                not six), so once the camera flies close into one station,
                every OTHER station's marker is still sitting somewhere in
                that new view - a flat plate or plane a couple of units away
                reads as a huge, unexplained rectangle looming into frame
                from a close-up angle it was never designed to be seen from.
                Dim every marker that isn't the one currently open so a
                close-up view only has its own station in it. */}
            <TerminalMarker onSelect={() => select("about")} reducedMotion={reducedMotion} dimmed={activeSection && activeSection !== "about"} />
            <CloudMarker onSelect={() => select("skills")} reducedMotion={reducedMotion} dimmed={activeSection && activeSection !== "skills"} />
            <PipelineMarkers onSelect={() => select("projects")} reducedMotion={reducedMotion} dimmed={activeSection && activeSection !== "projects"} />
            <TimelineMarker onSelect={() => select("experience")} reducedMotion={reducedMotion} dimmed={activeSection && activeSection !== "experience"} />
            <DashboardMarker onSelect={() => select("dashboard")} reducedMotion={reducedMotion} dimmed={activeSection && activeSection !== "dashboard"} />
            <ContactMarker onSelect={() => select("contact")} reducedMotion={reducedMotion} dimmed={activeSection && activeSection !== "contact"} />

            {activeSection === "skills" && <SkillsGraph reducedMotion={reducedMotion} />}

        </group>

    );

}
