# Context-based Notes controls — October 18, 2026

Implemented in drawing-editor.js and notes.css. No shared host, settings, geometry document schema, other face, pixel framebuffer or input backend was changed. No commit, push, publication or deployment.

## Behavior

- The panel switches between drawing defaults, a selected object/group, a mixed selection and Gear art. The heading uses the selected object's existing name and type, or group name/count.
- Selected objects hide the full drawing grid. Draw tools expands the picker without changing selection; choosing a drawing mode returns to construction defaults and clears selection as before. All existing drawing-mode keyboard shortcuts remain available.
- Only applicable sides, depth, smoothing, dimensions, rotation, shape editing and fill controls appear. Fields follow the selected types, so an active drawing tool cannot leak unrelated properties into selection context. Mixed selections retain controls for eligible objects and omit single-type Pacman fields. Shared palette, snapping, history and layer access remain.
- Depth labels describe their purpose: point depth, cleft depth, thickness, ring thickness or wedge opening. The percent range remains 0–100.
- Pacman adds opening-angle and filled-slice numeric inputs, plus 45/90/180/270-degree filled-slice presets. Both inputs edit the existing normalized depth property; one is the complement of the other. They use the existing safe endpoint geometry caps. Presets update selected Pacman geometry, with normal undo/redo. Without a selection, they affect only the next shape's defaults.
- Selected-object properties use larger fields and a two-row, six-column color palette. The same two fixed 546×900 logical pixel screens and 1092×1800 textures render the UI. Controls remain native DOM elements beneath the canvas display; no per-frame DOM rebuild, new texture or extra render pass was added.

## Verification

60 focused repository drawing/panel/scroll checks and targeted drawing-editor.js ESLint pass. The current-source isolated fixture passes **73 checks at 1280px and 73 at 390px**, including 14 context checks: selection title/grid switching, relevance filtering, Pacman geometry/angle complement, presets, undo, redo, next-shape-only defaults, mixed selection, pencil smoothing, tool expansion and return to drawing mode, and framebuffer fit.

A real click on the displayed Layers tablet selected Pacman. A second real click on its opening field opened the native input. Entering 120 degrees updated the complementary filled slice to 240; keyboard Ctrl+Z restored 270. Evidence: output/notes-context-controls/pacman-context.png, browser-checks.txt and tests.txt. Disposable current-source fixture: tmp/rail-scrolls/context.html. Revision-13 is an older snapshot and does not represent the current live source.

## Mechanical acceptance update

The preceding roller-assembly handoff was sent to About Cube with explicit human authorization. Close zoom uses the approved visual fudge: floating controls remain at viewport sides while rigid hardware stows; recovery reverses/redeploys and restores physical screens. No manual camera override or uniform scaling of physical mechanisms is used.

About Cube subsequently completed its combined-host check against 1043 other meshes using actual transformed vertices. Its separating-plane bound leaves .068999997 local units to the documented moving assembly envelopes; output/about-cube/combined-notes-arm-clearance.txt and combined-notes-arm-view.png contain the evidence. This closes the combined-host implementation follow-up listed in scroll-rail-assemblies-handoff.md. Source-skin, pane/profile, render contact, fallback and lifecycle evidence remain under output/notes-rail-assemblies/. These are bounded visual/sampled checks, not continuous self-contact or fabrication certification.

## All remaining phases / steps

Required implementation and verification for this context-panel request and the bounded roller-assembly slice: **none**.

Optional later work: pie-chart splitting into separately colored grouped slices and its context controls; a continuous self-contact/fabrication audit of the mechanism. No broader site architecture phase was advanced by this slice.

Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1
