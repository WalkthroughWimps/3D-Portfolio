# Refs sketch handoff

The original Refs sketch program has four completed phases. The editable 2D face now also has a face-owned cabinet and portrait plate selector; the current follow-up is tracked below.

| Phase | Scope | Owner / effort | Outcome |
| --- | --- | --- | --- |
| 1 | Face orientation and mounting | Geometry agent · GPT-6 Sol, medium | Upright sketch mounts to the Refs backing and follows cube turns. |
| 2 | Curves and snap-board option API | Geometry agent · GPT-6 Sol, medium | Curio, rounded and circular profiles, openings, and normalized drawing controls are available. A clipping fix keeps maximum width/height inside the texture bounds while preserving the exact default world scale. |
| 3 | Constructor controls and local persistence | Controls agent · GPT-6 Luna, medium | Live controls expose size, placement, profile, opening dimensions and embellishments. The `about.refs.sketch` SettingsArchive owner on page `about` stores normalized options; reset restores defaults. |
| 4 | Integration and review | Root coordinator | Face lifecycle, settings contrast behavior and integrated browser acceptance are complete. |

Evidence: `output/refs-sketch/orientation.json` records eight orientation and lifecycle checks. `output/refs-sketch/constructor.json` records nine Constructor checks, including mobile width/overflow, live controls and degree conversion, real-reload restore, profile bounds, cross-page contrast changes, independent backing behavior, reset and cleanup. Both suites passed without page errors. Defaults were restored; final view is `output/refs-sketch/final.png` and Constructor view `output/refs-sketch/constructor-preview.png`.

## Direct 2D editor follow-up — October 22, 2026

The Constructor now places a 2D editor before the detailed controls. It draws through `drawRefsSketch`, the same renderer used for the mounted face texture. The preview applies overall size, position, and rotation; the mounted drawing's global placement remains inside the shared face carrier. Element selection, drag, resize handles, and X/Y/width/height fields use the board's element frames. Mirror paired parts is on by default and can be disabled for independent edits. Dashed left/right hinge axes come from the source Illustrator plate and are drawing marks only, with no hardware depth. Precision/Sketch style and the properly rounded profile are exposed alongside the existing controls. Every numeric range readout opens a same-size text field for direct entry; Enter or blur commits, Escape cancels, and finite values are normalized by the shared board API.

Dragging updates the mounted face live and captures the `about.refs.sketch` archive only on pointer release. Escape, pointer cancellation, window blur, and disposal restore the gesture's starting options. Selection is transient. Reset selected part clears its stored override (and its partner while mirroring is on); Reset sketch defaults clears all overrides. The existing archive owner restores the new fields and element overrides on reload.

Acceptance evidence is under `output/refs-sketch-editor/`. `geometry.json` passes five checks: rolled face placement, diagram-to-rendered-3D coordinates, paired and independent hinges, and zero edge pixels across all three profiles at extreme edits. `integration.json` passes ten checks with no page errors, including a 390px viewport without overflow, exact button/text-field dimensions, numeric Enter/blur/Escape/invalid behavior, hinge/style controls, selected-part entry, real reload storage restoration, and live cross-page contrast. `pointer.json` records actual 390px pointer drag and corner resize, followed by a direct width entry. Targeted ESLint and `git diff --check` passed for the Refs controls/editor.

The direct 2D editor follow-up is complete. Its earlier evidence concerns the 2D editor; it does not constitute browser acceptance of the cabinet and plate selector. Nothing is committed, pushed, published or deployed.

## Cabinet and portrait plate selector follow-up — October 22, 2026

This follow-up extends the existing editable face. The cabinet adds adjustable depth, wall thickness, and an optional cutaway. The portrait opening holds one seated numbered plate in a fixed front station while the other plates keep stable storage berths. The selector opens opposite members in the face plane at a default 60°, retracts and returns the current plate, seeks and fetches the requested plate, presents it, and closes. Rapid requests queue the latest target. Reduced motion seats the requested plate immediately. The cabinet and selector borrow the cube's renderer and model and dispose their own added resources; their highlights use the shared live contrast value.

| Phase | Scope | Owner / effort | Outcome and review |
| --- | --- | --- | --- |
| 1 | Cabinet geometry and normalized options | Refs geometry agent · GPT-6 Sol, medium | `cabinet.js` builds the shell, openings, trim, and cutaway from the 2D contour. `snap-board.js` normalizes cabinet and plate settings. Geometry and bounds review completed by the coordinator. |
| 2 | Plate stack, selector, and lifecycle | Refs selector agent · GPT-6 Sol, medium | `selector.js` provides fixed berths, front station, animation phases, latest-wins queue, reduced-motion handling, selector state/events, and resource cleanup. Source-level geometry and lifecycle checks completed. |
| 3 | Constructor controls and archive handoff | Refs controls agent · GPT-6 Sol, medium | Controls expose cabinet visibility/cutaway, mechanism visibility, depth, wall thickness, plate count/spacing, selector angle/speed, and 1-based plate actions. All options persist through `about.refs.sketch`; phase status and applied spacing are visible. Targeted lint and source contract checks passed. |
| 4 | Integrated acceptance and handoff | Root coordinator | Combined source and diff review is complete. Remaining: a fresh live browser interaction pass in the About Constructor covering selection and queueing, reload persistence, contrast updates, and narrow layout. |

Focused offline production-board checks are recorded in `output/refs-cabinet/selector-checks.json`. Eight animation boundaries had maximum positional jump 0.0003012 at `dt=.01`; the default open-center separation was 0.34171 versus a 0.3394 plate diameter. The default plate envelope was 0.00758 below spacing 0.025; minimum depth with eight plates produced envelope 0.001825 below applied spacing 0.0025. Actual front plate to cradle vertex clearance during open and close was 0.0020904 at default depth and 0.0000810 at minimum depth with eight plates. Rebuilt plate labels retained contrast mapping (color 0.71 at gain 0.08). Precision and Sketch contours, fixed berths, queued selection, reduced motion, plate count one, suspension, and disposal passed focused checks. The Constructor displays the actual applied spacing because the selector automatically fits the stack within a shallow cabinet.

`output/refs-cabinet/closed-geometry.png` and `output/refs-cabinet/open-geometry.png` illustrate the actual meshes and canvas texture rendered offline in Blender. They are geometry illustrations, not live browser screenshots.

The live browser interaction pass for selection and queueing, reload persistence, contrast updates, and narrow layout remains pending. The CUA and Node REPL browser runtimes could not initialize because their kernel asset paths are missing. A physical fabrication audit is outside this software scope.

## Plate motion and custom content follow-up — October 22, 2026

The current request keeps seven numbered plates by default and lets the visitor add plates up to 32. Each plate can hold a locally chosen picture and gem text, saved with the existing `about.refs.sketch` archive. The Constructor shows the selected target plate in the upper right of the Cabinet & portrait plates section. Its picture uses the same circular crop, bronze rim, and fallback number artwork as the 3D plate; the gem text is editable immediately after the picture controls. Plate content remains stored when the active count is reduced. The text is reserved for a future gem display in an iris door; this follow-up does not build that door.

The exchange now follows this sequence: the current plate follows the right selector when it opens, slides back at the right, returns to its left storage berth, and the selected plate travels from its berth to the right selector. It slides forward there, then follows the selector home to the centre. Rapid choices queue the latest target, and reduced motion seats it directly.

| Phase | Scope | Owner / effort | Outcome and review |
| --- | --- | --- | --- |
| 1 | Plate motion and content API | Refs plate motion agent · GPT-6 Sol, medium | `selector.js`, `snap-board.js`, and `plate-art.js` implement the exchange, normalized per-plate metadata, drawing, and disposal. Twelve focused checks are recorded in `output/refs-plates-custom/plate-motion-content-check.json`; combined source review is complete. |
| 2 | Constructor customization and handoff | Refs controls agent · GPT-6 Sol, medium | `controls.js` adds Add plate, per-plate picture selection/removal, gem text, and a selected-plate preview. Module syntax, targeted ESLint, upload-race review, and selector rod endpoint checks passed; combined source review is complete. |

Six integration checks pass in `output/refs-plates-custom/integration-checks.json`: real picture decoding with pixel-identical preview and 3D artwork, circular transparency, no picture reload on text edits, archive rehydration of count/selection/picture/text, inactive-content retention, and cloned metadata. `output/refs-plates-custom/open-geometry.png` is an offline render of the updated seven-plate opening pose, not a browser screenshot. The only remaining acceptance phase is a live About Constructor pass when browser automation is available. It should cover add/select/previous/next, the full exchange and queued requests, picture and text persistence after reload, reducing and restoring plate count, picture removal, contrast changes, and a 390px layout. Browser acceptance is pending because the browser runtime's kernel asset paths are unavailable. Iris-door construction and gem-text rendering are future work; per-plate gem text is saved now. No commit, push, publication, or deployment has been requested.

## Floral portrait backing and clearance follow-up — October 22, 2026

The selector's exchange now uses separate withdrawal and approach phases. Seeking happens outside the stack, and the arms reach far enough for the full plate rims to clear while the source 60° angle remains. `output/refs-clearance/selector-checks.json` records 36 checks, with minimum open X gap .006 world units, minimum cradle Y gap .00002025 in the shallow 32-plate case, and maximum boundary step .00048889. The reproduction script is `tmp/refs-clearance-review/check.mjs`.

The face-owned `selector-backing.js` places a small fixed elliptical wallpaper panel behind the portrait plate stack, using `assets/vintage-floral-wallpaper-v1.png`. It follows the edited portrait frame and sits at `rearY - .005`, behind the final stored berth. The panel is a sibling of the cabinet and selector under the existing placement group; it leaves the large iris aperture and the borrowed `back.refs` model unchanged. Its texture loads once, and its muted color follows live contrast updates. The Constructor's **Floral backing** switch defaults on and persists through the existing archive owner.

