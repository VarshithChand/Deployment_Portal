import { useScene } from "./sceneStore";
import Operator from "./Operator";
import OperatorErrorBoundary from "./OperatorErrorBoundary";
import { TerminalMarker } from "./stations/TerminalAbout";
import { CloudMarker, SkillsGraph } from "./stations/CloudSkills";
import { PipelineMarkers } from "./stations/PipelineProjects";
import { TimelineMarker } from "./stations/TimelineExperience";
import { DashboardMarker } from "./stations/WallDashboard";
import { ContactMarker } from "./stations/ContactConsole";

// A handful of static decorative rack props for the otherwise-empty
// floor areas (server-rack silhouettes - two stacked boxes each, no
// interaction, just filling dead space between stations).
const RACKS = [
    [5.6, 0, -3.2],
    [5.8, 0, 2.4],
    [-5.9, 0, -4.6]
];

function RackProp({ position, cyan, rackColor }) {

    return (

        <group position={position}>
            <mesh position={[0, 0.28, 0]}>
                <boxGeometry args={[0.4, 0.56, 0.32]} />
                <meshStandardMaterial color={rackColor} emissive={cyan} emissiveIntensity={0.15} roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.06, 0.17]}>
                <boxGeometry args={[0.34, 0.02, 0.01]} />
                <meshStandardMaterial color={cyan} emissive={cyan} emissiveIntensity={0.5} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.18, 0.17]}>
                <boxGeometry args={[0.34, 0.02, 0.01]} />
                <meshStandardMaterial color={cyan} emissive={cyan} emissiveIntensity={0.5} toneMapped={false} />
            </mesh>
        </group>

    );

}

// Dark is the room's original/default palette; light swaps the base
// environment tone (floor/walls/grid/desk) while keeping the cyan
// "glow" accent as the one constant identity between themes - just a
// deeper, more saturated cyan in light mode (#22d3ee reads as pale/
// washed-out against a white wall) rather than a different hue.
// Deliberately NOT touched by theme: the station "screens" (Terminal/
// Dashboard/Contact) stay dark-screened in both, the way a real
// monitor's screen doesn't turn white just because the room around it
// is bright - see those files' own materials.
const PALETTE = {
    dark: {
        cyan: "#22d3ee",
        floor: "#0e141d", backWall: "#101722", sideWall: "#0d131c",
        wallEmissive: "#0a1a24", wallEmissiveIntensity: 0.5, sideWallEmissiveIntensity: 0.4,
        seam: "#1c2b3a", seamEmissive: "#164e63",
        gridMajor: "#1a2c3d", gridMinor: "#101a26",
        deskTop: "#12181f", deskLeg: "#0a0e14",
        rack: "#0e161f"
    },
    // First pass had almost no separation between floor/walls/grid (all
    // within a few % of the same pale value) plus overly bright ambient
    // light (see Experience.jsx) - together they read as one flat hazy
    // wash instead of a room with actual depth. Floor is now visibly
    // darker than the walls (a real floor/wall distinction, matching how
    // the dark palette already works), and the grid lines are a real
    // mid-grey instead of nearly matching the floor they sit on.
    light: {
        cyan: "#0891b2",
        floor: "#c7d1de", backWall: "#f4f6f9", sideWall: "#eef1f5",
        wallEmissive: "#000000", wallEmissiveIntensity: 0, sideWallEmissiveIntensity: 0,
        seam: "#aab6c8", seamEmissive: "#aab6c8",
        gridMajor: "#7c8ba3", gridMinor: "#a7b3c4",
        deskTop: "#b7c2d0", deskLeg: "#7c8ba3",
        rack: "#d7dfe9"
    }
};

