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
