# Page and feature reference

The portfolio is a multipage site using browser ES modules, Three.js scenes, embedded game exports and local or hosted media. Each page owns its scene; the shared bootstrap supplies common interface and lifecycle services. This map identifies source owners as of October 28, 2026. It is a source reference; browser acceptance of every control remains a separate step.

## Page entry points

| Page | HTML entry | Active main module | Other important owners |
| --- | --- | --- | --- |
| Start | [index.html](../index.html) | [start-page.js](../_0-start/start-page.js) | `_0-start/start/`, camera transitions and native controls |
| About | [about.html](../_1-about/about.html) | [about.js](../_1-about/about.js) | Face registry, individual faces and Notes workspace |
| Videos | [videos.html](../_2-videos/videos.html) | [videos.js](../_2-videos/videos.js) | Tablet focus, shared player, video adapter and captions |
| Graphics | [graphics.html](../_3-graphics/graphics.html) | [graphics.js](../_3-graphics/graphics.js) → [shelf/graphics-preview.mjs](../_3-graphics/shelf/graphics-preview.mjs) | Book, game, tabletop, easel and annotation modules |
| Games | [games.html](../_4-games/games.html) | [games.js](../_4-games/games.js) | Layout, input/audio bridge and embedded `games/` exports |
| Music | [music.html](../_5-music/music.html) | Dynamic import of [music-piano-controls.v2.js](../_5-music/music-piano-controls.v2.js) | Instrument, timing, layout, recorded-volume and UI helpers |
| Docs | [docs.html](../_6-docs/docs.html) | [docs-3d.js](../_6-docs/docs-3d.js) | Document manifest, library editor/schema and desk assets |

The main module is not necessarily the only script loaded by the page. For example, Music also loads `music.js` for supporting page behavior; it is not a duplicate of the active 3D controller. The [2D piano](../_5-music/music-2d.html) is a separate useful route. Older piano controllers and Start's `stupid.html` alternative remain investigation candidates, not approved deletions.

## Shared interface

| Feature | Source owner |
| --- | --- |
| Common startup, accessibility bindings, cleanup and suspension | [core/bootstrap.js](../_7-shared-scripts/core/bootstrap.js), [core/lifecycle.js](../_7-shared-scripts/core/lifecycle.js) |
| Header fragment and navigation links | [header.html](../_7-shared-scripts/header.html) |
| Header layout, legacy modes and presentation state | [core/header.js](../_7-shared-scripts/core/header.js), [template.css](../_7-shared-scripts/template.css) |
| Theme colors | [colors.css](../_7-shared-scripts/colors.css), page styles and scene material owners |
| Page summary and points of interest | [core/page-summary.js](../_7-shared-scripts/core/page-summary.js), with callbacks registered by each page |
| Selected work, resume/contact interface and project overlays | [core/selected-work.js](../_7-shared-scripts/core/selected-work.js), [_0-start/start/project-overlays.js](../_0-start/start/project-overlays.js) |
| Shortcut guides, actions and hints | [core/page-shortcuts.js](../_7-shared-scripts/core/page-shortcuts.js), [keyboard-actions.js](../_7-shared-scripts/core/keyboard-actions.js), [keyboard-hints.js](../_7-shared-scripts/core/keyboard-hints.js) |
| Shared pointer and transform resets | [shared-glb-mouse-controls.js](../_7-shared-scripts/shared-glb-mouse-controls.js); page adapters still own special behavior |
| Space left by Settings and Debug | [core/panel-viewport.js](../_7-shared-scripts/core/panel-viewport.js) |
| Moving and layering UI during focused media | [core/presentation-ui.js](../_7-shared-scripts/core/presentation-ui.js) |
| Site map | [data/site-map.json](../data/site-map.json), [tools/build-site-map.mjs](../tools/build-site-map.mjs), [sitemap.html](../sitemap.html) |

Some HTML regions are generated. Update the source fragment or dependency manifest, not just a generated copy: [prepare-site-html.mjs](../tools/prepare-site-html.mjs) writes marked header/import-map regions and [sw-asset-config.js](../sw-asset-config.js) from [runtime-dependencies.json](../data/runtime-dependencies.json). Generating those files changes several pages and requires coordinating their owners first.

## Settings and saved data