// The environment itself - low-poly primitives (floor, back/side walls,
// a desk), per the "primitives first, Blender models later" build order.
// No GLB assets loaded here at all yet.
export default function Room({ reducedMotion, theme }) {

    const { activeSection, setActiveSection, setOpenPanel } = useScene();
    const p = PALETTE[theme === "light" ? "light" : "dark"];

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
                against the void instead of nearly matching it */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[16, 16]} />
                <meshStandardMaterial color={p.floor} roughness={0.85} metalness={0.1} />
            </mesh>

            {/* back wall (dashboard sits on this). In dark mode walls carry
                their own small emissive base - relying on point lights
                alone left them reading as pure black against the void
                whenever the light falloff didn't quite reach a given patch
                of surface, which is most of a wall this large. Light mode
                needs none of that (the wall's own base color is already
                bright), see PALETTE.light's wallEmissiveIntensity of 0. */}
            <mesh position={[0, 3, -6]}>
                <planeGeometry args={[16, 8]} />
                <meshStandardMaterial color={p.backWall} emissive={p.wallEmissive} emissiveIntensity={p.wallEmissiveIntensity} roughness={0.9} />
            </mesh>

            {/* vertical seam panels on the back wall - breaks up the flat
                plane into something that reads as a built server-room
                wall rather than a flat rectangle */}
            {[-6, -3.6, -1.2, 1.2, 3.6, 6].map((x) => (
                <mesh key={x} position={[x, 3, -5.97]}>
                    <boxGeometry args={[0.04, 8, 0.02]} />
                    <meshStandardMaterial color={p.seam} emissive={p.seamEmissive} emissiveIntensity={0.4} toneMapped={false} />
                </mesh>
            ))}

            {/* side walls - the room previously had a back wall but no
                sides, so it read as a floor floating in a void rather than
                an enclosed space */}
            <mesh position={[-8, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[16, 8]} />
                <meshStandardMaterial color={p.sideWall} emissive={p.wallEmissive} emissiveIntensity={p.sideWallEmissiveIntensity} roughness={0.9} />
            </mesh>
            <mesh position={[8, 3, 0]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[16, 8]} />
                <meshStandardMaterial color={p.sideWall} emissive={p.wallEmissive} emissiveIntensity={p.sideWallEmissiveIntensity} roughness={0.9} />
            </mesh>

            {/* same vertical seam treatment as the back wall, on both side
                walls too - floor-to-roof panel lines, not just one wall */}
            {[-6, -3.6, -1.2, 1.2, 3.6, 6].map((z) => (
                <mesh key={`left-${z}`} position={[-7.97, 3, z]}>
                    <boxGeometry args={[0.02, 8, 0.04]} />
                    <meshStandardMaterial color={p.seam} emissive={p.seamEmissive} emissiveIntensity={0.4} toneMapped={false} />
                </mesh>
            ))}
            {[-6, -3.6, -1.2, 1.2, 3.6, 6].map((z) => (
                <mesh key={`right-${z}`} position={[7.97, 3, z]}>
                    <boxGeometry args={[0.02, 8, 0.04]} />
                    <meshStandardMaterial color={p.seam} emissive={p.seamEmissive} emissiveIntensity={0.4} toneMapped={false} />
                </mesh>
            ))}

            {/* thin emissive rim strips along the top of each wall - cheap
                way to make the walls legibly *there* instead of blending
                into the fog/background at a glance */}
            <mesh position={[0, 6.98, -5.99]}>
                <boxGeometry args={[16, 0.05, 0.05]} />
                <meshStandardMaterial color={p.cyan} emissive={p.cyan} emissiveIntensity={0.8} toneMapped={false} />
            </mesh>
            <mesh position={[-7.99, 6.98, 0]}>
                <boxGeometry args={[0.05, 0.05, 16]} />
                <meshStandardMaterial color={p.cyan} emissive={p.cyan} emissiveIntensity={0.5} toneMapped={false} />
            </mesh>
            <mesh position={[7.99, 6.98, 0]}>
                <boxGeometry args={[0.05, 0.05, 16]} />
                <meshStandardMaterial color={p.cyan} emissive={p.cyan} emissiveIntensity={0.5} toneMapped={false} />
            </mesh>

            {/* faint floor grid lines - reads as "server room floor" without a texture */}
            <gridHelper args={[16, 32, p.gridMajor, p.gridMinor]} position={[0, 0.01, 0]} />

            {/* desk (terminal sits on this) */}
            <mesh position={[0, 0.55, 0.6]}>
                <boxGeometry args={[1.4, 0.08, 0.7]} />
                <meshStandardMaterial color={p.deskTop} roughness={0.6} metalness={0.3} />
            </mesh>
            <mesh position={[0, 0.27, 0.6]}>
                <boxGeometry args={[0.15, 0.5, 0.15]} />
                <meshStandardMaterial color={p.deskLeg} />
            </mesh>

            {/* floor accent strips tying each cluster of hotspots together
                visually, so the pipeline/timeline read as built structures
                rather than a scatter of identical unrelated boxes */}
            <mesh position={[2.02, 0.02, -1]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[1.7, 0.1]} />
                <meshStandardMaterial color={p.cyan} emissive={p.cyan} emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[-3.2, 0.02, -1.5]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[1.1, 0.1]} />
                <meshStandardMaterial color={p.cyan} emissive={p.cyan} emissiveIntensity={0.6} toneMapped={false} />
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
            <CloudMarker onSelect={() => select("skills")} reducedMotion={reducedMotion} dimmed={activeSection && activeSection !== "skills"} theme={theme} />
            <PipelineMarkers onSelect={() => select("projects")} reducedMotion={reducedMotion} dimmed={activeSection && activeSection !== "projects"} theme={theme} />
            <TimelineMarker onSelect={() => select("experience")} reducedMotion={reducedMotion} dimmed={activeSection && activeSection !== "experience"} theme={theme} />
            <DashboardMarker onSelect={() => select("dashboard")} reducedMotion={reducedMotion} dimmed={activeSection && activeSection !== "dashboard"} />
            <ContactMarker onSelect={() => select("contact")} reducedMotion={reducedMotion} dimmed={activeSection && activeSection !== "contact"} theme={theme} />

            {activeSection === "skills" && <SkillsGraph reducedMotion={reducedMotion} theme={theme} />}

            {RACKS.map((pos) => <RackProp key={pos.join(",")} position={pos} cyan={p.cyan} rackColor={p.rack} />)}

            {/* Operator is built entirely from primitives now (no external
                model/texture asset, unlike the earlier GLTF version), so
                there's no async load to isolate with Suspense anymore -
                kept the error boundary anyway as cheap insurance against
                any future runtime error here taking the whole room down
                with it. */}
            <OperatorErrorBoundary>
                <Operator reducedMotion={reducedMotion} />
            </OperatorErrorBoundary>

        </group>

    );

}
