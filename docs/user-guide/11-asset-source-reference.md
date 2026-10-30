# Chapter 11 - Asset and source reference

## How to use this map

Start with the page or feature below. Runtime files are the files a browser consumes; authoring files and generators are the originals or recipes used to produce them. A filename similarity alone does not establish an export relationship. This chapter names confirmed mappings and explicitly leaves uncertain originals unresolved.

All paths are relative to `C:/Dropbox/Resume Website/`. This is a source inspection dated 29 October 2026. The working tree includes other chats' ongoing changes; confirm the active import/URL before replacing anything. No asset moves, exports or cleanup are performed by generating this guide.

For quick code changes, use Chapter 8. For material/layout principles, use Chapter 6. For exact shared preferences, use Chapter 10 and its CSV. A source file being present does not prove it is included in a production package or uploaded to the asset host.

## Shared assets and hosting

`_7-shared-scripts/core/asset-policy.js` declares hosted families: `assets/glb/`, `glb/`, `Videos/`, `Renders/`, `midi/`, `music/`, `soundboards/` and `soundfonts/`. The `assets/glb/` family maps to the hosted `glb/` key. Treat letter case and object keys as contracts when updating the CDN.

`_7-shared-scripts/core/assets.js` implements `resolveAssetsBase`, `resolveAsset` and `createAssets`. Loopback pages normally resolve local assets; public pages normally use the declared asset origin. Query/storage overrides can alter this. Explicit external URLs and data/blob URLs are treated differently from site paths. `_7-shared-scripts/assets-config.js` is a compatibility entry used by page controllers.

`tools/required-release-assets.json` records required externally hosted inputs with byte counts and hashes. `tools/release-artifact.json` controls packaged trees, extensions and data files. Inspect both when replacing a file; do not assume a local copy or a Git commit publishes its asset-host object. Hydration tools fetch configured inputs; release/build tools can write output. Read their CLI and preserve retained evidence directories.

Shared SVG mouse illustrations are in `assets/svg/`, including `mouse_MMB_pan.svg` and `mouse_RMB_rotate.svg`. Their theme swatches and runtime styling are separate from the artwork. Navigation artwork and page colors can also be provided by shared header/styles or the owning page; do not recolor a bitmap when a live theme variable is responsible.

## Start controller and featured work

- Runtime model: `assets/glb/settings-controller.glb`.
- Active consumer: `_0-start/start-page.js`, constant `SETTINGS_CONTROLLER_GLB`.
- Sound/setup examples: `assets/audio/welcome-jingle.wav`, `assets/audio/sync-guide.mp3`, and the counting/alphabet media under `Videos/start-page/`.
- Featured-work launchers: `_0-start/start/project-overlays.js` and `_7-shared-scripts/core/selected-work.js`.

The controller model, setup media and selected-work projects are separate resources. Changing a calibration clip must not silently replace featured work. A featured project's picture/title and its actual launcher must agree. Its embedded assets remain owned by that project's normal page/export.

The authoritative native authoring file for the current settings-controller GLB has not been established by this map. Before editing a similarly named Blender file, compare hierarchy/node names, bounds and known export history. Preserve runtime node/material contracts and keyboard/native alternatives.

## About cube assembly and archived models

- Main runtime assembly: `assets/about-cube/glb/model.glb`.
- Runtime metadata: `assets/panel-assembly/runtime.json`.
- Registry/URL owner: `_1-about/faces/index.js`, `cubeAssets`.
- Current native assembly source: `assets/about-cube/blend/panel-rig-v17-native-review.blend`.
- Source/migration reference: `assets/about-cube/README.md` and its `assets.json` mapping.

The assembly metadata is part of the runtime contract. Keep node names, face mounting conventions, backing/travel references and resource ownership aligned with the GLB. Faces borrow the shared host camera/renderer/model; do not independently dispose the borrowed assembly while replacing a face's own textures.