Coordinator source review and eight backing checks are complete in `output/refs-clearance/backing-checks.json`. They cover the real PNG load, contrast before and after loading, edited portrait placement, texture reuse, independent visibility, positive clearance behind all stored plates, one-time disposal, and late-load cleanup. The minimum rear clearance is .006828125 world units in the shallow 32-plate case. Offline geometry views are `output/refs-clearance/open-geometry.png` and `output/refs-clearance/open-front-geometry.png`; these are Blender renders of the production meshes, not live browser screenshots. Targeted ESLint and diff checks pass. Remaining: a live browser interaction pass while the CUA and Node REPL runtimes lack kernel assets. That pass should verify the floral switch and contrast after reload, edited portrait geometry, the full plate exchange and queue, saved picture/gem text, and narrow layout. Recommended next feature phases are an iris door with gem-text display, then outer cabinet doors; neither is built by this follow-up. Nothing has been committed, pushed, published, or deployed.



## Fixed-pivot selector and cabinet front — October 22, 2026

The stack and selector now share a stationary X/Z pivot below the portrait station. Every opening, closing, storage return, empty withdrawal, approach and fetch uses the same circular arm-tip path. The carried plate and cradle rotate with that arm; depth indexing remains outside the stack. The selected angle is preserved (60° by default), and arm reach accounts for the projected width of a rotated elliptical portrait. Stable berths, queued selection, per-plate content and reduced-motion seating remain in place.

A slate cabinet front now fills the shell between nine shaped compartment cut-outs: portrait, main iris aperture, paired tall bays, paired crescents, paired lower arches and rounded plaque. `contours.js` supplies the same sampled boundaries to the sketch and cabinet. The front surface uses trapezoids bounded by contour vertices and crossings, so overlapping or off-contour openings form a void union without stepped edges or long bridging triangles. Small compartments have matching recessed backs and walls. The portrait has no deep sleeve that could cross the plate swing; the thin front skin clears the nearest projected plate surface even at minimum cabinet depth. **Cabinet front** is a persistent Constructor toggle, default on. Cutaway mode hides the front to expose the mechanism. Wallpaper size and cabinet footprint remain unchanged for this pass.

| Phase | Scope | Owner / effort | Outcome and review |
| --- | --- | --- | --- |
| 1 | Fixed-pivot selector movement | Refs motion agent · GPT-6 Sol, medium | One pivot and circular arm-tip path for every swing; coordinator reviewed the implementation and rotated-ellipse clearance. |
| 2 | Solid front and shaped compartment recesses | Refs cabinet agent · GPT-6 Sol, medium | Shared drawing/cut-out contours, persisted front visibility, true mesh openings and depth clearance; coordinator reviewed source and assembled geometry. |
| 3 | Integration review and handoff | Root coordinator | Offline production-mesh checks, targeted lint and Blender views completed. Live Constructor interaction remains pending because the CUA runtime cannot initialize its kernel assets. |

Evidence is under `output/refs-front/`. `fixed-pivot-checks.json` records 36 cases spanning three portrait aspects, 35°/60°/80°, default seven plates and shallow 32-plate storage, in both directions. Maximum pivot-radius error is 1.11e-16 world units; maximum phase-boundary step is .0005812, and minimum cradle-to-plate depth gap is .00002025. `motion-lifecycle-checks.json` records queue completion, suspension/resume, reduced-motion seating, single-plate stability, retained gem text and harmless repeated disposal. `front-mesh-checks.json` covers opening and solid-area rays, profiles, overlapping/edited openings, positive front/plate clearance, toggles, contrast and cleanup. Minimum front-to-projected-plate clearance is .000692 world units across depths .04–.45 and counts 1–32. `closed-front.png` and `open-oblique.png` are offline Blender renders of the production meshes and textures, not live browser screenshots. Deliberately overlapping or off-cabinet edits preserve the front's openings, but their independent recessed backs and side walls may still intersect behind the front; full interior boolean reconstruction is deferred.

Remaining phases and steps:

1. Review the live About Constructor when browser tooling is available: front/cutaway toggles, all nine openings after 2D edits, the complete exchange and queued selections, picture/gem-text reload persistence, contrast and narrow layout.
2. With the front visible, judge wallpaper coverage and how much selector detail is useful; adjust coverage or concealed mechanism detail if needed.
3. Build the iris door and display the selected plate's saved gem text.
4. Build the outer cabinet doors and their hinge/opening behavior.
5. Integrate those doors with plate exchange timing and complete the final visual, persistence, accessibility and lifecycle review.

No commit, push, publication or deployment has been requested. Live review: http://127.0.0.1:8878/_1-about/about.html?review=1&face=refs.

## Full wallpaper back, plate housing and temporary iris — October 22, 2026

This pass implements the housing/backing changes requested after the cabinet-front review. One continuous UV-mapped wallpaper sheet now follows the cabinet's complete rear contour. The seven small compartments no longer have opaque recessed back panels; their side walls extend to the wallpaper plane. This supersedes the earlier small portrait-only wallpaper and shaped opaque pocket backs. The existing texture loads once per board, remains independent of mechanism visibility, follows live contrast and edited cabinet profiles, and retains safe disposal during an unfinished load.

`plate-housing.js` adds a stationary front cover with a portrait opening and enclosing side walls. Its rounded outline comes from the convex envelope of circular bounds sampled along the entire selector orbit, including the arm pivot. It provides a rounded home crest, rounded lower end regions and tangent connecting edges, with room between the named poses as well as at them. `selector-geometry.js` shares the existing motion dimensions with the enclosure; selector movement is unchanged. Decorative arm hub radius was reduced from .012 to .006 to fit behind the cover. The housing walls overlap the rear wallpaper plane. **Plate housing** is a saved Constructor toggle; **Floral cabinet back** now describes the full sheet. The housing follows the mechanism's enabled state; turn its own switch off to inspect the moving assembly.

`iris-placeholder.js` closes the main aperture with a fitted bronze annulus and an unsegmented spherical cap. At the default circular aperture, the cap is a true sphere section; it follows the edited frame when stretched. Its visible surface projects forward from a seated edge, without an unseen sphere half penetrating the wallpaper or selector. Uniform polar sampling, a single pole and analytic smooth normals avoid a centre/seam crease and coarse edge bands at large bulges. **Dummy iris door** and **Dummy iris bulge / aperture radius** persist through the existing archive owner. The ratio defaults to .15 and ranges from .03 to 1 (a hemisphere). This is a closed placeholder for future curved leaves; it has no iris animation or gem-text rendering yet.

| Phase | Scope | Owner / effort | Outcome and review |
| --- | --- | --- | --- |
| 1 | Full rear wallpaper and swept plate housing | Refs housing agent · GPT-6 Sol, medium | Source, moving-mesh containment, wallpaper/lifecycle checks and coordinator geometry review complete. |
| 2 | Fitted temporary iris frame and spherical surface | Refs iris agent · GPT-6 Sol, low | Surface fit, ray coverage, smooth normals, contrast, visibility and cleanup checks complete. |
| 3 | Archive and visual integration | Root coordinator | Actual SettingsArchive round-trip, targeted lint and offline production-geometry views complete. Live browser interaction is still pending because the CUA runtime cannot initialize its kernel assets. |

Evidence is under `output/refs-housing/`. `housing-checks.json` covers 18 combinations of 35°/60°/80°, square/tall/wide layouts and default seven/shallow 32-plate storage: 9,011,277 sampled moving vertices remain inside the enclosure, with minimum front-cover depth clearance .00232 world units in that matrix. The additional shallow single-plate check leaves .001408 clearance to the nearest plate rim. Wallpaper load reuse, contrast, independent visibility, geometry rebuilds, repeated cleanup and late-load safety pass. `iris-checks.json` covers interior and annulus rays, both bulge limits, an edited ellipse, finite geometry, unit/seam normals, live contrast, normalization and disposal. `archive-checks.json` uses the actual SettingsArchive with the Constructor whitelist to rehydrate the new options and existing plate text; this is an offline round-trip, not a real browser reload. Targeted lint and diff checks pass. `closed-front.png`, `open-oblique.png` and `housing-oblique.png` are offline Blender renders of production geometry and textures, not browser screenshots; the housing inspection view has the cabinet front and dummy iris hidden. The supplied recording was inspected using sampled frames saved as `recording-contact.png`.

Remaining phases and steps:

1. Review the live Constructor and rotating cube when browser tooling is available: wallpaper through every small compartment, housing occlusion during exchange, front/cutaway/housing/iris switches, edited frames, contrast, real reload persistence and narrow layout.
2. Tune the housing silhouette, wallpaper scale and temporary sphere curvature from the assembled live view if needed. Large overlapping/off-cabinet element edits can still intersect independent compartment walls; a complete interior boolean rebuild remains deferred.
3. Replace the temporary surface with working curved iris leaves and the selected plate's saved gem text.
4. Add outer cabinet doors, hinges and their opening behavior.
5. Coordinate door/selector timing and finish the combined visual, persistence, accessibility and lifecycle review.

No commit, push, publication or deployment was requested. Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1&face=refs.



## Refs settings split and cabinet colors — October 22, 2026

Normal Refs Settings now carries portrait plate selection, previews, images, picture size, body/rim color, gem text, cabinet face/side/trim color, decorative switches, selector speed and sketch appearance. Constructor Refs retains physical geometry, the 2D editor, hinge placement, clearance, mechanism and inspection controls, plus the full sketch reset. Both contexts share the existing `about.refs.sketch` archive owner. The plate selector retains its accessible name without a visible redundant “Plate” label; the preview caption reads “Plate N”.

