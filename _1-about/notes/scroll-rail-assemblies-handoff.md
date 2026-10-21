# Notes roller assemblies — October 18, 2026

Status: Notes-owned implementation complete for combined review, including close-zoom floating controls and six-source-backing clearance. No shared cube, settings, registry, projector, source GLB or other face source changed. No commit, push, publication or deployment.

## Changes and ownership

`scroll-tablet-model.js` and `mechanical-scrolls.js` replace four hand arms with two roller assemblies, one per tablet. Both top dowels travel upward. The existing Notes host retains its 1.5-second focus dwell, entry cosine .92 / retirement cosine .86, reversal without a new dwell while partly deployed, and full glass lift until the mechanism reaches zero. Glass exposure remains independent of tablet dwell.

Each assembly has a frame-mounted, three-stage normal slide at local [side × .85, −side × .18]. The .12-long sections retain .04 overlap at their maximum .08 relative travel. The outer section extends from z .08 to .2, entirely in front of the glass. A visible rigid frame shoulder bracket connects it to the annulus at z −.014. Its carriage travels from z .2 to .36. The packed guide and dowels park at y ±.48, z .2; no rear track is hidden inside another face backing. Two equal rigid carrier links connect that carriage to the fixed lower-dowel bearing. Link length is max(.9, (.85 + width/2 + .037) × .8), frozen for a given viewport-selected rod width. The kinematic solution supplies the actual rendered endpoints; no post-solve wrist rewrite or variable-length carrier cylinder remains.

The guide consists of two equal folding sections of length (screenHeight + .098)/2. The first is a twin-channel fork (z ±.023); the second nests between the channels. A seated hinge joins them. Both sections lie parallel to the horizontal dowels while folded, and straighten before carriage travel crosses their hinge. The top-dowel mounting link keeps length .058 through folding and unrolling. The carriage uses tangent roller pairs, with a .04 reserve before the upper rail stop. Bearings and round bobs share the dowel centers.

Sequence: raise glass; move the packed screen outboard in its exterior parking plane; turn the carrier links forward; advance the normal slide beyond the pane; settle the camera-facing tablet root; unfold and lock the guide; raise the top carriage. Stow follows exactly the same scalar path backwards. Arm speed, separate folding speed, reduced motion and the lifecycle contract remain intact.

## Preserved interfaces

`createMechanicalScrolls(mount, carrier)` still exposes root/layout/project/screenPoint/setTextures/hitScreen/update/reset/state/dispose. Diagnostics now provide `state.assemblies` (two entries); legacy `state.arms` is an empty array. Each assembly includes solved link, rail, bearing, carriage, roller and screen positions and `limited` when its finite reach is exhausted. Public state additionally exposes `physicalReady`, `floating`, `fallbackRequested` and diagnostic `fallbackReason`. `ready` means the controls are available, including the floating fallback; `progress` remains actual physical deployment. Consumers expecting four hands must use assemblies instead.

Both native screen rectangles remain 546 × 900 logical pixels, backed by 1092 × 1800 CanvasTextures. The UI painter and UV/native-editor bridge are unchanged. Projected corners and pointer mapping derive from the actual screen mesh. Gear art and Layers remain on the left tablet; drawing controls remain on the right. The projector still borrows the same texture/carrier/radius interface.

Manual camera zoom is never rewritten. The viewport layout retains its existing edge margins, rim hugging, Settings-space reservation and opt-in interior fitting. Rigid screen widths are selected on first layout / viewport resize and remain fixed through ordinary zoom. Dolly targets are bounded to local z .36…2.1 and carrier reach 2 × linkLength − .02. The camera-facing allocation plane is z .9. This is a visual mechanism with finite reach, not an unbounded physical positioning system.

## Verification and precise limits