Older studies are under the literal `assets/about-cube/blend/Old .blend/` and `assets/about-cube/glb/Old .glb/` directories. Historical copies and URL aliases exist for a reason; lack of a direct import is not deletion approval. Current native sources can still depend on linked textures/libraries outside their folder. Reopening a source is the dependency check; moving it alone is not sufficient.

## Fish models and picture artwork

- Runtime fish: `_1-about/faces/about/assets/fish/fish-rig.glb`.
- Mount: the same folder's `fish-mount.glb`; hover assembly: `hover-rings.glb`.
- Consumer: `_1-about/faces/about/fish-face.js`, `FISH_URL`, `MOUNT_URL`, `HOVER_URL`.
- Export scripts in that fish folder: `export-fish.py`, `export-mount.py`, `export-hover.py`.
- Runtime/export metadata includes `manifest.json`, `mount-manifest.json` and `hover-manifest.json`.

The face README explicitly records the fish source as `assets/.blend/Puzzle Box Assets/.BL/Puzzle_Box_Assets/Singing_Fish/Fishing Sing.blend`, and that file is present. The authored hover-ring source is its neighboring `Hover_Rings_Mix_Color.blend`. The mount exporter checks the Fishing Sing basename; the fish exporter takes its source from Blender's open file. These are source-documented mappings, not exports rerun during this guide pass. Confirm the file/version before executing an exporter.

Project/gallery artwork lives under `_1-about/faces/about/assets/artwork/` with an `index.json`; other presentation imagery is under `assets/4-perspectives/` within the face directory. `picture-library.mjs` additionally owns imported browser pictures. The imported library and project artwork catalog are different stores. `tools/about-artwork-catalog.mjs` participates in the local/runtime catalog workflow.

Preserve frame normalization, caption metadata, source aspect and face-local coordinate conventions when changing imagery. A settings-only export need not contain original imported image bytes.

## Clock variants and mechanism data

- Default v9 runtime: `assets/about-cube/glb/spirals-v9.glb`.
- Older active runtimes: `orbit-v8.glb` and `mechanism.glb` in the same folder.
- Native sources: `clock-face-v9-spirals.blend`, `about-cube-clock-v8-orbit.blend`, `about-cube-clock-v7-supported.blend` under `assets/about-cube/blend/`.
- Variant URL/loader owner: `_1-about/faces/clock/face.js`; `?clock=v8` and `?clock=v7` select older variants.
- Companion mechanism inputs: `_1-about/faces/clock/spirals-v9.json`, `orbit-v8.json`, `mechanism.json`.

Keep each model and its matching manifest together. Hand, magnetic-drive, gear and spiral modules consume named geometry/parent references. A valid GLB can still be the wrong mechanism version. Gear appearance also creates procedural material resources in `gear-appearance.js`; those are not necessarily texture images to replace in an assets folder.

## Refs, Skills, Oddio and Notes

Much of these faces' runtime presentation is constructed or adapted in code, so there is no single standalone GLB to replace for every visible control.

- Refs: `_1-about/faces/refs/` owns cabinet/door/selector construction, plate art and original picture persistence. Start at `face.js`, `cabinet.js`, `doors.js`, `plate-art.js`, `picture-source.js` and the local README. A low-resolution preview texture is not its original source image.
- Skills: `_1-about/faces/skills/BeanBagVisuals.mjs` builds reusable visuals. Throw/supply/container/sound have separate neighboring modules. Shared panel geometry and metadata belong to `_7-shared-scripts/panel-assembly/` and the cube assembly contract.
- Oddio: `cloth-rig.js`, panel/add-on modules and `shuttle-controls.js` construct physical presentation. `pod-icons.mjs` and custom panel images are different icon sources. Audio comes from the shared deck/engine and user sessions, not from the decorative GLB surface. Keep source sound/session data, generated textures and saved panel assignments distinct.
- Notes: `_1-about/notes/` owns editable drawings, layers, libraries and exports. Native reference assets such as `assets/about-cube/blend/notes-glass-reference.blend` are authoring inputs; PNG output is not editable drawing data. Preserve layer/anchor structure when updating formats.