The cabinet face and depth/side material colors have independent saved hex options. Defaults reproduce the prior appearance. Color edits reuse existing cabinet geometry and selector state; both shell materials continue to follow shared contrast. `output/refs-settings/checks.json` records normalization, material separation, live update, geometry reuse, contrast and actual archive-owner round-trip checks. Targeted ESLint passes. Source review covers both context registrations, event delegation, cleanup and the untouched host-pinned backing controls. Live browser review is being completed by the coordinating Refs task.

Remaining phases and steps:

1. Complete live browser acceptance of normal versus Constructor Refs panels, the plate caption/select, cabinet colors, contrast, picker/numeric entry, reload and original IndexedDB image persistence; check narrow layout and tune the assembled appearance.
2. Replace the dummy iris surface with working curved leaves and render the selected plate’s gem text.
3. Add outer cabinet doors, hinges and opening behavior.
4. Coordinate doors with focus deployment and selector exchange timing, then finish combined visual, persistence, accessibility and lifecycle acceptance.
5. Optional later work, only when requested: key/unlock interaction, user-facing portrait-window opening and plate access.
## Focus deployment, backing-limited depth and portrait window — October 22, 2026

The complete Refs assembly now extends when the camera faces it and tucks into the backing when the camera turns away. `presence-clearance.js` uses .88/.77 focus hysteresis, time-based easing and immediate reduced-motion seating. A plate exchange extends the face before rendering its motion and keeps it extended until the selector is idle. Upright roll remains independent; focus movement still runs with Upright faces off. Live size/placement edits evacuate an unsafe tucked pose immediately. Suspension freezes the added activity and hides the face; resume preserves its state.

The depth ceiling is measured from the actual borrowed `back.refs` GLB triangles and all added hardware meshes. A conservative radial envelope covers every upright roll, including hidden wallpaper and the stationary housing; only the transparent construction sketch is excluded. The six-thousandths scene-unit margin applies between the assembled rear envelope and backing skin. The current default footprint caps cabinet depth at .086601 instead of .22. Constructor depth maximum and its status show the measured ceiling and applied value; saved/imported requests are fitted while mounted. Plate spacing automatically adapts. Unmounted geometry tools retain the ordinary .04–.45 range. Enlarged or off-centre layouts keep their dimensions and stop at the nearest clear offset. The limit seats the cabinet body near its resting front plane; the curved iris can remain proud rather than forcing the complete spherical tip below that plane. Borrowed backing transforms, geometry and materials remain untouched, and hiding the backing does not remove its clearance constraint.

`portrait-window.js` adds a raised navy/bronze elliptical frame with a default border width of .20 aperture radii, adjustable from .14 to .28. Its clear opening overlaps the displayed plate body, masking the physical plate rim. An opaque inner reveal ends .0005 ahead of the nearest plate front surface, preventing an angled view of the wallpaper while leaving the moving assembly clear. The frame, reveal, glass and ornate middle-right keyhole escutcheon form one leaf. The left hinge axis sits at the actual frame edge and opens outward. Internal pose methods are ready for a future key interaction; there is no opening button, pointer/key handler, saved open state or new plate-access workflow. The existing picture and gem-text controls remain available. The reveal moves with the leaf, leaving the original wider portrait port available when a future opening feature is built.

**Portrait window frame**, **Portrait glass**, **Portrait lock** and the border-width field are saved through the existing Constructor archive. Glass strength and decorative highlights follow shared live contrast. Window geometry is reused for unrelated plate selection, gem-text and opacity edits; shape changes preserve its internal pose.

| Phase | Scope | Owner / effort | Outcome and review |
| --- | --- | --- | --- |
| 1 | Focus movement and backing depth ceiling | Refs geometry agent · GPT-6 Sol, medium | Actual backing profile, mounted depth cap, camera focus and safe live edits; coordinator source and mounted behavior review complete. |
| 2 | Masking portrait frame, glass, lock and future hinge | Refs window agent · GPT-6 Sol, medium | Closed window, fitted reveal, contrast and settings; coordinator corrected hinge-depth placement and reviewed geometry reuse and occlusion. |
| 3 | Mounted integration and handoff | Root coordinator | Actual-GLB clearance, full face behavior, archive checks and offline views complete. Live browser interaction remains pending. |

Evidence is under `output/refs-focus/`. `clearance.json` covers default and maximum depth requests, enlarged/off-centre and small footprints, maximum iris bulge and a rotated circular profile, with at least .006 conservative backing clearance at the measured endpoints. The whole normal deployment interval stays on the safe side of that endpoint bound. `face-behavior.json` exercises the production face on the actual GLB with the Constructor UI stubbed and a file texture adapter: rotated-cube focus, easing, reduced motion, exchange-before-tuck, suspension/resume, hidden-backing constraints and borrowed-resource preservation. `window-checks.json` records reveal clearance, frame-edge hinge invariance, outward glass/lock motion, geometry reuse, normalization, contrast and once-only disposal. `window-occlusion.json` records 1,800 actual opaque-mesh rays including the near opening edge, yaw/pitch through ±35°, both border limits, tall/wide edits and shallow one/32-plate storage: no wallpaper leaks or exposed physical plate rims were found. Transparent glass and picture quads are excluded from those opaque-hit checks. `archive-checks.json` rehydrates the window switches, border and existing plate text through the actual archive owner whitelist, and verifies imported depth cannot bypass the mounted ceiling. These are offline checks, not a real browser reload.

`focused-oblique.png`, `tucked-oblique.png` and `window-oblique.png` show the production assembly and actual source-backing geometry in offline Blender renders. They are geometry review views rather than browser screenshots; the isolated backing color/lighting is illustrative. Targeted ESLint and diff checks pass. File reservations were released after review.

Remaining phases and steps:

1. Review the live cube/Constructor: focused and unfocused movement, exchange completion before tuck, depth readout and manual entry, closed-window masking/glass/lock, all switches, shared contrast, real reload persistence and narrow layout.
2. Tune the housing silhouette, wallpaper scale, temporary iris curvature and window ornament from the assembled live view if needed. Large overlapping/off-cabinet edits can still intersect independent compartment walls; full interior boolean reconstruction remains deferred.
3. Replace the temporary iris surface with working curved leaves and the selected plate's gem text.
4. Add outer cabinet doors, hinges and opening behavior.
5. Coordinate doors, focus deployment and selector timing, then finish visual, persistence, accessibility and lifecycle acceptance.
6. Optional later feature, only when requested: key/unlock interaction, window opening controls and plate access through the open window. The hinge is prepared now; user-facing access is deliberately absent.

No commit, push, publication or deployment was requested. Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1&face=refs.

## Nested drum selector and source-picture controls — October 22, 2026

This pass replaces the open selector with two opposed curved, full-depth metal half-shells. The left shell encloses the stack; the right shell is the matching section that closes around the same cylinder at rest. Rolled edges, a bottom spine and the shared lower pivot give both sides visible support. A depth groove in the selector carries a bearing and swivel link. A separate pivoting grabber uses a continuous C cradle and three fingers/pads around the plate rim. The selector shell stays at its spread angle while the grabber leans toward the stack at the selected storage depth. Return/fetch carry the actual plate with that grabber; empty withdrawal and depth changes happen clear of the stack. The stationary swept housing is enlarged for the new shells, while the closer moving shells visibly bound each drum. The existing fixed X/Z pivot, stable plate berths, selection queue and reduced-motion behavior remain intact. Grip is kinematic rather than a physical contact simulation.

Each plate now stores `bodyColor`, `rimColor`, `imageScale` and `sourceId` alongside its image and gem text. Defaults preserve existing square plate art. Constructor body/background and rim colors update both physical plate materials and painted artwork; Picture size ranges from .1 to 3 and supports the existing click-readout numeric entry. New uploads retain their complete aspect ratio instead of being square-cropped. Picture size fits the complete image at 1, can shrink to reveal the chosen background, and can enlarge to crop within the circular artwork. Color/size edits redraw the already decoded artwork and reuse selector geometry without interrupting an exchange. Each plate owns its materials and cleanup; highlights still follow the shared contrast gain.

New uploads retain the original PNG/JPEG/WebP Blob in a Refs-owned IndexedDB store on this device, within the existing 4 MB and 8192-pixel dimension limits. Metadata continues to carry a compact inline preview for portable settings. Original storage prunes old unreferenced records toward 64 entries and protects all active/inactive plate source IDs. A committed write is required before claiming an original is saved; blocked/failed storage falls back to the applied preview. The picture picker opens an unlit image view and samples a native-coordinate pixel from the decoded original through a 1-by-1 sRGB canvas, before scene lighting, material tint or its own selection marker. It offers body/rim targets, hex readout, pointer/touch sampling and arrow-key selection, plus Escape/Close. It shows alpha and refuses to apply fully transparent pixels. When a local original is unavailable, the picker explicitly identifies preview sampling and asks the user to choose the file again. Older uploads must be chosen again to recover original-file sampling; their previous crop/compression cannot be reversed. Original Blobs are local-only and are not included in settings exports.

| Phase | Scope | Owner / effort | Outcome and review |
| --- | --- | --- | --- |
| 1 | Complementary shells, connected guided grabber and enclosure bounds | Refs nested selector agent · GPT-6 Sol, medium | Geometry and lifecycle checks complete; coordinator reviewed the added connections, mounted clearance and offline portrait/mechanism views. |
| 2 | Per-plate colors, picture size and original-file eyedropper | Refs plate content agent · GPT-6 Sol, medium | Targeted lint, known-pixel artwork/material checks and coordinator async/storage source review complete. |
| 3 | Combined acceptance and handoff | Root coordinator | Actual-backing depth, focus behavior, window rays and production SettingsArchive rehydration pass. Live browser and IndexedDB reload acceptance remains pending. |

