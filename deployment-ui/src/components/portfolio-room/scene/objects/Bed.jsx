// A simple low-poly bed - platform base, mattress, pillow, headboard.
// Purely decorative, tucked into the back-left corner (clear of the wall
// timeline's stops and the rack) so the room reads as an actual lived-in
// space rather than an empty demo showroom.
//
// A solid platform base (not 4 thin legs) - the legs were dark enough to
// all but disappear against the floor's own shadow, leaving nothing
// visibly connecting the frame to the ground and reading as "the bed is
// floating" even though it wasn't actually offset above y=0.
//
// Width sized up ~1.4x and height ~1.15x from the original pass (it read
// as a low ottoman rather than a bed in an overview shot) - every
// y-position/height scales by the same 1.15x factor together, keeping
// the stacking relationship (base -> frame -> mattress -> pillow/
// blanket) intact. Depth is deliberately left UNCHANGED: this bed sits
// wedged between the back wall (z=-5) and the wall timeline's nearest
// stop (z=-2.9), only ~2.1 units apart - the original depth already
// fits that gap with the placement this component was first verified
// against, growing it further would push the headboard through the
// wall and the foot into the timeline's own stops.
export default function Bed({ position = [0, 0, 0], rotation = [0, 0, 0] }) {

    return (

        <group position={position} rotation={rotation}>

            {/* platform base - touches the floor directly, no gap possible */}
            <mesh position={[0, 0.1035, 0]}>
                <boxGeometry args={[1.736, 0.207, 1.94]} />
                <meshStandardMaterial color="#0e131a" roughness={0.7} />
            </mesh>

            {/* frame */}
            <mesh position={[0, 0.299, 0]}>
                <boxGeometry args={[1.82, 0.184, 2]} />
                <meshStandardMaterial color="#151a22" roughness={0.6} />
            </mesh>

            {/* headboard */}
            <mesh position={[0, 0.7245, -1.03]}>
                <boxGeometry args={[1.82, 0.805, 0.06]} />
                <meshStandardMaterial color="#171d26" roughness={0.7} />
            </mesh>

            {/* mattress */}
            <mesh position={[0, 0.46, 0]}>
                <boxGeometry args={[1.68, 0.184, 1.9]} />
                <meshStandardMaterial color="#2a3442" roughness={0.85} />
            </mesh>

            {/* pillow */}
            <mesh position={[0, 0.598, -0.75]}>
                <boxGeometry args={[1.26, 0.115, 0.4]} />
                <meshStandardMaterial color="#3d4a5c" roughness={0.8} />
            </mesh>

            {/* blanket fold */}
            <mesh position={[0, 0.575, 0.35]}>
                <boxGeometry args={[1.652, 0.092, 1.1]} />
                <meshStandardMaterial color="#1c2b3a" roughness={0.8} />
            </mesh>

        </group>

    );

}
