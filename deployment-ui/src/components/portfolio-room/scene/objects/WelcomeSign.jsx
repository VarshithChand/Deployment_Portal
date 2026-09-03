import { Billboard, Text } from "@react-three/drei";
import { MONO_FONT } from "../../fonts";
import { useStore } from "../../state/store";
import { labelTextColors } from "../../textTheme";

// "WELCOME TO MY PORTFOLIO" - the first thing visible from the doorway.
// Floats in open air above the desk rather than mounted on the back wall
// (where it previously sat right at the top edge of the overview
// camera's frustum, right where the fixed Nav bar overlays the canvas -
// technically rendered, but easy to miss or half-hidden behind the Nav
// bar in the actual view). This position sits centered in the natural
// line of sight from the doorway, close enough to the camera to read at
// a real size instead of a thin sliver far off on the back wall. Only
// shown at the room overview (nothing selected yet); the moment you move
// to any station - by clicking an object, WASD/arrow keys, or mouse
// scroll (see PortfolioRoom.jsx's useSectionLoop) - `active` stops being
// null and this disappears, the same way it would stop making sense to
// greet you once you're already standing in front of something else.
export default function WelcomeSign({ theme }) {

    const active = useStore((s) => s.active);
    const labelColors = labelTextColors(theme);

    if (active) return null;

    return (

        <Billboard position={[0, 2.7, 1]}>
            <Text
                font={MONO_FONT}
                fontSize={0.22}
                color={labelColors.title}
                outlineWidth={0.011}
                outlineColor={labelColors.outline}
                anchorX="center"
                anchorY="bottom"
            >
                WELCOME TO MY PORTFOLIO
            </Text>
        </Billboard>

    );

}