`output/refs-nested/mechanism-checks.json` records 18 combinations of square/tall/wide frames, 35/60/80-degree opening angles and seven plates at .22 / 32 plates at .04 depth. The two shell contours remain separated across 81 sampled spread angles per case; their minimum sampled gap is .011384. Added moving mesh vertices fit the stationary enclosure, with minimum front-cover gap .001376. Jaw-to-rim nearest sampled vertex distance is at most .000432, a visual contact approximation. Largest sampled phase-boundary displacement is .000629 at a .01-second step. Queued selections, reduced-motion seating and repeated disposal pass at mounted-size .086601 depth with seven plates. `output/refs-nested/clearance.json` confirms the final actual-GLB default ceiling remains .086601235 and the .006 backing margin is preserved, including enlarged/off-centre and small layouts. The production face focus/tuck checks and the 1,800 opaque window rays were rerun successfully; their evidence remains under `output/refs-focus/`.

`output/refs-content/content-checks.json` records exact known red/blue source pixels, transparent-pixel handling, a 2:1 full-aspect preview, chosen-background exposure, normalized metadata round-trip, independent plate colors, selector mesh reuse and live contrast. `output/refs-content/archive-checks.json` uses the actual SettingsArchive with the production whitelist on a mounted actual GLB: body/rim colors, size, source ID and gem text rehydrate, the physical body reflects the saved color, and depth remains capped. The source ID is tested as metadata; actual browser IndexedDB Blob persistence/reload is not tested here. Upload/picker cancellation, URL revocation, transaction completion and failure fallback were source-reviewed, without a DOM event or browser race test. Targeted ESLint passes. The local preview returns HTTP 200.

`idle-oblique.png`, `open-oblique.png`, `return-oblique.png` and `mechanism-oblique.png` under `output/refs-nested/` are offline Blender views of production geometry and textures. The mechanism view hides cabinet/front/window/outer cover to expose the connected shells and grabber. These are not browser screenshots; glass and isolated backing lighting are illustrative. Browser interaction could not be completed because CUA/node_repl fail while initializing kernel assets.

Remaining phases and steps:

1. Complete live browser acceptance: select/queue plates, observe the connected grabber and close-fitting shells through the portrait window from oblique views, edit colors/size with sliders and numeric entry, and use pointer/keyboard color picking. Verify original Blob persistence across reload, fallback after a missing original, source replacement/removal/reset during pending loads, shared contrast and narrow Constructor layout.
2. Tune the housing silhouette, visible support detail, wallpaper scale, temporary iris curvature and window ornament from the assembled live view if needed. Large overlapping/off-cabinet edits can still intersect independent compartment walls; full interior boolean reconstruction remains deferred.
3. Replace the dummy iris with working curved leaves and the selected plate's gem text.
4. Add the outer cabinet doors, hinges and opening behavior.
5. Coordinate doors, focus deployment and selector timing, then finish combined visual, persistence, accessibility and lifecycle acceptance.
6. Optional later feature, only when requested: key/unlock interaction, user-facing window opening and plate access. The existing hinge remains prepared for that work.

No commit, push, publication or deployment was requested. Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1&face=refs.

## Settings split live review — October 22, 2026

The coordinating Refs task verified the normal/Constructor separation, the simplified plate labels, manual picture size entry, and independent cabinet face `#315d7d` and side `#713a2d` colors restored after a browser reload. A live review exposed a Portrait plates folding issue; its heading is now a direct section child so the shared fold body contains Focus Refs, preview and all plate controls. The coordinator will reload and check that fold and capture final evidence. Original-picture IndexedDB persistence and picker interactions still need their own browser acceptance.

Remaining phases and steps: finish the fold/reload and original-picture browser checks; tune the assembled appearance; implement curved iris leaves and gem text; add outer doors and hinges; coordinate door, focus and selector motion and complete final accessibility/lifecycle acceptance. Key/window access remains optional future work.

Final settings review: the updated page was reloaded and the complete Portrait plates section was verified hidden when collapsed and present when expanded. Previous/dropdown/Next fit one row at the live 723-by-867 viewport, with Add plate wrapping separately; the caption reads Plate 1 without a visible dropdown label. General Refs exposes plate and cosmetic controls while Constructor contains physical editing/inspection controls and full reset. Manual picture size .85, distinct cabinet colors and selected Plate 3 persisted across a real browser reload. Those temporary test values were restored to the pre-test colors, Plate 1 and size 1, and the restored values were confirmed on the final reload. Pinned Refs face/backing switches remain present. Live browser screenshots are `output/refs-settings/general-plates.png` and `general-cabinet.png`; these supersede the earlier browser-unavailable limitation for this settings slice. Targeted ESLint, offline color/material/archive checks and diff checks pass. Original-image storage, picker pixel behavior and async replacement races were not exercised in this browser slice.

Remaining phases and steps:

1. Complete original-picture browser acceptance: picker pointer/keyboard interaction, original Blob reload persistence, fallback after missing originals, replacement/removal/reset during pending loads, and further responsive/contrast checks as needed.
2. Tune the assembled housing, support detail, wallpaper, iris placeholder and frame appearance; full interior boolean reconstruction for extreme overlapping/off-cabinet edits remains deferred.
3. Implement working curved iris leaves and the selected plate's gem text.
4. Add outer cabinet doors and hinges.
5. Coordinate door, focus and selector motion and complete final visual, persistence, accessibility and lifecycle acceptance.
6. Optional later feature: key/unlock interaction, window opening and plate access, only when requested.

Nothing committed, pushed, published or deployed. Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1&face=refs.

## Cabinet material choices — October 22, 2026

Normal Refs Settings now offers separate face and side choices: Painted enamel, Oak, Walnut, Mahogany and Brushed metal. Painted enamel is the default for older archives and retains the saved face/side colors and previous .47 midpoint roughness. Wood starts with its species color at tint 0; the saved face/side colors become a stain as Wood color tint rises toward 1. Choosing a material does not replace those colors, plate pictures or any other preference. The shared Cabinet sheen control adjusts roughness, with .5 matching the prior painted finish; Wood grain scale changes texture repeat without rebuilding geometry. Trim color stays independent.

The cabinet owns a lazy, deterministic texture library. Each wood species uses one 512×512 sRGB albedo and one separate 512×512 linear grayscale bump texture; the optional metal uses one 256×256 sRGB fine-brush texture and a separate linear bump texture at the same resolution. All patterns tile periodically. At most eight texture objects exist if every choice is visited during one cabinet lifetime, and they are cached across appearance edits and disposed once with that cabinet. No meshes, draw calls, animation loop or per-frame texture generation were added. The sculpted front receives planar world-space UVs continuous across its slabs; outer and compartment walls use contour-distance/depth UVs. Finish edits reuse cabinet geometry and selector state. Wood's very low brown emissive response and the face/side finish highlights follow the existing shared contrast gain.

`output/refs-materials/checks.json` records enum/default normalization, finite clamps, front/side UV coverage across square, tall, wide and cutaway layouts, material switch geometry reuse, lazy cache, seamless wood tiles, separate linear bump maps, contrast response and idempotent disposal. `wood-grain-atlas.png` previews the generated species textures. Targeted ESLint and diff checks pass. The coordinating Refs task will judge the materials and controls in the live browser under the actual scene lights.

Remaining phases and steps:

1. Complete live browser material acceptance: inspect oak/walnut/mahogany/metal from front and oblique views, control behavior, shared contrast, save/reload and narrow layout; tune the materials from the assembled view if needed.
2. Complete original-picture browser acceptance: picker pointer/keyboard behavior, IndexedDB original Blob reload, missing-original fallback and replacement/removal/reset during pending loads.
3. Tune the assembled housing, support detail, wallpaper, temporary iris and frame; full interior boolean reconstruction for extreme overlapping/off-cabinet edits remains deferred.
4. Implement working curved iris leaves and the selected plate's gem text.
5. Add outer cabinet doors and hinges.
6. Coordinate doors, focus and selector motion; finish combined visual, persistence, accessibility and lifecycle acceptance.
7. Optional later feature, only when requested: key/unlock interaction, window opening and plate access.

Cabinet materials final acceptance: the coordinator reviewed all five material choices in the live browser under the site's current lighting, including the walnut cabinet from front and oblique angles. Independent face/side choices worked. A real page reload restored Mahogany face, Walnut sides, tint .20, grain scale 1.40 and sheen .70; manual grain-scale text entry also committed successfully. The preview was then set to natural Walnut on both surfaces, tint 0, grain scale 1 and sheen .5. Existing paint colors stayed unchanged. `material-controls-live.png`, `walnut-live.png`, `walnut-oblique-live.png`, `oak-metal-live.png`, `metal-live.png` and `mahogany-controls-live.png` under `output/refs-materials/` are actual browser screenshots. `integration-checks.json` verifies the production board reuses cabinet geometry, active selector pose and textures on appearance edits, and that the actual SettingsArchive whitelist restores all material settings. Targeted lint and diff checks pass. The material pass adds no meshes or draw calls and bounds lazy texture ownership to six 512-square wood maps plus two 256-square metal maps. Frame-time performance has not been benchmarked. No shared renderer, lighting, model backing or other face was changed by this pass.

Remaining phases and steps:

1. Complete original-picture browser acceptance: picker pointer/keyboard interaction, original Blob persistence across reload, missing-original fallback and replacement/removal/reset during pending loads; further responsive/contrast checks as needed.
2. Tune the assembled housing, support detail, wallpaper, temporary iris, frame and finishes from user review. Full interior boolean reconstruction for extreme overlapping/off-cabinet edits remains deferred.
3. Implement working curved iris leaves and selected plate gem text.
4. Add outer cabinet doors and hinges.
5. Coordinate door, focus and selector motion and complete final visual, persistence, accessibility and lifecycle acceptance.
6. Optional later feature, only when requested: key/unlock interaction, window opening and plate access.

No commit, push, publication or deployment was requested. Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1&face=refs.

## Curved cabinet wall shading repair — October 22, 2026

