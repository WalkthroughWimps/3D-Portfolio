# Notes panel/runtime revision 12 — October 17, 2026

Bounded follow-up delegated by About Cube. All writes were reserved together under Notes Face. Shared schema, host, registry, interior drive, projector, face entry and coordination documentation were not edited. No commit, push, publish or deployment.

## Completed

- Preserved the coordinator's new surface settings, optional rear-art mesh/tint, edge-versus-interior-fit layout and `projectionSource { texture, carrier, radius }` API. The runtime explicitly enables fitting only when `showBacking` is false and `fitInterior` is true; edge mode returns zoom 1 regardless of glass size. The pure layout helper's existing default is retained for compatibility. Shared host zoom limits and projector implementation remain About Cube owned.
- Show clipped art now has a full-width, readable row above Select, plus the Notes settings entry. Both controls share the existing canonical settings/storage field. Editor initialization reads the shared store, including session-only preferences, and no longer performs a redundant raw storage write. The visible shortcut badge is excluded from the checkbox's accessible name.
- Added beveled panel shells, recessed layer tree, edge highlights and a distinct lighter Layers surface. Removed live backdrop blurs from all Notes panels. No CSS perspective/ancestor transform was added, preserving fixed positioning and hit coordinates. Wide panels share the portrait-safe top baseline and retain scrollable content and existing horizontal gaps. Narrow Layers/Gear sharing is preserved.
- Rear-art visibility leaves the rear tint and glass intact. The rim now renders from either side. Turning off the entire Notes face still hides that face as required by the shared enabled setting.
- Disabling Notes immediately releases drawing/turn input, stops gear activity, hides/inerts controls and dock, clears the cursor/accessible canvas label and resets the dwell. Disabled Notes cannot claim keyboard shortcuts. Re-enabling waits through a fresh dwell. Suspension clears the cursor and restores the canvas label too.
- Canvas listeners now use a per-attachment AbortController, aborted during detach and before rebinding. Repeated attach/detach cannot accumulate canvas handlers. Replacing an existing attachment first detaches it; attaching after disposal is ignored. Rear materials/geometries/textures remain face-owned; borrowed model resources are untouched.

## Validation and evidence

- `node --test tools/notes-drawing.test.mjs tools/notes-panel-runtime.test.mjs`: **48 pass**. The three new cases cover oversized/manual edge framing, settings space without forced zoom, pane-count changes, optional fit and compact layout bounds.
- Targeted ESLint for Notes JavaScript/new tests and generated HTML/worker freshness pass.
- Isolated runtime fixture: **22 checks at 1280px**, **23 at 390px**, **23 at 720px**. Covers continuous focus/default Layers, projector texture ownership, rear tint/rim, both directions of clipped-setting synchronization, disabled input/UI, new dwell, manual close view, fit/backing exclusion, repeated detach/reattach, exactly one input owner, idempotent texture/glass cleanup, borrowed geometry survival, drawing after reattachment, suspension, widths/overlap, shared swaps/inert controls and no backdrop blur.
- The disposable fixture copies only the two runtime/editor modules to redirect settings and panel-shell services to memory stubs and drawing storage to `site.about.notes.runtime-fixture.*`; other drawing modules and CSS are the production files. It never writes user artwork/settings keys. `output/notes-face/revision-12/source-manifest.json` records final source hashes.
- Native checks use a newly created About tab at8878, never the user's tab. Verified edge-aligned panels, Notes surface settings, compact sharing when Settings opens, wheel input, no horizontal Notes panel overflow and eight saved objects retained. The integrated About tab has no console errors. Initial fixed-delay fixture checks were sensitive to background frame scheduling; the final harness drives lifecycle updates while awaiting the real-time dwell, and all final runs pass. Actual shared host/projector changes remain under the coordinator's integration review.
- Evidence folder: `output/notes-face/revision-12/`. See `integrated-panels.png`, `rear-art.png`, `rear-glass-only.png`, `compact-390.png`, `compact-720.png`, `browser-results-1280.txt`, `browser-results-390.txt`, `browser-results-720.txt` and `runtime-fixture.html`.

## All remaining phases and steps

| Phase | Remaining steps |
| --- | --- |
| Current integration | About Cube to review the combined shared-host wheel limits, projector/backing image, settings and other face overlays with this Notes source. No bounded Notes implementation remains after verification; fix concrete integration/user findings. |
| 5–7 user acceptance | Review edge/free-zoom versus optional interior fit, rear-art toggle/tinted glass, clipped-control placement, shell depth, panel dwell/elasticity/exit, Layers default/shared swaps, keyboard and compact scrolling. Continue Alt copies/Repeat/aliases, alignment and movement snaps, centered/Ctrl/Shift resizing, drawing/gears/Smart rotate, panes/groups/layers/rename/order/history/shortcuts; fix findings. |
| 7 optional expansion | Additional/oval gear profiles only on request, with contact, closure, whole-body clearance and footprint checks. Current six guides/nine rollers are implemented. |
| 8 technical acceptance | Sustained dense drawing/clipped-outline/snap/repeated-copy/panel animation performance on target and low-end devices; long-session memory/navigation teardown; real modifier, mouse/pen/touch/multitouch/cancel combinations; complete focus/roll/keyboard/text ownership; blocked/full storage, recovery and multi-tab safety; WebGL/model failure; palette/settings/background combinations; reduced motion/assistive technology; broader browser/device evidence. |
| 9 presentation/physical | Choose actual3D tablets, angled main/right Layers/opposite gears; control projection/hit mapping, occlusion/responsiveness; rail/opening mechanisms; raised/interchangeable uncut/guide glass; mounting/travel/mechanism clearances. Manufactured tooth geometry, cut-glass strength/tolerances and fabrication need separate engineering validation. |

Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1
