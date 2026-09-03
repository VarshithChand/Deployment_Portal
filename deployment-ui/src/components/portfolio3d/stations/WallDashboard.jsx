import { useEffect, useState } from "react";
import { Text } from "@react-three/drei";
import Hotspot from "../Hotspot";
import { MONO_FONT } from "../fonts";
import { DASHBOARD, PROJECTS, ALL_SKILLS } from "../../../data/portfolio3dData";

export function DashboardMarker({ onSelect, reducedMotion, dimmed }) {

    return (

        <Hotspot position={[0, 2.6, -5.7]} onSelect={onSelect} reducedMotion={reducedMotion}>
            {(hovered) => (
                <>
                    {/* meshBasicMaterial, not meshStandardMaterial - a lit
                        material was still being brightened by the room's
                        point lights regardless of how dark the base color
                        was set, which is why this kept rendering as a
                        bright solid slab instead of a dark screen. */}
                    <mesh>
                        <planeGeometry args={[2, 1.1]} />
                        <meshBasicMaterial
                            color={hovered ? "#0d3844" : "#04141a"}
                            side={2}
                            transparent
                            opacity={dimmed ? 0.2 : 1}
                            toneMapped={false}
                        />
                    </mesh>

                    {/* real status text on the wall screen, mirroring the
                        panel's own service table - dimmed the plane's own
                        brightness above (was a bright solid slab) so this
                        text has something dark to actually stand out on */}
                    {!dimmed && (
                        <group position={[0, 0, 0.02]}>
                            <Text font={MONO_FONT} fontSize={0.09} color="#5eead4" anchorX="center" anchorY="middle" position={[0, 0.4, 0]}>
                                STATUS
                            </Text>
                            {DASHBOARD.services.map((s, i) => (
                                <Text
                                    key={s.name}
                                    font={MONO_FONT}
                                    fontSize={0.06}
                                    color="#c9f4f9"
                                    anchorX="center"
                                    anchorY="middle"
                                    position={[0, 0.21 - i * 0.13, 0]}
                                >
                                    {`${s.name.padEnd(9)} ● ${s.status.toUpperCase()}`}
                                </Text>
                            ))}
                            <Text font={MONO_FONT} fontSize={0.052} color="#5eead4" anchorX="center" anchorY="middle" position={[0, -0.42, 0]}>
                                {`${DASHBOARD.illustrativeDeployments} DEPLOYS · ${PROJECTS.length} PROJECTS · ${ALL_SKILLS.length} TECH`}
                            </Text>
                        </group>
                    )}
                </>
            )}
        </Hotspot>

    );

}

// Counts up from 0 to `value` over ~900ms - skipped entirely (renders the
// final value immediately) under reduced motion.
function useCountUp(value, reducedMotion) {

    const [n, setN] = useState(reducedMotion ? value : 0);

    useEffect(() => {

        if (reducedMotion) { setN(value); return; }

        let raf;
        const start = performance.now();
        const duration = 900;

        function tick(now) {
            const t = Math.min((now - start) / duration, 1);
            setN(Math.round(value * (1 - Math.pow(1 - t, 3))));
            if (t < 1) raf = requestAnimationFrame(tick);
        }

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);

    }, [value, reducedMotion]);

    return n;

}

export function DashboardContent({ reducedMotion }) {

    const deployments = useCountUp(DASHBOARD.illustrativeDeployments, reducedMotion);
    const projects = useCountUp(PROJECTS.length, reducedMotion);
    const technologies = useCountUp(ALL_SKILLS.length, reducedMotion);

    return (

        <div className="p3d-dashboard mono">

            <table className="p3d-dashboard-table">
                <thead>
                    <tr><th>SERVICES</th><th>STATUS</th></tr>
                </thead>
                <tbody>
                    {DASHBOARD.services.map((s) => (
                        <tr key={s.name}>
                            <td>{s.name}</td>
                            <td><span className={`p3d-status-dot ${s.status}`} /> {s.status.toUpperCase()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="p3d-dashboard-metrics">
                <div><span className="p3d-metric-num">{deployments}</span><span>DEPLOYMENTS</span></div>
                <div><span className="p3d-metric-num">{String(projects).padStart(2, "0")}</span><span>PROJECTS</span></div>
                <div><span className="p3d-metric-num">{technologies}</span><span>TECHNOLOGIES</span></div>
            </div>

            <p className="p3d-dashboard-note">
                Illustrative portfolio counters, not a live production monitoring feed.
            </p>

        </div>

    );

}