The outer shell and bronze fascia now use separate wall, front/rear cap and actual cutaway-end vertices. The old per-contour-segment internal end caps were removed. Adjacent wall normals meet across sampled curves and the closing seam when their face normals differ by less than 40 degrees; curio profile corners and angular pocket corners keep their creases. Circular and curved cut-edge/recess bands use the same join rule. Front/rear caps have planar UVs; walls retain their existing depth/perimeter UV direction, texture density and grain orientation. Contour points, radial inset, materials, contrast behavior, texture cache, mesh count and world-space bounds are unchanged.

`tmp/refs-smooth-review/cabinet-before.js` preserves the immediate pre-repair source for the coordinator's actual-scene before/after render. Focused production Three.js checks are in `tmp/refs-smooth-review/before.json`, `after.json` and `joins.json`. Eight square/tall/wide, rounded/circular and cutaway layouts have finite unit normals and UVs, consistent winding and no degenerate shell or band triangles. Each complete contour drops from 12 to 8 triangles per segment; each cutaway adds only two actual end-cap quads. The curio shell preserves four intentional outer and four inner creases, while all 872 smooth joins on each surface, including the wrap seam, match exactly. All 1,800 smooth band joins and 32 angular band creases match their classification. Separate cap normals double shell vertex count from 8 to 16 per complete segment; no mesh or draw call is added. Targeted ESLint passes. The coordinator owns live close-up review and any visual tuning after the current actual-scene render; browser review remains pending.

Remaining phases and steps:

1. Complete the coordinator's actual-scene close-up before/after review of the walnut sidewall and bronze fascia, tune this bounded shading repair if the render exposes a remaining artifact, and rerun clearance/window-ray checks.
2. Complete original-picture browser acceptance: picker pointer/keyboard interaction, original Blob persistence across reload, missing-original fallback, replacement/removal/reset during pending loads, and responsive/contrast checks as needed.
3. Tune the assembled housing, support detail, wallpaper, temporary iris, frame and finishes from user review. Full interior boolean reconstruction for extreme overlapping/off-cabinet edits remains deferred.
4. Implement working curved iris leaves and selected plate gem text.
5. Add outer cabinet doors and hinges.
6. Coordinate doors, focus and selector motion, then complete combined visual, persistence, accessibility and lifecycle acceptance.
7. Optional later feature, only when requested: key/unlock interaction, window opening and plate access.

Nothing committed, pushed, published or deployed. Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1&face=refs.

Final curved-wall review: matching before/after renders of the production geometry reproduce and then remove the ribbed wood sidewall and bronze fascia in the supplied screenshots. `output/refs-smooth/before-oblique.png` and `after-oblique.png` use identical camera, lighting and texture settings and preserve the exported surface normals and UVs. They are offline Blender geometry-review views, not browser screenshots; isolated lighting is illustrative. Source bounds and mesh counts match across eight layouts; explicit wall normals are continuous through smooth joins while intentional corners and cap edges stay sharp. The 1,800 existing opaque window-ray checks still find no wallpaper leaks or exposed plate rims. The actual-GLB depth checks preserve the default .086601235 cabinet ceiling and .006 conservative backing margin. Geometry evidence was copied to `output/refs-smooth/before-geometry.json`, `after-geometry.json` and `joins.json`; window and clearance rerun evidence remains in `output/refs-focus/window-occlusion.json` and `output/refs-nested/clearance.json`. Targeted ESLint and diff checks pass, and the review page returns HTTP 200. Direct live-browser confirmation is pending because the browser tool reports local browser use disabled in Work settings.

Remaining phases and steps:

1. Confirm the corrected sidewall, fascia and compartment curves in the live browser when browser control is available; further responsive/contrast review as needed.
2. Complete original-picture browser acceptance: picker pointer/keyboard interaction, original Blob reload persistence, missing-original fallback and replacement/removal/reset during pending loads.
3. Tune the assembled housing, support detail, wallpaper, temporary iris, frame and finishes from user review. Full interior boolean reconstruction for extreme overlapping/off-cabinet edits remains deferred.
4. Implement working curved iris leaves and selected plate gem text.
5. Add outer cabinet doors and hinges.
6. Coordinate doors, focus and selector motion and finish combined visual, persistence, accessibility and lifecycle acceptance.
7. Optional later feature, only when requested: key/unlock interaction, window opening and plate access.

No commit, push, publication or deployment was requested. Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1&face=refs&refs=20261022-smooth.
# Spherical iris integration — October 2026

The main cabinet aperture now holds the six curved leaves from the latest twisting
spherical iris specimen. The shared 48×24 leaf mesh keeps the specimen's planar
section, six 60° mounts and sweep/retract/counter-twist transforms. The normal
Refs settings section has a persistent opening slider (0–100%) and Open/Close
button. Constructor persists uniform physical Iris size (.35–1 of the smaller
aperture radius) and the existing Iris door switch. A filled surround
joins the edited elliptical cutout to the circular outer collar at one plane.

The iris collar/frame meets the cabinet's front trim plane; the curved closed
crown projects outward. The fitted surround lies flat at that plane. The
cabinet's full rear outline remains a wood panel at rearY + .003. Its local
iris mound rises smoothly and tangentially from that panel only as far as the
measured leaf sweep requires. Wallpaper remains flat in other compartments at
rearY + .001 and follows the identical mound with continuous X/Z UVs. Its
liner is .002 local units inside the wood. At greater cabinet depth the mound
shrinks, then vanishes. The skin probe includes the whole iris and mound and
deploys the assembly when needed. Cabinet depth remains user controlled from
.04 to .45 and is not automatically reduced to the earlier fit estimate.
The six leaves have a longer fixed curved rear edge (cap 60.4°) and retract
63.5° at full opening. A fixed relieved return keeps the original round 82.2
bore at every opening without intersecting the moving leaves.
The old placeholder module and saved bulge key remain only for archive
compatibility.

Browser review passed at 0/25/50/75/100% opening and .35/1 Iris size. The
wide 330×220 and tall 220×330 edited cutouts kept a continuous surround and
circular iris; size 1 and 100% opening survived a reload. Close iris returned
the opening to 0. Shared contrast at 0/1 changed the iris and surround live.
No console warnings or errors were captured. The reviewer then restored the
284×284 aperture, .8 size and .5 contrast.

Disposable numerical checks used the actual iris module and local Three.js.
At default aperture, .35/.8/1 size and cabinet depths .04/.22/.45, 101 opening
samples per combination found at least .005 local rear clearance. The fixed
return's minimum native norm is 102.064 versus the leaf maximum 101.100;
the fully open leaf triangle's minimum projected radius is 82.561 versus the
82.2 bore. At size .8, mound height above the rear panel is .242/.062/0
for those depths. Wood and wallpaper share the mound profile with .002 local
separation and the same outer hole radius. These are sampled local geometry
checks, supplemented by the final browser review below.

Earlier live review passed: an angled closed view showed the collar flush with
the cabinet front and the crown projecting outward; at 50% opening no frame
cut through the leaves was visible; fully open retained a clear round 82.2
bore. An isolated rear view showed the complete cabinet panel continuing
below the earlier local bulb. The reviewer restored visibility for all six faces,
backings and the cube to their original enabled state.

Final browser review accepted cabinet depth .22, moved the slider to .45,
confirmed .45 persisted after reload, then restored the exact previous value
.0866012347941732. The isolated side view showed a broad, flat-crested mound
tangent to the full rear panel at the old shallow depth, while .22 showed a
thicker cabinet and a visibly shallower mound. The closed oblique view had no
visible wallpaper crescent at the iris rim; fully open retained the round 82.2
front aperture. All six faces, backings and the cube shell were restored to
their original enabled state.

Remaining phases and steps for this bounded correction: none. The separate
Iris size, hole sizing, undo and snapping editor phase is complete below.
No commit, push, publication or deployment was requested.

## Iris sizing and 2D editor acceptance — October 23, 2026

Constructor → Refs starts with Iris geometry: Main opening radius controls the cabinet hole, and Iris door size controls the spherical iris independently. Normal Refs settings point to that section. Deliberate opening, portrait and bay size edits update existing custom planner frames; the displayed opening radius follows the resolved frame. The default aperture remains 284×284 with iris size .8.

Constructor keeps up to 30 local undo steps for completed curio construction edits. A drag is one step, while a canceled drag adds none. Undo and Redo buttons and Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y work within the active Refs Constructor panel; text inputs retain normal editing shortcuts. Restored construction state is saved through the existing archive. Plate artwork and playback are outside this history.

The 2D planner starts with snapping on: dragging uses a 10-unit grid and nearby part centers/edges, including the drawing center. Hold Alt during a drag to bypass snapping, or turn it off with the checkbox. Numeric frame entries stay exact; arrow keys still move one unit, or ten with Shift.

Live browser acceptance confirmed main radius 142→160 changed a custom aperture 284→320 and one Undo restored 284; iris size .8→.5 changed the visible door. Ctrl+Z with Undo focused restored size .6→.8, Ctrl+Shift+Z with Redo focused returned .6, and button Undo returned .8. A snapped drag moved the aperture center (365,459)→(410,490), then one Undo restored it. With snapping off, the same pointer movement produced approximately (407.9,485.4), and Undo restored it. Numeric frame entry 368.3 remained exact and undoable. Alt bypass is implemented in source; the visual browser check covered the snap toggle. Focused syntax, ESLint and diff checks passed. The local preview returned HTTP 200.

Remaining phases and steps for this bounded editor request: none. The separate Refs feature phases listed above remain under their existing handoff. Nothing was committed, pushed, published or deployed. Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1&face=refs.

## Glass display behind the iris — October 24, 2026

The iris now carries a circular display on its native rear mount. An opaque blue backing supports the fixed placeholder “This is text”; a shallow tinted glass surface and rounded polished rim sit in front of it. The display inherits iris position and size, and the leaves occlude it as they close. Its center rises at most 2.93 native units from the mount, within the iris's 3-unit front clearance. The display owns its geometry, materials and one text texture, disposing them before the borrowed iris mount.