Open the gear for Settings. General contains shared audio, scene appearance, header, focused-media behavior, accessibility, transform resets and point-of-interest navigation. Page and face tabs expose their owners' controls. Constructor is a separate authoring mode in the panel; availability depends on the selected context. Debug has its own left drawer and diagnostics.

| Responsibility | Source |
| --- | --- |
| Drawers, tabs, Constructor host and shared control markup | [debug/panel-shell.js](../debug/panel-shell.js), [panel-shell.css](../debug/panel-shell.css) |
| Shared field definitions, defaults and storage-key compatibility | [core/settings-schema.js](../_7-shared-scripts/core/settings-schema.js) |
| Shared preference state and subscriptions | [core/settings.js](../_7-shared-scripts/core/settings.js) |
| Form bindings and numeric editing | [core/settings-controls.js](../_7-shared-scripts/core/settings-controls.js), [numeric-input.js](../_7-shared-scripts/core/numeric-input.js) |
| Reduced motion and transform easing | [core/motion-preference.js](../_7-shared-scripts/core/motion-preference.js), [transform-easing.js](../_7-shared-scripts/core/transform-easing.js) |
| Focused media and point-of-interest controls | [debug/settings-focused-media.js](../debug/settings-focused-media.js), [settings-poi.js](../debug/settings-poi.js) |
| Section folding and settings transfer | [panel-assembly](../_7-shared-scripts/panel-assembly), [core/settings-portability.js](../_7-shared-scripts/core/settings-portability.js) |
| General Constructor integration | [constructor/general.js](../_7-shared-scripts/constructor/general.js) |
| Debug instrumentation | [debug/debug-ui.js](../debug/debug-ui.js), [performance-stats.js](../debug/performance-stats.js) |

Not every feature stores its private content in the shared settings schema. Drawings, document collections, imported media and soundfont packages have separate owners and formats. Trace the feature's save/export code before changing a key or treating a setting as a project default. Older compatibility modules such as `settings-store.js` must be checked for consumers before consolidation.

Section headings use the common fold contract: left-click toggles one section; right-click toggles its context's sections. Maintainer-only transfer gestures and their dismissal rules are documented in [settings-menu-gestures.md](../_8-tools-and-notes/settings-menu-gestures.md); keep them out of visitor-facing hints.

## Start

The controller, text introduction and setup flow are in [start-page.js](../_0-start/start-page.js). Supporting code under [start](../_0-start/start) owns native controls, remembered views, calibration and project overlays. The four featured projects use the shared work interface and page-specific launchers. Appearance spans [start-page.css](../_0-start/start-page.css), shared colors and the scene's material/light code.

Use the native sound/visual controls or gear to adjust comfort settings. Changes to featured projects can involve both shared Selected work and Start overlays; the matching implementations should continue to launch the same content. Media used for calibration is distinct from featured portfolio video.

## About cube and faces

[about.js](../_1-about/about.js) owns the renderer, camera, cube loading and primary navigation. [faces/index.js](../_1-about/faces/index.js) registers face owners and shares the cube context. Face modules manage their added resources; the host owns shared model resources. Read [coordination rules](../_8-tools-and-notes/about-face-coordination.md) before changing them.

Use Page summary for direct face navigation. Settings has face contexts plus Cube; Constructor adds authoring controls where implemented. The visible label can differ from the compatible internal ID: Fish remains `about`, Cube uses the `faces` settings context, and Oddio uses `odd`.

| Visible feature | Implementation and content owners | What to look for |
| --- | --- | --- |
| Fish | [faces/about/face.js](../_1-about/faces/about/face.js), [fish-face.js](../_1-about/faces/about/fish-face.js), local `assets/` | Face mode, Fish/rings implementation, artwork, motion, audio response and Constructor |
| Refs | [faces/refs/face.js](../_1-about/faces/refs/face.js), [Refs README](../_1-about/faces/refs/README.md) | Cabinet, doors, editor, layouts and local artwork |
| Skills | [faces/skills/face.js](../_1-about/faces/skills/face.js), neighboring BeanBag modules | Skills face controls, beanbag behavior and shared panel assembly |
| Clock | [faces/clock/face.js](../_1-about/faces/clock/face.js), [controls.js](../_1-about/faces/clock/controls.js) | Hands, winding, gear mechanisms, motion and appearance |
| Oddio | [faces/odd/face.js](../_1-about/faces/odd/face.js), [Oddio README](../_1-about/faces/odd/README.md) | Deck/transport, clips, import, audio engine, effects and authoring |
| Notes | [faces/notes/face.js](../_1-about/faces/notes/face.js) → [notes/notes-face.js](../_1-about/notes/notes-face.js) | Drawing workspace, select/draw tools, layers, gear art, history, saves and exports |
| Shared backing and face travel | [faces/backing-controls.js](../_1-about/faces/backing-controls.js), [face-layout.js](../_1-about/faces/face-layout.js), [face-travel.js](../_1-about/faces/face-travel.js) | Shared construction, physical placement and deploy/retract behavior |