- 60 focused repository checks pass across the drawing, panel runtime and scroll suites. Targeted ESLint passes.
- The isolated current-source browser fixture passes **59 checks at 1280 px and 59 at 390 px**. Checks include dwell, early retirement, reversal, full stow before glass lowering, screen pixel dimensions, camera-facing orientation, ordinary zoom, viewport corners, idle upload/repaint suppression, arm speed controls, drawing/group isolation, reduced motion, repeated detach/remount and borrowed projector source.
- Additional rendered-contact checks find actual instanced carrier-cylinder endpoints at the solved bearing centers and the rendered sheet at the same assembly position. A real screen-texture pointer click selected Rectangle, confirmed by its accessible checked state.
- Geometry sampling covers both sides, widths .4/.8/1.2/1.35, 601 opening poses and 41 samples per segment. Cylindrical/spherical envelopes include both carrier links, folding rails, upper mount link, bearings, dowels, carriage rollers, rail stops and nested normal slides. The tested front-facing target is center x ±1.7, y 0, z .36, height width × 900/546.
- Minimum sampled capsule-to-pane distance: **.07403 local units**. Minimum sampled distance to the chassis-opening profile: **.08368** using the conservative opening radius .895 and chassis z band −.026…+.034 from `output/notes-face/revision-13/chassis-profile.json`. This capsule/profile test is conservative and is not a fabrication or continuous self-contact proof.
- The mechanism retains seven instanced pools and six ordinary meshes (13 mechanism batches). The fixture scene uses 23 draws. Idle motion does not upload instance buffers. These are bounded fixture observations, not broad device performance claims.

Evidence is under `output/notes-rail-assemblies/`; the disposable fixture is `tmp/rail-scrolls/index.html`. Earlier revision-13/15 fixtures contain stale dimensions and four-hand assumptions; do not use them to validate this implementation.

### Close-zoom fallback — implemented

At extreme close zoom or an unreachable allocation, the physical tracks/guides stow while the same fixed-pixel screens appear as floating controls at the allocated viewport sides. The native/UV bridge uses the actual screen planes in both modes. Camera position and zoom remain untouched. When there is room again, the arms reverse or redeploy, floating controls remain available through the transition, and the screens return to their physical tablets only when unrolling is complete. No real rod or guide is uniformly shrunk. The user explicitly authorized fudging the screen placement and sending this handoff to About Cube.

Once fully stowed, the packed hardware is suppressed in floating-control view so it cannot obscure the drawing glass. Recovery restores it while deploying. This is the explicitly allowed visual fudge. The fallback reuses the two screen meshes/textures; it adds no render pass, texture copy, or event listener. Idle fallback layout and buffers remain cached. The old `close-zoom-limitation.png` records the pre-fix failure and is superseded by `close-zoom-fixed.png`.

## Every remaining phase / step

1. About Cube owns the final combined-host review against gimbals, projector and other added interior hardware, including self-contact and viewport-resize transitions. Notes source skins and close-zoom acceptance below are complete.
2. Retain the local handoff/evidence and send the authorized completion notice to About Cube after releasing the Notes reservation.

The six-backing check loads actual transformed vertices from `assets/panel-assembly/model.glb`, including both primitives of each backing (2304 triangles per skin). An 8040-pose sweep covers four widths, both sides, five tilt pairs and 201 deployment values. 166980 moving capsule envelopes stay at cube X ≤ −1.08. Every source backing triangle is on the other side of a separating plane; the tightest source skin is Notes at X ≥ −.9701275229. Therefore sampled moving-envelope clearance to all six source skins is at least **.1098724771**, or **.1038724771** allowing .006 speaker excursion. The fixed annulus bracket stays at cube X ≤ −.988, leaving **.0178724771** to the nearest source skin, **.0118724771** after the speaker allowance. This is a conservative source-mesh separation bound, not merely a nearest-vertex distance. See `backing-bounds.json` and `source-skin-clearance.json` (includes GLB/model hashes). No skin is cut, moved or hidden to achieve clearance. Intended bracket/frame contact is confined to the new shoulder post's seat on the Notes annulus; the normal slide is fixed to that post, and the glass carrier's lift guides retain their frame-seat contact.

Deferred feature work from earlier Notes discussion remains optional: pie-chart slicing/context controls and a fabrication-grade mechanism audit. This slice does not advance unrelated site architecture phases or Oddio/Skills work.

Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1

## New Notes follow-up

After this mechanical handoff, the user requested a context-based drawing panel: selected-object properties and shape-specific controls, including Pacman. Notes Face owns that next bounded slice in drawing-editor.js / notes.css; it does not change the mechanical contracts above.