Normal Refs settings provide Show glass display, backing color, glass tint, clarity and polish. Constructor → Refs → Iris geometry provides lens curve. These options persist in the existing Refs archive; the lens curve participates in Constructor undo. The display's glow and highlights follow the shared live contrast mapping. The literal text is deliberately fixed for this phase; plate text and other future content are separate work.

Focused source syntax, ESLint and diff checks pass, and the local preview returns HTTP 200. Remaining phases and steps for this glass display phase: live browser visual acceptance and any focused tuning it reveals. Other Refs cabinet and architecture phases remain under their existing handoffs. Nothing was committed, pushed, published or deployed. Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1&face=refs.

## Cabinet rim position and iris display well — October 24, 2026

Constructor now saves a signed **Cabinet position** from −.5 to +.5. Zero puts
the cabinet front on the measured outer rim of the borrowed Refs backing;
negative moves it inward and positive moves it outward. This placement is
calculated from the actual cabinet front and overall scale, so changing
cabinet depth does not move that front at a fixed position. Camera focus,
selector movement and reduced motion do not alter the chosen position. The
earlier automatic focus/tuck behavior and backing-limited depth described
above are historical; this manual setting supersedes them. The backing
clearance profile remains available as advisory data, without clamping the
user's signed placement.

The iris has a fixed opaque dark inner well joined to the relieved 82.2 bore
and an opaque rear seat. The well follows a spherical radius of 102.064 native
units, outside the moving leaf maximum of 101.10, and ends at native Z −62.
The full leaf sweep ends at native Z −55.82, leaving at least 6.18 native units
behind it. The local wood and wallpaper mound includes the well and seat.
`iris.getDisplayMount()` returns a group at native Z −62; its local XY plane
is the future display plane. `iris.getDisplayMetrics()` returns the native and
scaled seat radius, native plane/front-limit Z, face-local plane Y, and leaf
rear Y. The future lens may rise at most three native units from that plane
without entering the sampled leaf sweep; its own geometry and disposal remain
the next phase's responsibility.

Focused actual-module checks covered position −.1/0/+.1 at depths .04/.22/.45
and scales .6/1/1.4: the computed front plane differed from the requested rim
plane by at most 5.6e−17 local units. Across 101 opening samples at iris sizes
.35/.8/1 and those three cabinet depths, the well radius exceeded the leaf
norm by at least .964 native units before triangle interpolation; the well stayed at least .005 local units
ahead of the wood/wallpaper mound, and the rear seat stayed at least .00727
local units behind the leaves. Targeted ESLint passed. Browser review is
pending for visual occlusion, signed control persistence and undo.

Closed-angle QA found a dark tooth-like overlap where the first well ring met
the relieved return. The shared inner circle now lies at native radius 82.2,
Z 60.5 on both meshes. Their 129 edge vertices coincide exactly. Sampling
the actual return triangles against the faceted well found only −5.8e−7
native units of floating-point overlap; sampled well triangles remain at
least .930 native units outside the leaf mesh. The display mount remains at
Z −62 and its updated native radius is 81.075. Browser confirmation of the
closed oblique view and fully open aperture remains pending.

Remaining phase: add the requested blue-backed “This is text” glass display
and lens using the iris mount, then perform integrated browser review of
position, oblique occlusion, display and persistence. No commit, push,
publication or deployment was requested.

## Final cabinet position, iris well and glass review — October 24, 2026

The integrated live browser review passed. Cabinet position −.1 moved the front inward as intended; Undo restored 0. Position +.1 persisted across a reload, after which it was restored to 0 with the existing cabinet depth retained. The repaired inner well and relieved return now meet cleanly: the closed oblique view shows no earlier jagged overlap and no wallpaper or display text leaking through the leaves.

At full opening, the blue-backed circular display shows a legible “This is text” behind a shallow lens with a subtle polished reflection. Backing color, glass tint and clarity changes persisted across a reload, then were restored to the default blue colors, .9 clarity and .8 polish. Lens curvature 1 was undone to .55. Shared contrast at 0 and 1 changed glass highlights live; the review restored .5. The final preview is left open for inspection.

Remaining required phases and steps for this bounded request: none. The older Refs feature backlog in this document remains separate. Nothing was committed, pushed, published or deployed. Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1&face=refs.

## Forward rounded gem with displayed plate text — October 24, 2026

The blue display is now a full, smoothly rolled cylinder gem rather than a
shallow rear disc. Its native body spans Z 19–46, reaches radius about 81 at
its bulging side, and has a broad flatter face. The lens/reflection rises to
at most Z 47.488, leaving 1.012 native units behind the fixed frame plane at
Z 48.5. It remains inside the empty center of the rotating spherical leaves;
the smallest sampled difference between any gem vertex and the inner leaf
radius is 9.612 native units across iris sizes .35/.8/1 and lens curves
0/.55/1. The well, opaque rear seat and cabinet position are unchanged.

Gem text now comes from the saved `.text` of `selector.currentIndex`, the plate
physically on display. The quote stays in place during an exchange and changes
when that index settles. Edits to the currently displayed plate update live;
empty text renders empty. The text texture redraws only when its content
changes. Multiline quotes wrap and fit to a circular, gently italic face.
The existing backing color, glass tint, clarity, polish, lens curve and shared
contrast controls still apply. The earlier “This is text” paragraph above
documents the prior placeholder, which this section supersedes.

Focused module geometry and text-state checks passed for size and curvature
endpoints, including repeated disposal. Targeted ESLint passed. The text layer
was raised after live review exposed depth fighting on a longer short quote:
the actual body front is native Z 27.03698 in gem-local coordinates, text is
at 27.35, and the lens edge is at least 27.38. The outermost reflection still
stops at native Z 47.488, behind the cabinet frame.

Final browser review passed. Editing the physically displayed plate's quote
updated the gem live. During a plate 2 exchange it kept “First plate” until
arrival, then showed “Second plate” in full after the layer correction. A
rapid queued 0→1→0 selection ended with “First plate” and plate 1 physically
current. “The quiet work\nbecomes a story.” wrapped and fit; the angled view
showed a raised broad face and rounded cylinder side. Original empty text on
plates 0 and 1 and selection 0 were restored. Appearance settings and cabinet
position 0 were left unchanged. The requested swirl/dissolve effect was
discussed as a possible later animation and deliberately not implemented.

Remaining required phases and steps for this request: none. The older Refs
backlog elsewhere in this document remains separate. No commit, push,
publication or deployment was requested.

## Seven small-pocket cupboard doors — October 25, 2026

The Refs face now owns closures for the two tall bays, two crescents, two lower arches and bottom plaque. Tall bays use a curved, open-back rotating cabinet with a floral front and a 180-degree vertical turn. The narrow side crescents start open and swing outward on mirrored outer hinges. Lower arches start closed; `leftArch` is reserved as the phase 3 butterfly host. The plaque starts closed and folds outward from its bottom hinge. The portrait and center iris are outside this controller. The door leaves use the cabinet's material maps and finish settings without owning its cached textures; the floral front borrows the already loaded rear wallpaper texture. Shared contrast changes copy the cabinet material response and tint the paper with the backing's mapping.

Normal Refs settings select, open/close and set angle/speed for a door, with seven keyboard-accessible quick buttons. Constructor → Refs selects the same door and sets type, hinge, axis and direction. Configuration persists in the existing `about.refs.sketch` archive; older archives gain the new default door states. A tap on a visible 3D leaf or its open portal toggles that door and captures the archive once. Right/middle pointer controls remain with the cube.

`board.doors` owns the runtime geometry. `board.getDoorState(id)`, `getDoorStates()`, `subscribeDoors(listener)`, `getDoorOptions(id)`, `updateDoor(id, patch)`, `setDoorOpen(id, bool)`, `toggleDoor(id)` and `getPortal(id)` are the public integration surface. A portal supplies its face-local frame, exact contour, front/rear Y planes, stable `interiorRoot` and the moving door root. Subscribe events include opening progress. Interior roots remain mounted across open/close changes; phase 2 may attach ornaments there and phase 3 may observe `leftArch` transitions.

Focused source ESLint and diff checks passed. An actual Three.js sweep sampled 291,564 finite door vertices across both rotating bays, 0–180 degrees, depths .04/.22/.45 and default plus edited tall/wide bay frames. The sweep found no rear wallpaper penetration or bay-surround X overrun. The shallow-depth cam moves the rotating section outward through its own aperture at mid-turn; cabinet depth and position preferences are untouched. The local preview returned HTTP 200. Live browser review of the doors, pointer drag threshold, occlusion, finishes and archive reload remains for the coordinating chat.

Remaining phases and steps: (1) coordinator review and live visual/input acceptance of these seven doors, with focused fixes if needed; (2) add the tiny shelves and figurines to the two open crescent compartments; (3) source and implement the faithful butterfly behind `leftArch`, using the stable interior root and door-progress events; (4) integrated Refs QA of all doors, interiors, butterfly, settings, persistence, contrast and lifecycle. The earlier original-picture picker QA, further appearance and extreme-boolean checks, final integration and key/window access checks remain future work in their existing handoff. The iris and glass gem are already implemented. No commit, push, publication or deployment was requested.

## Crescent cupboard interiors — October 25, 2026

Both outer crescent portals now contain three fitted shelves with tiny vases,
figurines and books. The shelf widths and object silhouettes are clipped to
the actual opening contour at their heights. Their depth follows the cabinet
depth, including the .04 minimum, with a front recess placement that keeps
them readable while doors open. Contents attach to the stable portal interior
roots, so opening a door does not move them. Shelf finish borrows the cabinet
side material's shared maps through a disposable wrapper; ornaments own their
geometry and materials. Shared contrast adjusts their subtle highlights live.
Layout/depth changes rebuild only the interior geometry; material changes do
not. Hidden cabinet/front or cutaway states hide the interior groups.

