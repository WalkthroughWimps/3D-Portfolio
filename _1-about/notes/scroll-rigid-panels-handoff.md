# Art scroll joints and screen alignment — October 18, 2026

Supersedes the joint shape, width and screen orientation portions of the earlier scroll handoffs. This bounded follow-up responds to the user's 19:45 recording and two scroll-bearing images. No Oddio, shared cube, settings schema, source GLB or artwork data was changed.

## Current result

- Rectangular palms and forked brackets are replaced by compact spherical wrist sockets gripping the spindle end directly. All added scroll mechanism geometry is cylindrical, spherical or circular. End bobs are reduced from .035 to .024 radius; spindle radius is .013.
- Opposing rods retain a minimum .058 centre spacing when rolled together: the .048 bob diameter plus .010 clearance. Both remain parallel, rather than merging into one rod. Rolled display sleeve diameter also fits that spacing.
- Each rigid rod retains its entire length through opening, folding and camera zoom/rotation. Initial sizing happens before the first rendered resting pose. Responsive viewport resizing can choose a new rig size; ordinary deployment and camera motion cannot telescope the rods. Maximum sheet width is 1.35 local units so the complete stored rods fit the circular opening.
- Both tablets use the same 546 × 720 logical surface and 1092 × 1440 texture. Their screen orientation comes directly from the camera quaternion in the carrier's local frame, removing the previous yaw and inherited face tilt/roll. View-ray positioning maintains the allocated screen rectangle while preserving rod length. The sheets, actual spindle geometry, hit testing and native text-editor projection share the same transform.
- The larger right surface uses a four-column shape grid, a single palette row and paired settings/actions. Gear controls are also more compact. The full drawing and gear control sets fit their scrolls without vertical scrolling; an arbitrarily long Layers tree remains scrollable. Outer margins include room for the bobs. The fixture uses isolated artwork keys and memory settings; live saved artwork and preferences were retained.

## Verification

Evidence is under `output/art-scrolls/`, with the isolated browser fixture under `tmp/art-scrolls/`. Node checks include a complete bidirectional folding cycle with constant rod length, positive bob separation, equal screen aspect and sampled aperture/pane routing. Browser checks include actual instanced spindle lengths, camera-facing normals and up vectors, tilt/roll, zoom, folding/resting spacing, no box geometry, both complete control surfaces fitting, native pointer mapping, drawing/history, focus, lifecycle/disposal and idle buffer caching. The mechanism remains within its existing 13-batch budget. This is visual/runtime verification, not a full mesh/self-collision or fabrication proof.

## All remaining phases and steps

1. **Current visual acceptance:** user review of round joints, parallel resting rods, deployment, screen orientation, matched widths and compact layout on the user's display. Fix concrete findings.
2. **Drawing feature acceptance (phases 5–7):** drawing/gears/Smart rotate; shape depth/fill/clipping/anchors; nested isolation/history; copies/Repeat/aliases; alignment/snapping; resizing modifiers; pane/group/layer rename/order/history/shortcuts; rear/clipped artwork; manual zoom and optional interior fit.
3. **Optional expansion (phase 7):** pie sectors/radial boundaries/percentage editing after acceptance; further gear profiles only when requested, with geometry/contact checks.
4. **Technical acceptance (phase 8):** sustained heavy documents/history; low-end and long-session performance; pen/touch/modifier/cancel combinations; focus and native text editing; storage/recovery/multi-tab behavior; model/WebGL failures; palette/accessibility/reduced-motion combinations; extreme camera transitions and Layers drag gestures across browsers/devices.
5. **Physical/presentation (phase 9):** complete moving clearance/self-collision against other face attachments and interior equipment, including glass lowering and speed extremes; fixed fabrication dimensions/travel stops, mounting tolerances, interchangeable glass strength and fabrication. Higher-detail assets and live controls during unrolling remain optional.
6. **Previously deferred Oddio work:** choose four front/back control layouts and flipping plates; separately approve the proposed clip/reel capacity increase before implementation; real microphone/device/listening checks; optional reel refinement/waveform-following strokes, fuller cloth collisions and fabrication audits. This art-scroll change does not alter audio capacity or advance those phases.

Nothing committed, pushed, published or deployed. Preview: http://127.0.0.1:8878/_1-about/about.html?review=1&art=rigid-scrolls
