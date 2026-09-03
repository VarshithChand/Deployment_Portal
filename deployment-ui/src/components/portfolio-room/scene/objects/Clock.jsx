import { useEffect, useState } from "react";
import { Text } from "@react-three/drei";
import { MONO_FONT } from "../../fonts";

// A wall clock showing the visitor's own real local time, ticking every
// second - "the location the application is running in" is read from
// the browser's own clock/timezone (toLocaleTimeString), not a
// geolocation lookup, so no permission prompt is ever needed for this.
// The small dot next to the time is a sun (day) or moon (night)
// indicator, mirroring the same day/night state the sun/moon theme
// toggle uses by default (see ThemeContext.jsx) - purely informational
// here, not a second control; the real toggle stays the one in the
// top-right corner of the room.
//
// The face plate is a fixed dark dial in both themes (like the monitor/
// dashboard "screens" elsewhere in the room - it doesn't turn white just
// because the room around it is bright), so its text uses fixed bright
// colors here too, not the theme-following labelTextColors helper used
// for open-air labels - that helper's LIGHT-theme colors are dark
// (meant for a pale wall), which against this always-dark plate was
// dark-on-dark and nearly unreadable.
export default function Clock({ position = [0, 0, 0] }) {

    const [now, setNow] = useState(() => new Date());

    useEffect(() => {

        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);

    }, []);

    const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const day = now.getHours() >= 6 && now.getHours() < 18;

    return (

        <group position={position}>

            {/* cyan backing disc, slightly larger than the face plate so
                its edge peeks out as a rim - a backing disc rather than a
                RingGeometry overlay, which by default faces +z but was
                also positioned only 0.001 units in front of the plate
                (well within z-fighting range at normal viewing distance,
                the same bug the window's stacked layers had) */}
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.01]}>
                <cylinderGeometry args={[0.36, 0.36, 0.02, 32]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>

            {/* face plate */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.34, 0.34, 0.04, 32]} />
                <meshStandardMaterial color="#0e131a" roughness={0.6} />
            </mesh>

            <group position={[0, 0, 0.03]}>

                <Text font={MONO_FONT} fontSize={0.15} color="#eafaff" anchorX="center" anchorY="middle" position={[0, 0.04, 0]}>
                    {timeString}
                </Text>

                <Text font={MONO_FONT} fontSize={0.058} color="#9fd8e0" anchorX="center" anchorY="middle" position={[0, -0.13, 0]}>
                    LOCAL TIME
                </Text>

                {/* sun (yellow) or moon (pale) indicator dot */}
                <mesh position={[0.2, 0.17, 0.001]}>
                    <circleGeometry args={[0.035, 16]} />
                    <meshBasicMaterial color={day ? "#fbbf24" : "#cbd5e1"} toneMapped={false} />
                </mesh>

            </group>

        </group>

    );

}