Source ESLint and focused geometry checks cover default and edited crescent
outlines at .04, .22 and .45 depths. The coordinating chat owns live visual
review and any focused fixes.

Remaining phases and steps: (1) coordinator live visual/input acceptance of
doors and crescent contents, with focused fixes; (2) source and implement the
faithful butterfly behind `leftArch` and connect it to door progress; (3)
integrated Refs QA of all doors, contents, butterfly, settings, persistence,
contrast and lifecycle. The earlier original-picture picker QA, further
appearance and extreme-boolean checks, final integration and key/window access
checks remain future work in their existing handoff. No commit, push,
publication or deployment was requested.

## Door-triggered butterfly — October 25, 2026

The selected cupboard door now hosts one butterfly. Its default is the closed
left lower arch. Normal Refs settings enable or disable the butterfly, choose
the host door, show its state, and reset it for another flight. Enable and host
are captured in the existing Refs archive; the in-progress flight is transient.
Once the door reaches 55% open, the butterfly moves clear of the aperture,
turns toward the viewer, flaps about three times, and flies past the borrowed
camera's upper outside edge. Closing before launch returns it behind the door;
closing fully after escape rearms it. Reduced motion skips the flight and hides
the visitor. Suspend pauses it. The GLB is loaded once and its skinned scene,
textures, materials, geometry, skeletons and mixer state are released on face
disposal. Flight geometry is excluded from the cabinet clearance estimate.

Focused source lint and diff checks passed. Remaining phases and steps:
(1) coordinator live visual/input acceptance of the butterfly, including
open/close, rapid reopen, host selection, reduced motion, off-screen escape,
despawn and archive reload; (2) integrated Refs QA of doors, crescent contents,
butterfly, settings, persistence, contrast and lifecycle, with focused fixes.
The earlier original-picture picker QA, further appearance and extreme-boolean
checks, final integration and key/window access checks remain future work in
their existing handoff. No commit, push, publication or deployment was requested.

The first live view showed the wing plane almost edge-on and the .052-wide
exported rig difficult to read. The runtime now fits the actual GLB wing span
to .08 face units (about 55% of the default lower arch width), pitching it
40° toward the viewer while it emerges. The source wing depth then contributes
about .035 face units of visible vertical silhouette instead of nearly zero.
After leaving the opening it grows gently to 1.35× by the off-screen edge.
A focused mock-loader state check passed loading, early close, turn, flight,
despawn, rearm, reduced motion, suspend, host change and late disposal.
Live visual acceptance of the adjusted pose remains with the coordinator.

## Cabinet doors and butterfly acceptance — October 25, 2026

The coordinating live review passed direct tall-bay opening/closing, the
bottom-hinged plaque, side-crescent closure over the ornaments, reopening,
settings-driven opening, saved open state after reload, and rejection of a
left drag as a door tap. Constructor selection exposes the expected bottom
hinge and allows it to be changed and restored. Live review caught missing
material shader invalidation when a previously untextured leaf acquired wood;
the owned door and shelf wrappers now invalidate on map changes while retaining
the cabinet's ownership of those textures.

The adjusted butterfly is visible turning and fluttering in the open lower-left
arch, then crosses the upper-left view and despawns. Captures are under
`output/refs-doors/live/visible-*.jpg`: 01–04 show its changing wing pose, 05
shows it in flight above/left of the cabinet, and 06 onward show its absence.
The GLB check in `output/refs-doors/butterfly-asset.json` covers all four baked
wing tracks, seamless endpoints, finite data, normalized skin weights, and the
unchanged original source. Targeted ESLint and diff checks pass. Lifecycle
edge cases were exercised with the focused mock loader; these are separate
from the live visual evidence.

The user's existing layout tab must remain open and must not be refreshed or
reset while its layout backup is unresolved. Verification moved to a separate
temporary `qa=cupboard-doors` tab. About Page chat was explicitly asked by the
user to own the site-wide settings interaction repair: preserve/export that
layout, suppress browser context menus, make Constructor sections collapsible,
use right-click headings for "Toggle all", middle-click section bodies for
scoped import/export, and middle-click headings/tabs for full settings download.

Remaining phases and steps: About Page owns layout backup, shared gesture
changes, Constructor section integration, and cross-page verification. There
are no further required implementation phases for this bounded Refs doors,
contents and butterfly request. Later work remains door decoration, the older
original-picture picker QA, further appearance and extreme-boolean checks,
broader final integration, and optional key/window access. No commit, push,
publication or deployment was requested.

## Physical face operation controls — October 29, 2026

Refs now has a curved right-side iris rail with a draggable thumb and click-to-position track. Raised left/right chevrons flank the portrait and cycle the requested plate with wrapping. Tiny unnumbered pilot lights follow the portrait's lower elliptical arc and select their corresponding requested plate. The light count follows `plateCount` from 1 through 32; all lights share one normal Refs Settings color. The selected bulb has a bright glass lens and halo while the others remain very dim in the same hue. Selection indicates `plateIndex` immediately, while gem text continues to follow the actual displayed plate.

The controls are face-local under the existing placement, so manual layout, roll, cabinet depth and travel remain inherited. Input uses the full physical cube for occlusion and excludes back-side rays. Slider movement clamps at its two ends, uses the existing iris option, and captures the Settings archive on pointer release. A full clearance probe runs at release instead of on every slider step. Capture, blur, cancel, suspend and detach end the gesture. All new geometry, textures and materials are disposed by the Refs face.

Targeted ESLint and Git whitespace checks pass. Remaining steps for this bounded change: coordinator live visual and pointer acceptance in a fresh Refs preview tab, including 1/7/32 lights, front/back occlusion, slider endpoints, arrow wrap, and contrast/color/archive reload. Earlier original-picture picker, appearance and extreme-geometry checks, broader integration, and optional key/window access remain in their existing backlog. Nothing was committed, pushed, published or deployed.

### Final operation-control acceptance

Live review passed both arrow wraps (1→7 and 7→1), clicking the middle light
to select plate 4, closing the iris at the lower rail endpoint, dragging to
50%, and dragging to full opening. The plate 4 selection, blue pilot color
`#56a8ff`, and 50% iris setting all survived a reload of the separate QA tab.
Shared contrast 0 and 1 changed the selected bulb halo and metal highlights
live. The review restored green `#43ed73`, plate 1, opening 100%, and contrast
.5. The original layout tab was not refreshed or reset.

The focused fixture `tmp/refs-cabinet-review/face-operations-check.mjs` passed
1/7/32 bulbs, wide elliptical frames, finite symmetric positions, front-ray
hits, rear-ray rejection, endpoint/midpoint arc mapping, unchanged geometry
on appearance edits, and disposal on rebuild/detach. These module checks do
not claim a continuous collision audit of arbitrary user-edited layouts.
Targeted ESLint and whitespace checks pass. Final live evidence is
`output/refs-face-operations/live-final.jpg`.

Remaining required phases and steps for these physical controls: none.
Existing separate follow-ups are confirming recovery of the older screenshot
layout, cabinet/door decoration, original-picture picker QA, further appearance
and extreme-geometry/boolean checks, broader integration, and optional
key/window access. The shared menu gestures and Constructor folding were
completed by About Cube; the earlier paragraphs are historical handoffs.
No commit, push, publication or deployment occurred.

### Resumed checkpoint review — October 29, 2026

The coordinator confirmed that the refinement and iris-state plumbing were
already saved before the interruption. The stopped agent's outstanding file
reservation was released after confirming its errored status. Targeted ESLint,
whitespace checks, and the existing focused fixture were rerun successfully:
lower-arc endpoint/midpoint mapping, equal frame-band spacing, full button-cap
picking, front/rear rays, 1/7/32 lights, appearance reuse, iris-size rebuild,
and resource disposal. The local review server returns HTTP 200.

Live acceptance could not resume: the browser tool reports that local browser
use is disabled in Work settings. No user tab was refreshed or reset. Required
remaining step: inspect the new button housings and lower centered slider in
a fresh preview, exercise both buttons and the lower rail, and fix any issue
that review reveals. This visual/pointer gate remains open; source checks are
not a substitute for it. Separate backlogs listed above remain unchanged.
No commit, push, publication or deployment occurred.

## Larger polished quote stone — October 29, 2026

The quote face now uses a broad smooth stone with a 78-unit front and 76-unit
text disk, replacing the small 64/58-unit face and extra colored trim. The
2048-pixel quote canvas fits upright semibold type to circular line widths:
the middle lines use the wider chords, with room reserved for each line's
glyph height. Quotes remain complete rather than being truncated. The body
and shallow lens use one saved stone color, with polish on the rounded
shoulder and a restrained edge reflection. The General Settings control is
now Stone color; the former tint field remains archive-compatible. Text
continues to follow the plate physically on display.

The default iris size is now 1, filling its compartment. An unversioned
archive using the previous exact .8 default migrates once to 1 under
`quoteDisplayVersion: 2`. Custom sizes and versioned .8 choices are preserved.
The fitted surround and fixed outer collar borrow the cabinet face finish
and matching face-local UVs; the relieved inner return remains an opaque
recess. Iris leaves, their movement, plate content and layout coordinates
retain their existing behavior. Borrowed cabinet textures are not disposed
by the iris.

The interrupted worker's manual normal averaging used the wrong lathe vertex
order and produced a specular streak. The coordinator removed that step and
retained Three.js's analytic lathe normals. A GPT-6 Sol worker at low effort
reviewed the geometry and offline renders; the coordinator owns the final
source integration. Disposable review evidence is in
`output/refs-stone-review/`. These Blender views reconstruct the actual module
geometry and canvas textures with approximate lighting; they are not browser
screenshots or proof of live appearance.