The shared site contrast preference affects glows/highlights on cube features. Replacing a material with a fixed emissive value can break live contrast even when its color looks correct in one screenshot.

## Videos tablet, intros and collections

- Tablet runtime: `assets/glb/video-tablet.glb`.
- Consumer: `_2-videos/videos.js`; focus adapter: `tablet-focus.js`.
- Intro visual/audio: `Renders/tablet-animation.webm` and `Renders/tablet_animation_1.opus`.
- Collection media: `Videos/videos-page/` and `_7-shared-scripts/media-catalog.js`.
- Caption draft source: `_2-videos/captions/`.

Low-quality visual previews, full playback files, separate soundtracks and intro assets have different roles. Preserve the pair of clocks and saved sync offsets; do not replace one because its filename resembles another. Inline thumbnails, video controls and their preview caches can have their own owner.

Candidate native files are present at `assets/.blend/Puzzle Box Assets/.BL/Face_Vids/video_tablet.blend` and `video_tablet 2.blend` in the same folder. Their exact relationship to the active web GLB has not been verified. A tablet shape change must preserve the expected screen mesh, camera bounds and input projection. Verify actual decoded frames and audio on the target browser; HTTP 200 does not prove playback.

## Graphics shelf, books and boards

- Page entry: `_3-graphics/graphics.js` mounts `shelf/graphics-preview.mjs`.
- Scene inputs include `source-shelf-assets.json`, `source-board-games.json/.bin`, `source-environment.json/.bin`, and marker/presentation motion files in `_3-graphics/shelf/`.
- Coursebook runtime art/manifests: `_3-graphics/shelf/assets/`; manifests include main, preview, motion, travel-art and grid-art variants.
- Confirmed artwork manifest source: `assets/.blend/graphics-page.blend`.
- Grade-navigation exporter: `_3-graphics/shelf/export-grade-meshes.py`; output: `assets/navigation/grade-meshes.json/.bin` within the shelf folder.
- Board card art includes the `assets/gc-cards/` atlas/face/manifest family inside the shelf.

The production shelf does not load a disposable coursebook-lab output directory. Closed proxies, traveling art, grid art and high-detail reader art are separate tiers. Regenerate the appropriate tier instead of putting the largest image into every slot. A book's ID, source node names, page order and material settings are distinct from its displayed grade label.

Page-turn/layout controls are code-owned even when motion tracks came from Blender. Keep the model/motion/bounds/contact data consistent. Freeform tabletops (`tabletop.html` / `tabletop.mjs`) and Letter tiles have their own sessions and UI; arcade-game exports are separate projects.

## Arcade cabinet and embedded games

- Cabinet runtime: `assets/glb/Arcade-Console.glb`.
- Consumer: `_4-games/games.js`, `GLB_URL`.
- Reel media: `Videos/games-page/`, including the game reel and Christmas visual previews/full video/audio files.
- Actual playable game exports: root `games/` and each game's original authoring/export workflow.

The cabinet's 3D model, menu art, CSS3D screen overlay and embedded games are separate owners. Changing a game title or image does not alter the game's rules. Keep each generated game's entry, data, scripts and audio as a coherent export. Do not move only its HTML file or edit generated data without documenting the upstream authoring change.

The candidate native file `assets/.blend/Puzzle Box Assets/.BL/Face_Games/Arcade_Console.blend` is present; its exact export relationship to the active runtime has not been verified. Check the named screen mesh and transforms before replacement. Cabinet screen input can break if WebGL and CSS3D layers are scaled or offset independently.

## Music piano, soundfonts and songs

- Piano runtime: `assets/glb/toy-piano.glb`.
- Active consumer: `_5-music/music-piano-controls.v2.js` at its loader call.
- Instrument catalog/source routing: `_5-music/instruments/catalog.js` and neighboring loaders/backends.
- Soundfont families referenced by the active controller include `soundfonts/musyngkite/`, `fluidr3_gm/`, `arachno/`, `wappydog/`, plus the configured Hypersound SF2.
- Song records: the controller's `TRACKS`; audio under `music/`, visual timing under `midi/`, optional video/thumbs under `Videos/music-page/`.
- Source preparation: `_8-tools-and-notes/music-midi-workflow.md`, `source-files/music-midi/` and `tools/prepare-music-midi.ps1`.

