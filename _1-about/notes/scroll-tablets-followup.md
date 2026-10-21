# Notes scroll/tablet follow-up - October 18, 2026

Supersedes the deployment, layout and Layers placement portions of `scroll-tablets-handoff.md`.

## Changes

- Glass/frame lift now follows the face/camera angle, independently of the 2.2-second tablet dwell. A smooth facing interval from .45 to .94 drives the .18-unit extension. Rotating away reverses that extension immediately; the arms fold at their configured rate.
- Default opening is 2.8 seconds and closing is 2 seconds. Notes settings provides .25-3x unfolding speed, optionally separate folding speed, and linked speeds by default. New shared settings schema entries persist, validate and transfer these preferences through the normal settings service. Reduced motion still snaps mechanism poses while retaining the focus dwell.
- Tablets now follow the circular frame at a 32px projected gap and clamp only at the available screen margins (22px). Zooming back out returns them beside the circle. General Settings reserves its normal available space; camera zoom remains unforced except the existing explicit interior-fit option. Rim projection and instance/DOM updates are cached while stationary.
- Layers now shares the left Gear art scroll. On wide layouts the sections sit side by side with a divider; with less room they stack inside the same scroll and remain reachable by scrolling. The right drawing tablet is wider (380px on desktop), with a fourth row of Arc, Torus and Pacman tools (U/I/J).
- Both ends of each scroll use matching round bearings. Forked hinge links connect the inner bearings to the mechanical hands; palms sit behind them so the round joints remain visible. The shafts batch capacity now includes those new links. The same maximum 13 mechanism draw batches is retained.
- Arc Depth changes the band thickness, Torus Depth changes ring thickness and Pacman Depth changes its missing wedge. Depth is displayed 0-100 and safely bounded geometrically. Torus uses separate oppositely wound contours, so fill and hit testing leave its center hollow. Contours survive editable anchors, resizing and restoration; outline clipping skips contour breaks.
- Double-clicking a group enters isolation; double-clicking a nested group enters the second level. Double-clicking empty glass or an ordinary member returns to the parent level. Escape also leaves one level. Outside artwork and Layers rows dim. Hit testing, marquee, Select all and new artwork respect the isolated scope; copies remain inside that scope. Isolation is temporary and does not change the saved document schema.
- Native controls use a flat isolated compositing layer with visible backfaces to reduce transformed-text artifacts. Fresh integrated captures are legible; target-device GPU/browser acceptance remains open.

## Pie-chart recommendation

Pie chart is the usual name. Defer slice generation until the new geometry and group editing are accepted. A later contextual Split into slices command should create an ordinary group of independently colored sector objects with a shared center and total of 100%. Add boundary handles or a radial divider tool, percentage inputs, and Fill remaining slice. Preserve the total and shared center as slices change, and make conversion a single Undo action. Avoid adding chart-only controls to the general drawing panel before that behavior is settled. Pacman currently exposes Depth only for its wedge; no chart data model or automatic slices were added.

## Verification

- 65 focused drawing, mechanism, panel/runtime, storage and core tests pass; targeted ESLint and generated HTML/worker freshness pass.
- 38 isolated runtime/browser checks pass at 390, 720, 1280 and 1920px. These include immediate glass lift, delayed/blank deployment, opposite pullers, left merged Layers, projected controls, instance capacities, bounded draw calls, no idle instance/DOM writes, projector tracking, zoom return/clamp, rotation, refocus, overflow, settings/disable/reduced motion, suspend/detach/reattach, new shapes, Torus hole, isolation dimming and nested copies.
- Native interactions draw Pacman using J and a canvas drag, select it, focus Depth with B and adjust 50 to 49. Native armature controls adjust opening speed and show separate folding controls. Fixture writes are confined to `site.about.notes.scroll-fixture14.*` and in-memory settings, never the user's drawing/settings keys.
- Evidence and final source hashes: `output/notes-face/revision-14/`. The actual About page is checked separately with the saved artwork; its preferences/artwork are not modified by these tests.

## All remaining phases and steps

| Phase | Remaining steps |
| --- | --- |
| Current visual acceptance | Review face-angle lift, slower deployment, hinged bobs, rim spacing, zoom clamping/return, tablet stretching, left Layers divider/scrolling, right-panel width and transformed text on the user's GPU. Fix concrete findings. |
| 5-7 feature acceptance | Continue drawing/gears/Smart rotate; Arc/Torus/Pacman depth, fill, clipping and anchor edits; nested isolation entry/exit and history; Alt copies/Repeat/aliases; alignment/snaps; centered/Ctrl/Shift resizing; pane/group/layer rename/order/history/shortcuts; rear/clipped art and free zoom versus interior fit. |
| 7 optional expansion | Pie-chart sector conversion, radial boundaries/percentage editing and shared-center behavior after acceptance; further/oval gear profiles only on request with contact/closure/body/footprint validation. |
| 8 technical acceptance | Sustained heavy drawing/clipped-outline/snap/copy histories and deployment on target/low-end devices; long-session memory/navigation teardown; actual mouse/modifier/pen/touch/multitouch/cancel combinations; focus/roll/keyboard/text ownership; blocked/full storage/recovery/multi-tab safety; WebGL/model failures; palette/settings/background combinations; reduced motion and assistive technology; broad browser/device evidence, extreme frustum transitions and projected Layers drags. |
| 9 physical/presentation | Full moving clearance/self-collision against all face attachments, mesh surfaces and interior equipment, including independently lowering glass and configurable fold speeds; fixed tablet/actuator sizes and travel stops; mounting/rail tolerances; interchangeable uncut/gear-cut glass strength and fabrication. Detailed kit assets/live UI during unrolling remain optional. |

No commit, push, publication or deployment. Preview: http://127.0.0.1:8878/_1-about/about.html?review=1