Verification: focused source lint, whitespace checks, and the existing
button/slider fixture pass. Offline text-fit checks cover 250 and 2,000
characters, explicit newlines, and a 2,000-character unbroken word, without
dropping text or exceeding each line's circular chord. Native geometry fits
inside the fixed 82.2 bore and spherical leaf envelope and remains behind the
48.5 collar plane. These native clearances are unchanged by uniform iris
scale. Temporary normalizer checks confirm the one-time migration, custom
sizes, versioned .8, and a JSON roundtrip retaining plate picture/text; those
checks extracted the normalizer with unrelated imports stubbed. The final
offline render no longer has the radial streak. The necessary inner return
is darkened to read as an inset rather than a decorative gray frame.

Remaining phases and steps: inspect the stone and longer quotes in a fresh live Refs tab and
check iris motion, saved colors, and the previous button/slider refinements.
Browser automation currently reports local browser use disabled in Work
settings, so that live acceptance remains open. Existing separate follow-ups
are confirming the older screenshot layout backup, cabinet/door decoration,
original-picture picker QA, extreme geometry/boolean checks, broader final
integration, and optional key/window access. No commit, push, publication or
deployment was requested.

## Paused Refs control refinement — October 29, 2026

The portrait chevrons now sit on raised round buttons with a bezel, dark dome and full-disc hit area. The iris slider follows the lower half of the opening from left to right. Its rail is centered between the outer aperture ellipse and the spherical iris's relieved return radius from the live iris state; iris size edits rebuild that geometry. Existing plate lights, shared color, selection, contrast and input persistence remain unchanged.

Focused module checks pass for lower-arc endpoints and midpoint, frame-band spacing, button-cap clicks, front/rear rays, 1/7/32 lights, appearance updates without rebuild, iris-size rebuild and disposal. Targeted ESLint passes. Work is safely paused here. Remaining required step: coordinator live visual and pointer acceptance in a fresh preview tab after the user resumes, with any fixes that review reveals. The existing screenshot-layout recovery, cabinet decoration, original-picture picker, extreme-geometry, broader integration and optional key/window checks remain separate backlog. Nothing was committed, pushed, published or deployed.

## Original reference quotes and hidden key illustration — October 29, 2026

Plates 1–3 now carry the original References-section text and attributions in
source order: Jinny Jeon (Manager of Foreign Language Department), Ashley Kim
(Head Teacher), and Matt Stone (Native English Teacher). The wording was
verified against `about.html` in commit `4857de0`, lines 127–142, also present
in `4f8761c^`. Only incidental spaces before closing quote marks were removed.
The curated content is retained in `reference-quotes.js`.

`originalQuotesVersion: 1` assigns these texts once when earlier saved Refs
settings are restored, preserving images, source IDs, colors, picture scales,
layout and plates 4 onward. At least three plate slots are made available for
the requested assignment. Fresh defaults also contain the quotes. Later edits
or blank text survive normalization and saved-settings roundtrips. The
existing archive restore captures the normalized result, including its marker.

The actual three quotes, including attribution, are the crystal readability
examples. Offline canvas review caught and fixed ordinary words splitting at
narrow top chords; the fitter now retries its size/line count before splitting
only genuinely oversized unbroken strings. Full text and circular bounds pass
for all three originals (242/176/181 characters), alongside 2,000-character
text, line breaks and an unbroken string. Temporary evidence is
`output/refs-stone-review/original-quote-1.png` through `original-quote-3.png`.
The source normalizer was checked directly with only the unused GLTF loader
import stubbed; photos/colors/crop/source IDs, other plates, fresh defaults,
and later edits all survive. Focused ESLint and whitespace checks pass.

The lower plaque key illustration is disabled with
`PLAQUE_KEY_CLUE_ENABLED = false` in `doors.js`. Its geometry helper, shared
stroke source and mounting code remain for future use. The portrait lock and
cupboard door behavior are unaffected.

Remaining phases and steps: live visual/input/persistence review of the
original quotes, iris, buttons/slider, and hidden key in a fresh Refs tab
(browser access remains disabled); older screenshot-layout backup confirmation;
cabinet/door decoration; original-picture picker QA; extreme geometry/boolean
checks; broader final integration; optional key/window access. No commit,
push, publication or deployment was requested.

## Quote stone vertical centering — October 29, 2026

The quote fitter now centers the occupied glyph bounds measured with the same
center alignment and middle baseline used for drawing. It checks every shifted
line against the circular text area before accepting a size and updates the
reported chord width for the final positions. This also centers quote-only
edits that have no attribution; saved plate text and appearance are untouched.

Native Canvas checks passed the three original quotes with and without
attribution, short and uneven phrases, explicit line breaks, 2,000 characters,
and a 2,000-character unbroken word. Each layout retained its text, kept glyphs
inside the circle, and had a visible top/bottom midpoint at the canvas center.
Disposable 480-pixel previews are in `tmp/refs-stone-review/vertical-center/`.

The coordinator reviewed the source and all three quote-only previews: the
visible text has balanced top/bottom space and no clipped or missing words.
The local review server returns HTTP 200. Live browser acceptance is still
unavailable because local browser use is disabled in Work settings.

Remaining phases and steps: live visual/input/persistence review of the quotes, iris, buttons,
slider, and hidden key in a fresh Refs tab when browser access is available;
older screenshot-layout backup confirmation; cabinet/door decoration;
original-picture picker QA; extreme geometry/boolean checks; broader final
integration; optional key/window access. No commit, push, publication or
deployment was requested.

## About name and distance-readable crystal — October 30, 2026

The former Refs face now displays About in normal Settings, Constructor,
face/backing switches, focus buttons, the 2D editor, Page summary, shortcuts
and site directory. The chat is now About Face. Fish retains its visible name
and internal `about` ID; this face retains internal `refs`, archive owner
`about.refs.sketch`, module paths, URL face parameter and saved layout/content.
No geometry, images, quotes or authored face transforms were migrated.

The quote uses upright semibold Segoe UI with Arial/sans-serif fallback,
tighter leading and a wider circular reading field. Every row follows its
circle chord, measured with an explicit alphabetic baseline, then the actual
ink block is centered and checked again. Whole words and full text are
retained; oversized unbroken strings retain their fallback. Short quotes
can use larger type. A final paragraph beginning with an em dash is treated
as attribution at 82% of the quote font size, giving priority to the quote
without changing the stored text. Each line's measured font size is reused
when drawing it. The fitter only runs when quote text changes.

A GPT-6 Sol worker at medium effort implemented the typography; the
coordinator reviewed the source, reran focused ESLint, and verified About/Fish
labels live in normal Settings, Constructor/editor and Page summary. Native
Canvas checks cover all three originals with and without attribution, custom
text, line breaks, 2,000 characters and an unbroken 2,000-character word,
checking complete text, circular bounds, centering and repeated-call stability.
At a 220-pixel reading diameter, the longest attributed original fits at about
15px rather than the prior 11px; the others fit at about 17px. These are Canvas
fit figures, not a universal legibility guarantee for every viewport/font.
Disposable evidence is under `tmp/refs-stone-review/readability/`.

Live browser access is available again. Review is in a separate fresh tab,
preserving the user's original tab. The coordinator matched the supplied
1894×960 view and approximately 210–220px crystal diameter and inspected all
three original quotes live. The selector's physical right button selected
plate 3 correctly. Plate 1 was restored through normal Settings and confirmed
physically displayed before finishing. The Settings drawer is closed and the
temporary viewport override reset. The original user tab was not refreshed.
Live evidence is `output/about-crystal-readability/plate-1-final.jpg`,
`plate-2.jpg`, and `plate-3.jpg`. Browser access verified the local preview;
the terminal HTTP probe was unavailable because local socket access was denied.

Remaining phases and steps for this bounded naming/readability request: none.
Existing separate follow-ups remain older layout backup confirmation,
cabinet/door decoration, original-picture picker QA, extreme geometry/boolean
checks, broader integration and optional key/window access. Earlier iris,
contrast/archive and broader controls acceptance should be treated separately
from these quote views; this pass does not claim to repeat all older checks.
No commit, push, publication or deployment was performed.

## Authored defaults from the supplied export — October 30, 2026

`site-settings(7).json` is a whole-site archive (`scope.kind: site`) with 14
owners. Only `about.refs.sketch`, the current About face, was adopted as
script defaults. `exported-defaults.js` is the frozen, face-only source of
startup/reset values; the full-site archive, unrelated preferences, other
faces and sticky notes were not copied into source or imported into storage.

The preset includes the supplied mahogany materials, trim/stain/grain/sheen,
hidden construction guides/anchors/opening guide, iris open at 100%, plate 5
selected, exact seven plate texts and metadata, and exact seven door states.
Plate text punctuation was preserved as supplied. Missing plate data uses
authored defaults, while explicit saved blank/custom text, photos, source IDs,
crops, colors and door edits remain authoritative. Fresh normalization no
longer seeds the older original-reference text over this authored content.
No valid existing saved settings are forced to the new defaults; the existing
Reset sketch defaults action uses the new preset.

A GPT-6 Sol worker at low effort implemented the preset and normalizer changes.
Coordinator review removed the superseded inline defaults so there is one
source of truth, froze the nested preset, and reran the focused checks.
`REFS_DEFAULT_OPTIONS`, `normalizeRefsOptions({})`, and normalized supplied
About data match the exported owner exactly. Custom/blank/photo metadata and
door changes survive normalization roundtrips; focused ESLint passes.

Remaining phases and steps: finish the newly requested shared transfer-scope
change and verify section, page, face, Cube and General boundaries. The
source-default task is complete. Separate existing follow-ups remain older
layout backup confirmation, cabinet/door decoration, original-picture picker
QA, extreme geometry/boolean checks, broader integration and optional
key/window access. No commit, push, publication or deployment was performed.