Notes' drawing implementation lives outside `faces/notes/` intentionally; the small face module is its integration boundary. Do not merge or move those directories while Notes work or an unsaved drawing is active.

## Videos

[videos.js](../_2-videos/videos.js) owns intro/scene integration and the tablet grid. [tablet-focus.js](../_2-videos/tablet-focus.js) owns its camera focus; [videos-video-adapter.js](../_2-videos/videos-video-adapter.js) connects page transport to the shared controls. [captions](../_2-videos/captions) contains editable subtitle drafts and their instructions.

Settings → Videos includes viewport/focus/sync preferences and thumbnail explainer editing. Media actions live in the player, with its own shortcut guide. To change collections or sources, trace page configuration plus the shared [media catalog](../_7-shared-scripts/media-catalog.js); do not confuse an HQ visual preview with its separately synchronized soundtrack.

## Graphics

[graphics.js](../_3-graphics/graphics.js) mounts [shelf/graphics-preview.mjs](../_3-graphics/shelf/graphics-preview.mjs). The [shelf README](../_3-graphics/shelf/README.md) describes scene construction, book reading, navigation and tabletop interactions.

- Books: shelf book modules, [page-controls.mjs](../_3-graphics/shelf/page-controls.mjs) and grade assets under `shelf/assets/`.
- Game boxes: shelf game modules and [game-view-controls.mjs](../_3-graphics/shelf/game-view-controls.mjs).
- Freeform boards: [tabletop.html](../_3-graphics/shelf/tabletop.html), [tabletop.mjs](../_3-graphics/shelf/tabletop.mjs) and their supporting modules. These are distinct from the arcade games under root `games/`.
- Easel video: [easel-video.mjs](../_3-graphics/shelf/easel-video.mjs).
- Character appearance: [token-settings.mjs](../_3-graphics/shelf/token-settings.mjs).

Use Page summary/item selection for the six books, two board games and easel. Settings → Graphics contains shelf/video navigation and book surfaces; its Games context supplies tabletop character options. Some art is generated from authoring originals; check the relevant exporter and atlas manifest before replacing generated images individually.

## Games

[games.js](../_4-games/games.js) owns the cabinet, game/reel modes and shared-player integration. [games-layout.js](../_4-games/games-layout.js) handles layout; [game-audio-bridge.js](../_4-games/game-audio-bridge.js) bridges sound to embedded games. Root [games](../games) holds separate exported game projects and supporting source packages.

Page summary exposes games and reels. Settings → Games controls page preferences; game-specific controls may belong to the embedded game. A cabinet change and a game-rule change have different owners. Preserve embedded exports as packages and identify their authoring project before editing generated internals.

## Music

[music.html](../_5-music/music.html) dynamically imports [music-piano-controls.v2.js](../_5-music/music-piano-controls.v2.js). The older similarly named controllers are not the current 3D entry. [music-2d.html](../_5-music/music-2d.html) and its recorder remain a separate route.

- Instruments: [instruments/catalog.js](../_5-music/instruments/catalog.js), loader/backend modules in that directory and the contextual More picker.
- Track playback and visualization: active controller plus [music-track-timing.mjs](../_5-music/music-track-timing.mjs), [midi-seek-state.mjs](../_5-music/midi-seek-state.mjs) and [music-recorded-volume.mjs](../_5-music/music-recorded-volume.mjs).
- Screen and icon layout: [music-screen-layout.mjs](../_5-music/music-screen-layout.mjs), [music-track-icon-layout.mjs](../_5-music/music-track-icon-layout.mjs).
- Highlights: [music-highlights.js](../_5-music/music-highlights.js).
- MIDI authoring/import: [music-midi-workflow.md](../_8-tools-and-notes/music-midi-workflow.md), source recipes under `source-files/music-midi/` and import/prepare utilities under `tools/`.

