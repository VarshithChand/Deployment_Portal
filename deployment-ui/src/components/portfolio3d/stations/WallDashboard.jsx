import { useEffect, useState } from "react";
import Hotspot from "../Hotspot";
import { DASHBOARD, PROJECTS, ALL_SKILLS } from "../../../data/portfolio3dData";

export function DashboardMarker({ onSelect, reducedMotion }) {

    return (

        <Hotspot position={[0, 2.6, -5.7]} onSelect={onSelect} reducedMotion={reducedMotion}>
            {(hovered) => (
                <mesh>
                    <planeGeometry args={[2, 1.1]} />
                    <meshStandardMaterial
                        color={hovered ? "#164e63" : "#0b2530"}
                        emissive="#22d3ee"
                        emissiveIntensity={hovered ? 0.9 : 0.6}
                        side={2}
                        toneMapped={false}
                    />
                </mesh>
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
