# Oddio cylinder and numeric-control pass — October 20, 2026

Current revision: constructor-1. Preview: http://127.0.0.1:8878/_1-about/about.html?review=1&face=odd&oddio=constructor-1.

## Scope

The latest user direction supersedes the earlier spiral clarification: retain both outer spiral windows and existing centered inner markings. Each cylinder now has left-rail ticks and an additional ring of vertical inner light stripes. Oddio offers no rotation / clockwise / counterclockwise (viewed from above), .2–5× speed, .1× primary arrow clicks and 1× secondary clicks. One turn takes four seconds at 1×. Reduced motion freezes the stripes. Hover or audible playback lights the ink; mute keeps it red. Contrast follows the shared site mapping.

Constructor mode → Oddio contains the existing side-panel placement/button customization controls plus separate main-meter and four-track-bank width/height scales, .6–1.1×. These scales use the same dynamic whole-body bounds in the diagram and 3D placement solver. The previous .815 radial reserve and .008 host margin remain intact; 1.15× was rejected during review because the largest main assembly could not fit with those margins. Clock sizing and support reach remain independent. Main support bars connect through the body to its rail; the corrected depth envelope includes the real cap extent.

SEW replaces the physical SOUND key and toggles the saved sewingAnimations preference. Turning it off cancels current/pending work and updates the queue baseline silently. Reenabling animates future changes only. Live recording/audio behavior remains independent. VOL toggles the existing output mute without overwriting the saved volume. Rail/slider and numeric value are separate actions. Numeric selection is drawn on the physical display, retaining the unit suffix; the anchored popup contains only the number pad, errors and Cancel/OK. A visually hidden native text input retains keyboard entry, selection and an accessible label. Text/name editing still uses a visible field.

## Constructor candidates — proposed only

No controls for these were added:

1. Support rods: cross-section, front inset and attachment height; derive length from add-on reach rather than expose a disconnected length.
2. Rollers and readers: diameter, height, lateral position and tape clearance; constrain readers to their playhead alignment.
3. Reels and folders: lateral spacing, depth, tilt, folder offset and guide angle as a coupled path, maintaining reel/support clearance.
4. Tape bank: width, lane gap, thickness and folding radius as coupled dimensions; preserve the time-to-distance scale unless explicitly changed.
5. Playhead and housings: reader clearance, panel bevel/corner radii and label padding, with collision guides visible while editing.

## Verification limits

Browser use is disabled in Work settings. Production Three.js geometry/raycast and native Canvas checks do not constitute a browser/GPU/keyboard interaction pass. The existing user audio tabs were not reloaded. See output/oddio-constructor/ and tmp/oddio-constructor/ for this pass. No commit, push, publish or deploy.

## Remaining phases / steps

1. Live browser review when available: Constructor tab layout, drag/keyboard placement, dimensions, rotation arrows including secondary click, physical numeric selection/typing/keypad/cancel, VOL state/restoration and SEW on/off while idle/working/recording. Check low brightness and live contrast changes.
2. Broader panel layout/whole-panel swapping and shared cube clearance; Cube Chat owns the mechanical arm changes.
3. Capacity decisions and real import, physical microphone and listening checks.
4. Optional Blender hardware assembly, reel/waveform refinement, continuous cloth/self-collision and fabrication/deployment audits.

Earlier handoffs are historical. Their pending spiral-direction question is resolved by preserving the present windows/markings in this pass.
