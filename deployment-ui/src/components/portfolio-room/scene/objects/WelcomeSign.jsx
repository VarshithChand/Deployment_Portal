import { Billboard, Text } from "@react-three/drei";
import { MONO_FONT } from "../../fonts";
import { useStore } from "../../state/store";
import { labelTextColors } from "../../textTheme";

// "WELCOME TO MY PORTFOLIO" on the back wall, above the dashboard screen -
// the first thing visible from the doorway. Only shown at the room
// overview (nothing selected yet); the moment you move to any station -
// by clicking an object, WASD/arrow keys, or mouse scroll (see
// PortfolioRoom.jsx's useSectionLoop) - `active` stops being null and
// this disappears, the same way it would stop making sense to greet you
// once you're already standing in front of something else.
export default function WelcomeSign({ theme }) {

    const active = useStore((s) => s.active);
    const labelColors = labelTextColors(theme);

    if (active) return null;

    return (

        <Billboard position={[0, 4.1, -4.85]}>
            <Text
                font={MONO_FONT}
                fontSize={0.16}
                color={labelColors.title}
                outlineWidth={0.008}
                outlineColor={labelColors.outline}
                anchorX="center"
                anchorY="bottom"
            >
                WELCOME TO MY PORTFOLIO
            </Text>
        </Billboard>

    );

}
