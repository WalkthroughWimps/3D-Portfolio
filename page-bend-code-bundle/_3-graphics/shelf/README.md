# Graphics shelf integration

Production entry: `../graphics.html`. The normal site bootstrap retains the header, settings and accessibility shell. The reviewed Study 21 scene lives here as regular site source and assets; it does not load anything from `output/coursebook-lab`.

## Scene and input

- Books use the reviewed procedural binding/pages and felt materials. Closed books use inexpensive proxies; hidden page art stays present at the travel resolution, with higher resolution art loaded for the reader. Shelf, decorations, boxes and motion tracks derive from evaluated Blender geometry and world transforms, including nested animation parents.
- Once all scene assets load, a 1.1-second establishing zoom moves from the wide shelf view to a framing that fills the viewport vertically. Narrow screens intentionally crop the outer wall horizontally. Header, navigation, settings, utilities and mouse overlays stay visible while items are out.
- The CSS page pattern stays fixed. The bounded wall and stored objects retreat together as an item is removed.
- Graphics settings optionally allow gentle shelf rotation (±20° horizontally, ±8° vertically). It defaults to the fixed front view. Switching it off animates a return to the canonical shelf view; shelf and video preferences are independent.
- `item-view-controls.mjs` imports the current shared mouse-control module directly. Middle click focuses, middle drag pans, double middle click restores the center and zoom; double right click restores rotation and zoom. Graphics opts into these animated resets without changing the shared module or other pages. The right-button adapter prevents two middle-click implementations from competing. Put-away clears focus/pan/projection state, restores the canonical shelf camera and unloads the tabletop iframe. Taking an item out establishes its canonical shot again. Spread/grid layout choice persists for the session.
- Shift + wheel turns pages; plain wheel zooms. Pages also accept clicks, drags and arrow keys. Released fractional turns settle. Grid returns commit the focused page to all six books without moving the other books out of their grid positions.
- Before a view-change action, a 480ms camera reset restores its canonical pan, zoom and viewing direction. Reset motion follows an orbit arc, avoiding a path through the object, and completes before the source action begins. The default pose is stored separately from user navigation.
- Skip animation and **S** complete the active action chain, including subsequent clip bridges, camera and room transitions. Skipping still waits for required assets/contact preparation if those have not finished loading. Text fields retain normal typing.

## Navigation

The six grade pendants use the actual raised lettering from `Pendant_G1`…`Pendant_G6`, exported read-only into `assets/navigation/grade-meshes.json` and `.bin` by `export-grade-meshes.py`. Their original colors, lettering extrusion, bevels and per-vertex normals remain. Each circle's source outline and tilt is rebuilt into a closed 0.04-unit medallion with soft bevels, giving all six a visible back and consistent depth. Circle roughness is 0.94 with a very subtle bump from one shared 128px grayscale texture; lettering roughness is 0.86. Both are nonmetallic. The pack is 4,318,416 bytes; only the active pendant is drawn. They are ordinary depth-tested, depth-writing meshes parented to the selected book, anchored once in its empty page footprint. They rotate with the book's 3D space and other scene geometry can cover them. Picking uses the nearest actual triangle, including the pendant's holes, rather than a screen-space hit rectangle. Native offscreen buttons provide a keyboard equivalent, appearing as a text action only when keyboard-focused.

Only a **spread reader** shows grade navigation: the previous grade beside a fully closed front cover, or the next grade beside a fully closed back cover. First/last grades omit unavailable neighbors. Grid view never shows adjacent-grade controls. Scale/rotation entrance and exit animate about the fixed anchor; camera motion never recomputes the anchor. The older PNG renders remain as source-reference assets, not the scene representation.

Other contextual actions are layered SVG relief artwork in the right column, with light orange circles, purple type and blue strokes. Entrance/exit transforms use the normalized evaluated G1 track (2400–2411 in; 2413–2433 out), holding until the action changes. Native buttons retain accessible names and keyboard operation. The expandable text controls remain available.

## Freeform tabletops

Both games open `tabletop.html` in the scene's modal. Their view state is separate from the shelf's. No route, destination, vehicle, scoring or turn rules execute. Global Conquest retains the light-blue source map, stickers, original card art, meeples and transport sticks.

Card controls:

- LMB click draws the selected count to the current hand; double LMB cuts in order. Hold/drag picks up.
- RMB flips; double RMB shuffles with visible separation/interleaving. A single card touching a matching deck inserts randomly with RMB or onto the touching side with double RMB, matching the deck's facing. Hold and release RMB gathers loose matching table cards.
- Wheel raises/lowers a held packet; it rotates other held objects on the board plane. Q/E rotates, F flips, R returns; arrow keys move a selected object.
- Hands stay on the UI layer; inactive hands are facedown around the board. Next player switches the visible hand. The six-space player selector changes hand ownership only, preserving table positions and card identity. Removed players' cards return to a matching packet, including when no physical packet remains.

Manor Mayhem has its original board, two labeled D8, six character stands and a six-card placeholder character packet. Each D8 settles with the reported value on top. RMB while holding a die rolls it; an accessible Roll D8 button is also available. `held-mouse-chord.mjs` handles the extra mouse button because browsers do not emit another pointerdown when RMB is pressed while LMB is already held. Either release order works.

Character stands have a flat disc and two raised rails forming a real slot, with the character image seated upright. They use simple collision approximations, gravity/friction, upright pickup, impact tipping and reset bounds. This is a lightweight tabletop simulation, not a general rigid-body engine.

## Games settings

