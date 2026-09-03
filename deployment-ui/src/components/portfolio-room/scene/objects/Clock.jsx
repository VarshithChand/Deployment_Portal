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

            {/* clock face plate */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.16, 0.16, 0.025, 24]} />
                <meshStandardMaterial color="#0e131a" roughness={0.6} />
            </mesh>

            <group position={[0, 0, 0.014]}>

                <Text font={MONO_FONT} fontSize={0.07} color={labelColors.selected} anchorX="center" anchorY="middle" position={[0, 0.02, 0]}>
                    {timeString}
                </Text>

                <Text font={MONO_FONT} fontSize={0.028} color={labelColors.idle} anchorX="center" anchorY="middle" position={[0, -0.06, 0]}>
                    LOCAL TIME
                </Text>

                {/* sun (yellow) or moon (pale) indicator dot */}
                <mesh position={[0.1, 0.08, 0.001]}>
                    <circleGeometry args={[0.018, 12]} />
                    <meshBasicMaterial color={day ? "#fbbf24" : "#cbd5e1"} toneMapped={false} />
                </mesh>

            </group>

        </group>

    );

}
