// A simple low-poly bed - platform base, mattress, pillow, headboard.
// Purely decorative, tucked into the back-left corner (clear of the wall
// timeline's stops and the rack) so the room reads as an actual lived-in
// space rather than an empty demo showroom.
//
// A solid platform base (not 4 thin legs) - the legs were dark enough to
// all but disappear against the floor's own shadow, leaving nothing
// visibly connecting the frame to the ground and reading as "the bed is
// floating" even though it wasn't actually offset above y=0.
export default function Bed({ position = [0, 0, 0], rotation = [0, 0, 0] }) {

    return (

        <group position={position} rotation={rotation}>

            {/* platform base - touches the floor directly, no gap possible */}
            <mesh position={[0, 0.09, 0]}>
                <boxGeometry args={[1.24, 0.18, 1.94]} />
                <meshStandardMaterial color="#0e131a" roughness={0.7} />
            </mesh>

            {/* frame */}
            <mesh position={[0, 0.26, 0]}>
                <boxGeometry args={[1.3, 0.16, 2]} />
                <meshStandardMaterial color="#151a22" roughness={0.6} />
            </mesh>

            {/* headboard */}
            <mesh position={[0, 0.63, -1.03]}>
                <boxGeometry args={[1.3, 0.7, 0.06]} />
                <meshStandardMaterial color="#171d26" roughness={0.7} />
            </mesh>

            {/* mattress */}
            <mesh position={[0, 0.40, 0]}>
                <boxGeometry args={[1.2, 0.16, 1.9]} />
                <meshStandardMaterial color="#2a3442" roughness={0.85} />
            </mesh>

            {/* pillow */}
            <mesh position={[0, 0.52, -0.75]}>
                <boxGeometry args={[0.9, 0.1, 0.4]} />
                <meshStandardMaterial color="#3d4a5c" roughness={0.8} />
            </mesh>

            {/* blanket fold */}
            <mesh position={[0, 0.50, 0.35]}>
                <boxGeometry args={[1.18, 0.08, 1.1]} />
                <meshStandardMaterial color="#1c2b3a" roughness={0.8} />
            </mesh>

        </group>

    );

}