Graphics settings contain a Games tab, the Games page has a Tabletop tab, and each tabletop includes character settings. All share `site.games.character-stands.v1` in local storage. Choose defaults for all stands or one of six individual characters. PNG, WebP, SVG and JPEG uploads are rasterized locally to at most 1024px; transparency is preserved. Size, opacity and a configurable silhouette stroke are supported. Outline canvases/textures rebuild only on settings changes and old textures are disposed. No test character artwork is left selected.

Vehicle quantities remain the existing configurable provisional four copies per vehicle, with one of each landmark. Changing quantities restarts that table. Player-count changes do not.

## Verification

- 12 integration tests, 5 current shared mouse-control tests and 43 reviewed scene/input/choreography regressions passed (60 total). Integration tests cover D8 face/result agreement, mouse-button chords, card conservation/order, friction/reset behavior, character overrides, contextual cover-only spread navigation and view cleanup.
- Browser checks: production loading without errors; both skip methods; original front-cover pendant placement; no grade buttons in a focused grid reader; all six grid page positions equal after return; card draw/cut/shuffle and independent hands; transparent character upload and immediate update; Manor's embedded route, stands and two dice; D8 animation/result.
- After moving the grid view off center, putting it away and taking it out again, camera position/target returned within `2.78e-17` scene units of the default view.
- Observed reader: about 18,560 triangles / 192 draws. Global Conquest: about 20,012 / 296. Manor Mayhem: about 1,146 / 64. Rendering stops while idle.
- Original `assets/.blend/graphics-page.blend` remains unchanged, SHA256 `454BF3A137E6B2B9F23647A4D951159ABD1628DC8C99CEA70ABAFDC19517B31C`.

Run the new tests with:

```
node --experimental-vm-modules --test _3-graphics/shelf/integration.test.mjs tools/shared-glb-mouse-controls.test.mjs
```

## Remaining phases / steps

1. User review of the integrated page: navigation placement, book transitions, freeform tabletop feel and dice.
2. Supply final character graphics; replace the placeholders through Games settings or package approved defaults. Confirm the vehicle print quantities when the final print PDF is available.
3. Apply any requested visual adjustments after review. Programmed game rules remain deferred at the user's request; they are not required for this freeform integration.

No commit, publication or deployment was performed.

## Easel video

Click the physical easel, or choose **The Great Race video** from the item menu. The camera zooms to the original picture plane and aligns to its upright UV corners; the wall, shelves and stored objects stay in place. Playback starts only after the camera animation finishes. The source is the movie referenced by Blender's `Easel.Vid` material: `The Great Race Sample.mp4`, read from the existing OneDrive asset folder. The web copy is `assets/easel/the-great-race.mp4`: 1920×1080 H.264/AAC, about 57 seconds and 15.3 MB, with streaming metadata at the front. It is loaded on first use, not during shelf startup.

The video is an unlit, color-managed texture on the existing `Easel.Pic` plane. Letterboxing preserves the video's 16:9 aspect within the source picture frame. Play/pause/replay, seeking and sound controls remain accessible below it. Sound follows site audio consent, mute and volume; blocked audible autoplay retries muted. Escape or **Shelf** pauses and rewinds, restores the original still image and animates back to the shelf. Hidden pages pause and resume only previously playing video. Rendering follows decoded video frames where supported, and stops when paused.

Graphics settings have separate **Allow rotation while viewing video** and **Allow zoom while viewing video** checkboxes, both off by default. Enabling either updates immediately. Switching both off animates a reset to the aligned view. These preferences use the shared settings schema and export/import system.

## Integration 23 verification

The current pass adds six presentation tests: all six finite relief meshes; a fixed world anchor under camera rotation; foreground book occlusion and depth flags; default zoom behavior for both double-click modes; reset arcs that avoid the object; vertical shelf framing across four viewport aspects; and opt-in event detection without affecting normal drags. All 23 tests in the presentation, integration and shared mouse-control suites pass. Browser checks confirm both double-click reset modes, the camera reset completing before a grid transition, a click on the actual raised Grade 2 mesh selecting that book, visible site overlays and no runtime errors. Browser evidence and shelf/reader screenshots are in `output/coursebook-integration23/`.

Remaining steps: user review of this framing/control pass; provide final character artwork and vehicle print quantities when available; make any requested visual refinements. Programmed game rules remain deferred.

## Integration 24 verification

All 24 presentation, integration and shared mouse-control tests pass. The added check casts rays at both faces of every circle, verifies consistent depth, matte materials, valid grain UVs and shared texture disposal. A browser material review confirms front, oblique and rear rendering without errors; evidence is in `output/coursebook-integration24/`. No Blender source or exported mesh pack was changed.

Remaining steps: user review of the matte medallions; final character artwork and vehicle print quantities when available; any requested visual refinements. Programmed game rules remain deferred.

## Integration 25–26 verification

All 29 tests across presentation, integration, shared mouse controls and local preferences pass. Added coverage includes UV-based easel framing, playback gating and poster restoration, bounded shelf rotation and independent persistent camera preferences. Browser checks cover physical easel picking, camera arrival before playback, full picture aspect, pause/replay, locked zoom, optional zoom, rotation setting changes, returning to the shelf and restoring the poster at time zero. The shelf context remains at full presence throughout easel use. The Blender source hash remains unchanged. Browser evidence is in `output/coursebook-easel/`.

Remaining steps: user review of the grade backs, video framing and optional camera controls; final character artwork and vehicle quantities when available; any requested visual refinements. Programmed game rules remain deferred.