Candidate native files `assets/.blend/toy-piano.blend` and `assets/.blend/toy-piano-original.blend` are present. This map has not established which produced the current runtime bytes. Preserve key names, screen planes, coordinate spaces and hit testing when replacing the model. The 2D recorder/piano is a separate interface, not proof that a similarly named older 3D controller is active.

Each instrument record's backend, patch, key range, local source/fallbacks and gain envelope travel together. Dog uses a sample route, so changing a soundfont program alone need not alter it. Keep original licenses and attribution when adding packages; do not replace real package fixtures with synthetic ones merely to pass checks.

Recorded song audio supplies the soundtrack; MIDI supplies note/key visualization. Keep source tempo maps, song-specific offsets, track IDs and real audio gain routing intact. Test beginning, middle, end and seeking with sustain, not just first playback.

## Docs desk, cabinet and document originals

- Desk runtime: `_6-docs/assets/desk.glb`.
- Export recipe: `tools/export-docs-desk.py`.
- Confirmed original: `assets/.blend/Puzzle Box Assets/.BL/Hexagon_Site_2.blend`.
- Extracted editable authoring file: `source-files/docs-desk-and-cabinet/Desk and Bendy Cabinet.blend`.
- Export/layout documentation: `_6-docs/assets/README-desk.md`, `desk-layout.json` and the extracted source's README/report.
- Content manifest: `_6-docs/documents.json`; originals/uploads under `_6-docs/documents/`; supplied cover art also lives under the page's assets.

The extracted Blender file includes the desk and neighboring bendy cabinet. It is not the website runtime asset. The exporter reads the original Desk hierarchy without saving its source; web color maps are capped at 1024px and supporting maps at 512px. Correct Mapping Scale/UV handling matters more than merely increasing image dimensions.

Preserve Drawer_TL/TR/BL/BR, their hardware parenting, normalization and docsDrawerOffset metadata. Papers use measured metre-based tabletop placement. A fresh source export that changes scale or names can break drawers and documents despite looking fine in Blender. Desk continuation remains stopped; this mapping is documentation only.

Docs metadata export does not contain every document binary. Hosted Microsoft presentations remain external; uploaded office files retain originals. Back up the manifest and all referenced originals/cover/page-preview files together. Test external permissions signed out.

## Sticky-note bundles and persisted content

Published annotations live in `assets/annotations/sticky-notes.json`. Shared UI/storage/scene attachment code is under `_7-shared-scripts/sticky-notes/`; pages can provide specialized adapters. Local drafts and visitor dismissal/read history are separate stores.

Notes attach through stable surface IDs and triangle/barycentric or supported plane conventions. Changing geometry may require migrating anchors. An unrelated replacement mesh must not silently receive old notes just because an object index was reused. Export the current bundle and preserve model/anchor compatibility before replacing a surface.

## Replace an asset without losing its contracts

1. Identify the active URL, consumer and resolver behavior, then the confirmed original and exporter. Mark unresolved provenance instead of guessing.
2. Preserve source masters. Export a separate candidate and record the model hierarchy, names, bounds, materials/UVs, image dimensions and companion data.
3. Check saved IDs/anchors, input targets, animation clips, visibility/contrast, resource disposal and page-specific camera assumptions.
4. Preview the candidate locally at reader and overview distances, test actual decoding/picking, and perform the feature's content round trip where relevant.
5. Review packaging and required hosted keys separately. Publication requires its own explicit authorization; no guide command publishes the site.

Remaining: confirm unresolved native masters/export recipes; expand per-feature asset manifests/licensing/dependency records; verify target-device performance and all browser content round trips. Folder migration requires the agreed coordination and quiet window. Do not run legacy patch/export utilities or delete uncertain assets as incidental housekeeping.
