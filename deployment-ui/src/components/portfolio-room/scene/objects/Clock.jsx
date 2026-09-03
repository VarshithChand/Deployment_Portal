import { useEffect, useState } from "react";
import { Text } from "@react-three/drei";
import { MONO_FONT } from "../../fonts";
import { labelTextColors } from "../../textTheme";

// A wall clock showing the visitor's own real local time, ticking every
// second - "the location the application is running in" is read from
// the browser's own clock/timezone (toLocaleTimeString), not a
// geolocation lookup, so no permission prompt is ever needed for this.
// The small dot next to the time is a sun (day) or moon (night)
// indicator, mirroring the same day/night state the sun/moon theme
// toggle uses by default (see ThemeContext.jsx) - purely informational
// here, not a second control; the real toggle stays the one in the
// top-right corner of the room.
export default function Clock({ position = [0, 0, 0], theme }) {

    const [now, setNow] = useState(() => new Date());
    const labelColors = labelTextColors(theme);

    useEffect(() => {

        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);

    }, []);

    const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const day = now.getHours() >= 6 && now.getHours() < 18;

    return (

        <group position={position}>

            {/* clock face plate - roughly doubled from the first pass,
                which read as a small dim dial easy to miss on a big wall */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.34, 0.34, 0.04, 32]} />
                <meshStandardMaterial color="#0e131a" roughness={0.6} />
            </mesh>
            {/* RingGeometry already faces +z by default (unlike
                CylinderGeometry, which needs the 90-degree tip above to
                turn its circular face from +y to +z) - no rotation here */}
            <mesh position={[0, 0, 0.001]}>
                <ringGeometry args={[0.315, 0.34, 32]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>

            <group position={[0, 0, 0.024]}>

                <Text font={MONO_FONT} fontSize={0.15} color={labelColors.selected} anchorX="center" anchorY="middle" position={[0, 0.04, 0]}>
                    {timeString}
                </Text>

                <Text font={MONO_FONT} fontSize={0.058} color={labelColors.idle} anchorX="center" anchorY="middle" position={[0, -0.13, 0]}>
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
