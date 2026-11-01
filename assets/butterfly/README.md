# Butterfly flight asset

Open `../.blend/butterfly-flight.blend` in Blender to edit the animation. The original `../.blend/butterfly.blend` remains unchanged.

- Timeline: frames 1–108 at 24 fps (4.5 seconds). Markers identify the flutter, liftoff, bank, acceleration, and exit.
- Select `Butterfly (Rigged)` and pose `Wings.Control` on its local X axis to adjust the wing flap. The imported left and right wing constraints remain in place. The armature action also contains slight body and antenna lag. Legs keep their relaxed source pose.
- Select `FLIGHT PATH - edit location and rotation` to change the translation, turn, and banking. Its action is separate from the flap action.
- The saved scene contains the camera, soft lights, background, and the source 2048px texture packed into the `.blend` file. The large `CBS-Circle` control widget is hidden from renders.
- Preview video: `../../output/butterfly-flight/butterfly-flight.mp4`.

`butterfly-flap.glb` is the small web export of the original `butterfly.blend`:
one skinned butterfly, the original packed albedo, and one seamless 4 Hz wing
cycle. Constraints are baked for all four wings. The legs retain their hanging
rest pose. It excludes the studio, lights, camera, widgets and flight path;
the Refs face supplies its own door-triggered turn and flight. The web copy uses
one subdivision level and opaque, double-sided materials with simple roughness.
The original Blender files remain unchanged.

The Refs runtime now loads this GLB once, stages it behind the selected door,
turns it toward the viewer after that door opens, plays three flap cycles,
then flies it beyond the borrowed camera view and hides it. The flight is
driven by the Refs face update loop; the original asset is unchanged.

Live Refs review passed the visible turn, flutter, upper-left escape and
despawn. Asset and lifecycle checks are recorded in the Refs face handoff.
Remaining required integration steps for this butterfly: none; later artistic
tuning can follow review of the cabinet decoration.