Settings → Music includes master gain, highlights, screen options and track icon distribution. Instrument browsing belongs to More on the piano. Recorded soundtrack files produce the track audio; MIDI drives timing/visual notes and keys. Diagnose the actual media owner before changing gain, seeking or tempo. Browser sample caches and downloaded soundfont packages have different storage from project MIDI/media files.

## Docs

The current implementation is a desk/document library, not the older biography-card description still present in some historical notes. Start with [Docs README](../_6-docs/README.md), [docs-3d.js](../_6-docs/docs-3d.js), [library/editor.js](../_6-docs/library/editor.js) and [library/schema.js](../_6-docs/library/schema.js). [documents.json](../_6-docs/documents.json) is the project collection manifest.

The Docs Constructor edits document titles, descriptions, PDF/image sources, Microsoft presentation links, sizes and desk positions. Browser changes are drafts. Its local **Save to project** and upload paths go through the review server; those actions are different from saving a browser preference. The local feature is under active development, so verify the current UI before relying on an authoring recipe. Uploaded documents/previews belong to the document collection; desk geometry and its layout belong to `_6-docs/assets/`. Hosted presentations remain external links, not a local PowerPoint player.

## Media controls

Shared media is split across [shared-video-controls.js](../_7-shared-scripts/shared-video-controls.js), [media](../_7-shared-scripts/media), [video-player-controls.js](../_7-shared-scripts/video-player-controls.js) and page adapters. The media directory separates control drawing, input, transport and controller behavior. Shared consent/volume/sync code is in [audio-consent.js](../_7-shared-scripts/audio-consent.js), [audio-settings.js](../_7-shared-scripts/audio-settings.js) and [global-sync.js](../_7-shared-scripts/global-sync.js).

A change to controls may affect Start overlays, Videos, Games or Music differently. Check both the UI and its page's action handler. Preserve custom playback-rate sets, separate audio synchronization, paused seeking, permission and exit behavior. Graphics' easel has its own native control owner.

## Sticky notes

[sticky-notes](../_7-shared-scripts/sticky-notes) owns shared data, reading and Constructor integration; [its README](../_7-shared-scripts/sticky-notes/README.md) describes the schema and persistence. Published note content is [assets/annotations/sticky-notes.json](../assets/annotations/sticky-notes.json). Placement belongs to page scene adapters.

Use General Constructor for note content, appearance and bundle import/export. Local drafts and visitor read history are separate from the published bundle. Other page adapters are being added during this inventory; check the current adapter registrations before assuming a page can place notes. Do not move source surfaces or alter stable anchor IDs without checking saved notes and compatibility.

## Assets and originals

Shared assets live under [assets](../assets), while feature-specific assets also live beside their feature. This is legitimate ownership, not automatically duplication. Original editable artwork and MIDI recipes also live under [source-files](../source-files). Large media and soundfonts can be ignored local inputs served from the external asset host; a clean Git checkout alone does not supply every input.

[core/assets.js](../_7-shared-scripts/core/assets.js) and [asset-policy.js](../_7-shared-scripts/core/asset-policy.js) map recognized media families to local or hosted URLs. `assets/glb/` maps to hosted `glb/`; families also include `Videos/`, `Renders/`, `music/`, `midi/`, `soundboards/` and `soundfonts/`. Those prefixes, case and object keys are compatibility contracts.

[tools/release-artifact.json](../tools/release-artifact.json) selects release trees, required inputs and exclusions. [release-artifact.mjs](../tools/release-artifact.mjs) builds a new artifact and inventory. Keep original source, runtime export, generation recipe and attribution together in the feature map even when they occupy separate directories. A proposed move must check imports, HTML/CSS URLs, dynamic paths, saved anchors/content, external object keys, generators and release rules.

## Updating this reference

Update the page table when an HTML entry or dynamic import changes. Update both the Settings path and source owner when a control moves. Describe any migration for persistent IDs or content formats. Historical reports retain their dates; do not replace an old recorded result with a current assumption.

Remaining steps: rendered UI/path acceptance; complete per-feature settings and asset inventory; illustrated editing/save/export recipes; persistence and recovery examples; and a searchable PDF built from the editable reference. Folder migration gates are in [repository organization](repository-organization.md#remaining-phases-and-steps).
