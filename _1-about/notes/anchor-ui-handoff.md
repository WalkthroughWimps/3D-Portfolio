# Anchor snapping and compact drawing controls — October 19, 2026

## Implemented

Edited drawing-editor.js, drawing-rotation.js, notes.css and the existing drawing test suite. The fixed tablet backend, pixel dimensions, host, model, settings schema, other faces and drawing storage format were retained. tablet-screen.js was inspected/reserved by the delegate but did not require edits.

- Shape anchors and line endpoints snap while dragged. Their target list is prepared at gesture start, reused during movement and refreshed if snap preferences change. The moved object's crossing geometry is excluded to avoid stale self-targets. Its other stationary anchors and original center remain available under their categories. Alt curve-handle behavior and Shift line rotation locks remain; near-ray snaps are projected onto the locked ray so the final angle is exact.
- Added persistent Intersects category alongside Pane, Anchors and Centers. Missing saved preferences default to enabled. The category also feeds existing move snapping and Smart rotate through the shared target builder. It honors the master switch and logical entity/pane visibility. Separate path contours are never bridged. Ordinary adjacent joins, including a closed contour's first/last join, are excluded; genuine nonadjacent self-crossings remain eligible. Parallel/collinear overlaps do not invent a unique point.
- Intersection preparation uses a spatial broad phase and explicit caps: up to 300 sampled segments per shape, 1200 overall, 120000 candidate comparisons and 256 intersections. Exact straight line segments have priority so dense earlier gear traces do not consume their allowance. Pencil sampling occurs before world conversion; non-pencil curve subdivision is bounded. Dense paths and curves are approximations and may omit crossings after caps, rather than claiming complete CAD-style intersection coverage.
- Smart rotate additionally retains its target snapshot across hover movement. Document saves/edits and preference changes invalidate that snapshot. It does not rebuild all intersections for each hover event, and mouse-down reuses one prepared target list rather than computing it twice.
- Show clipped art is near the top below the context heading. Draw tools is an accessible button disclosure immediately above the grid, always available; choosing a tool closes it. Select remains outside the collapsed grid and is compact. The disclosure uses actual up/down glyph text so its state is rendered by the fixed canvas tablet, rather than depending on unsupported CSS rotation.
- Color target controls are overlapping solid Fill and hollow Stroke swatches in stable positions. Clicking a swatch only changes the active target; a palette choice then edits that property of the selection, or construction defaults with no selection. The active swatch is painted last and marked by its border. No-color slashes are real SVG paths so they appear on the rasterized tablet. Open paths keep Fill visible but disabled. Stroke X, Fill F and slash shortcuts remain unchanged. Active swatch DOM order is changed only when necessary.

## Review and verification

Bounded implementation used one GPT-6 Sol / medium delegate with sequential geometry and UI phases. The coordinator reviewed current source, requested the closing-join/comparison-cap correction and other concrete refinements, inspected its results, added the Smart rotate snapshot reuse and raster-safe disclosure glyph, and verified the integration. All participating source edits used the face reservation helper with rereads and released tokens; the final coordinator editor/CSS/doc reservation is released after this slice. No higher-family model phase or broader architecture work was delegated.

- Targeted ESLint passes.
- 49 drawing tests pass, including new finite intersection/master/category and ordinary closed-join regressions. The focused drawing/panel/scroll set passes 62 checks.
- All 159 current repository tests pass; this includes concurrent already-integrated work from other face owners, which is not claimed as this task's implementation.
- Fresh current-source browser fixture passes 99 checks at 1280px and 99 at 390px. This includes anchor and endpoint snapping to two crossing lines; category and master disable; pane compass, other anchors, external and own centers; undo/redo; exact Shift locks; compact Select; disclosure position/state and selection retention; overlapping SVG swatches; next target activation without recoloring; palette/no-color property isolation; fixed framebuffer fit; and counted target-builder reuse during Smart rotate hover with refresh on preference changes.
- A real click on the displayed tablet opened its tools, and a real click on the displayed Fill swatch activated it without changing the artwork. The fixture uses separate temporary drawing/snap storage keys. It renders the same live production geometry/snap, CSS and tablet backend; only settings/time and the editor storage key/import wiring are isolated. A fixture-only counter verifies target preparation frequency without adding a production debug API.
- The live About page loads the integrated cube and the revised Notes controls without page console errors; review URL returns HTTP 200. Other owners' runtime aperture and middle-button changes were observed but not modified or reaudited by this slice.

Evidence: output/notes-anchor-ui/tests.txt, all-tests.txt, browser-checks-1280.txt, browser-checks-390.txt and compact-tablet.png. Disposable fixture: tmp/notes-anchor-ui/context.html. Its old expectation that choosing a drawing tool leaves the grid open was updated to the new intentional collapse behavior; no product failure was hidden by that change.

## All remaining phases / steps

Required implementation and verification for this anchor/UI request: none.

Adaptive-budget work remains separate: representative calibration, weighted geometry/render/cache/history allowances, admission/greyed creation controls and stress validation. Current Debug labels still distinguish uncalibrated adaptive limits from existing fixed caps.

Animation remains on hold: object-sharing workspace/storage; frame/pane copying; outline onion skins; interpolation/playback; performance validation; optional export. Optional Notes work remains grouped independently colored pie-chart slices and a continuous mechanism self-contact/fabrication audit. The earlier bounded combined-host clearance review remains complete; this request does not reopen it. No commit, push, publication or deployment.

Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1
