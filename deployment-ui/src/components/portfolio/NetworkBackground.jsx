import { useEffect, useRef } from "react";
import {
    Scene, PerspectiveCamera, WebGLRenderer, BufferGeometry, BufferAttribute,
    Points, PointsMaterial, LineSegments, LineBasicMaterial, Color, Vector3, Group
} from "three";

// Purely decorative - a slowly-rotating node/connection graph behind the
// Portfolio hero, echoing "infrastructure/network topology" for a DevOps
// portfolio without replacing any real content with canvas pixels. Every
// actual word on the page (name, projects, skills) stays in the DOM,
// unaffected - this sits behind it at z-index 0 with pointer-events:none,
// aria-hidden, and never animates when prefers-reduced-motion is set.
//
// Raw three.js, deliberately NOT @react-three/fiber - the first version
// used R3F and shipped an 884KB/235KB-gzip chunk for this one decoration
// alone (R3F's reconciler references a broad swath of THREE's exports
// generically, so it tree-shakes poorly regardless of how little of the
// API any one scene actually uses). Importing only the specific THREE
// classes this scene needs, and driving the render loop with a plain
// requestAnimationFrame loop instead of a reconciler, cuts that
// dramatically - see this component's own chunk size in a build to
// confirm the current number.
const NODE_COUNT = 46;
const CONNECT_DISTANCE = 2.6;
const VOLUME = 6;

function prefersReducedMotion() {
    return typeof window !== "undefined"
        && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Reads the app's own --heading-accent theme token so this matches
// whichever theme/style variant is active when the component mounts -
// WebGL materials need a real color value, not a live CSS var() binding,
// so this is a one-time read rather than something that re-renders on a
// later theme toggle (an acceptable simplification for a background
// accent, not the actual content).
function readAccentColor() {

    if (typeof window === "undefined") return "#2563eb";

    const value = getComputedStyle(document.documentElement)
        .getPropertyValue("--heading-accent")
        .trim();

    return value || "#2563eb";

}

function buildGraph(color) {

    const nodes = [];

    for (let i = 0; i < NODE_COUNT; i++) {
        nodes.push(new Vector3(
            (Math.random() - 0.5) * VOLUME * 1.8,
            (Math.random() - 0.5) * VOLUME,
            (Math.random() - 0.5) * VOLUME
        ));
    }

    const nodePositions = new Float32Array(nodes.length * 3);
    nodes.forEach((n, i) => n.toArray(nodePositions, i * 3));

    const linePositions = [];

    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            if (nodes[i].distanceTo(nodes[j]) < CONNECT_DISTANCE) {
                linePositions.push(...nodes[i].toArray(), ...nodes[j].toArray());
            }
        }
    }

    const group = new Group();

    const pointsGeometry = new BufferGeometry();
    pointsGeometry.setAttribute("position", new BufferAttribute(nodePositions, 3));
    const pointsMaterial = new PointsMaterial({ color, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.85 });
    group.add(new Points(pointsGeometry, pointsMaterial));

    const lineGeometry = new BufferGeometry();
    lineGeometry.setAttribute("position", new BufferAttribute(new Float32Array(linePositions), 3));
    const lineMaterial = new LineBasicMaterial({ color, transparent: true, opacity: 0.18 });
    group.add(new LineSegments(lineGeometry, lineMaterial));

    return { group, pointsGeometry, pointsMaterial, lineGeometry, lineMaterial };

}

export default function NetworkBackground() {

    const containerRef = useRef(null);

    useEffect(() => {

        const container = containerRef.current;
        if (!container) return;

        // WebGL context creation can fail in locked-down/very old browsers -
        // this is decoration, not content, so a failure here just means no
        // background renders, never a broken Portfolio page.
        let renderer;

        try {
            renderer = new WebGLRenderer({ antialias: true, alpha: true });
        }
        catch (err) {
            console.error("NetworkBackground: WebGL unavailable (non-fatal, decorative only):", err);
            return;
        }

        const scene = new Scene();
        const camera = new PerspectiveCamera(50, 1, 0.1, 100);
        camera.position.z = 9;

        const color = new Color(readAccentColor());
        const { group, pointsGeometry, pointsMaterial, lineGeometry, lineMaterial } = buildGraph(color);
        scene.add(group);

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        container.appendChild(renderer.domElement);

        function resize() {
            const { clientWidth, clientHeight } = container;
            if (clientWidth === 0 || clientHeight === 0) return;
            camera.aspect = clientWidth / clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(clientWidth, clientHeight);
        }

        resize();

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);

        const animate = !prefersReducedMotion();
        let frameId;

        function tick() {
            if (animate) {
                group.rotation.y += 0.0016;
                group.rotation.x += 0.0005;
            }
            renderer.render(scene, camera);
            frameId = requestAnimationFrame(tick);
        }

        tick();

        return () => {

            cancelAnimationFrame(frameId);
            resizeObserver.disconnect();
            container.removeChild(renderer.domElement);

            pointsGeometry.dispose();
            pointsMaterial.dispose();
            lineGeometry.dispose();
            lineMaterial.dispose();
            renderer.dispose();

        };

    }, []);

    return <div ref={containerRef} className="pf-network-bg" aria-hidden="true" />;

}
