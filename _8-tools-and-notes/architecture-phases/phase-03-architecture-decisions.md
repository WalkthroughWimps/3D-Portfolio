# Phase 3 architecture decisions

Revision 1 | October 5, 2026 | Status: Accepted design for Phases 4-8; not implemented

This record implements the design gate in Phase 3 Revision 3. Read it with `phase-03-migration-plan.md` and `phase-03-handoff.md`. Existing source and Phase 2 behavior are the baseline; the examples below describe future interfaces. No runtime file was changed in Phase 3.

## 1. Evidence, scope, and decisions

Phase 2's eight existing tests pass in this working tree. Phase 1 is still incomplete for durable screenshots, a verified narrow viewport, reduced motion, blocked browser storage, audio-device/first-note timings, and cold/warm measurements. Phase 2 additionally leaves live production CDN/offline worker integration unverified. Those are implementation and release gates, not evidence that this design works in a browser.

Two corrections to prior handoffs follow from current source inspection:

- `assets-config.js` already removes leading dots/slashes before checking hosted prefixes. `../soundfonts/...` DOES map to CDN `/soundfonts/...`. Preserve that mapping and test real CORS/content availability; do not describe it as a confirmed resolver defect.
- Three.js is **0.158.0 on Start, 0.159.0 on About/Videos/Graphics/Games/Music, and 0.160.0 on Docs**. Videos also has direct 0.159.0 imports in its modules. Standardization must cover all three versions, not just two.

Decisions: plain browser ES modules; existing public routes and entry filenames retained; a single settings owner with existing storage keys; independent consent; page-neutral media and scene features; explicit lifetimes; an optional deterministic HTML preparation step for initial navigation; a candidate single Three.js 0.159.0 pin subject to visual compatibility checks; optional selected-package persistence using IndexedDB; and a preparation API separate from recording.

No unresolved product decision blocks starting Phase 4. Compatibility and capacity checks below can block individual implementation gates. A failed check must leave the corresponding migration incomplete, retain the prior behavior, and update this record in the next handoff; it cannot silently waive acceptance.

## 2. Ownership and dependency direction

All proposed new paths are under existing directories. Do not create a framework or turn this static multipage site into an SPA.

| Layer / proposed owner | Responsibility | Allowed dependencies |
| --- | --- | --- |
| `_7-shared-scripts/core/preferences.js` | Storage access, failure overlay, persistence status | Browser storage injected at construction |
| `core/settings-schema.js`, `core/settings.js` | Validation, defaults, migration, snapshots/subscriptions | Preferences; pure schema |
| `core/consent.js` | Audio choice, cookie/local compatibility, prompt coordination | Preferences and lifecycle; never volume as permission |
| `core/assets.js`, `core/asset-policy.js` | Pure path policy, configured resolver; usable in worker/window | URL and injected configuration; no page imports |
| `core/lifecycle.js` | Abort/disposer scope, listeners, timers, frames | Browser primitives |
| `core/bootstrap.js`, `core/header.js` | Initialize shared services, apply a11y, enhance initial navigation | Core only; debug loader via explicit opt-in dynamic import |
| `media/transport.js`, `media/controller.js` | Media synchronization, seek freeze, action/state contract | Core and media primitives; no Three.js/DOM drawing |
| `media/controls-view.js`, `media/controls-input.js` | Canvas/DOM drawing and hit regions; translate input into actions | Controller contract, lifecycle, injected rendering adapter |
| `scene/screen-surface.js`, existing mouse controls | Screen texture/overlay/raycaster primitives | Pinned Three.js and core lifecycle/assets |
| `storage/soundfont-store.js` | Selected, versioned raw files and byte accounting | IndexedDB, manifest, assets, lifecycle; no synthesizer |
| `_0-start`, `_2-videos`, `_4-games`, `_5-music` | Page flow, content, scene placement, clocks, adapters | Core and reusable features; inject page callbacks downward |
| `tools/`, `debug/` | Tests, HTML preparation, probes, diagnostics | Tooling may inspect runtime; production does not import tools |

Dependency direction is **page orchestration -> reusable features -> core -> platform**. Scene rendering is an injected peer of media logic. A core import must not initialize a scene, fetch a model, create an AudioContext, show a prompt, or install global listeners. Factories have explicit `init`/`dispose` ownership. Compatibility facades at existing `_7-shared-scripts/*.js` paths delegate inward; they do not import page implementations.

Preserve `js/site-utils.js` attribution APIs, generated game artifacts and `game-audio-bridge.js`, `music-transcription.js`, media catalogs, URLs, model/material values, preview segments, and the inherited video filter/debug work. Incremental extraction may re-export functions temporarily. Do not delete legacy music files until Phase 8 reference tracing (Phase 6 may document verified candidates).

## 3. Settings schema and migration

### 3.1 Logical schema, storage, and validated defaults

Use `schemaVersion: 1` in snapshots, with optional metadata key `site.settings.schemaVersion = '1'`. Keep **existing per-field storage keys authoritative**; do not introduce a second authoritative JSON copy of volume/sync/mute. This supports older open tabs and reversible deployments. The marker is informational and must never suppress validation or migration of an individual missing field.

| Logical field | Canonical persisted key / legacy source | Default and validator | Implementation owner |
| --- | --- | --- | --- |
| `audio.volume` | `site.audio.volume`; then raw `site.a11y.settings.masterVolume` | **0.25**, finite numeric `[0,1]` | Phase 4 |
| `audio.muted` | `site.audio.muted`; then raw a11y `mute` | **false**, exact boolean | Phase 4 |
| `audio.syncMs` | `site.audio.sync`; then `globalAudioMidiOffsetMs`; then raw a11y `audioSyncMs` | **-270**, clamp `[-3000,3000]`, nearest 5 ms using existing `Math.round` rule | Phase 4 |
| `audio.preservePitch` | `site.audio.preservePitch` | false; true/false only | Phase 4 |
| `accessibility.reducedMotion` | own property of `site.a11y.settings` | boolean or unset; unset follows live OS preference | Phase 4 |
| `accessibility.highContrast` | a11y `highContrast` | false, boolean | Phase 4 |
| `accessibility.textScale` | a11y `textScale` | 1, finite `[1,1.25]` | Phase 4 |
| `accessibility.focusOutline` | a11y `focusOutline` | `auto`; enum `auto`, `always` | Phase 4 |
| `scene.lighting` | `site.scene.lighting` | unset or finite `[0,1]`; see visual fallback below | Phase 4 infrastructure / Phase 5 Start |
| `start.animationAllowed` | `site.start.animation.allowed` | null (undecided), true, false | Phase 5 flow; schema in Phase 4 |
| `media.syncDrag` | `video-sync-unlimited-drag` | null, `enabled`, `disabled` | Phase 4 facade; Phase 5 UI |
| `media.tabletFocus` | `video.tablet.focus` | false, boolean | Phase 5 |
| `start.contrast`, `start.brightness`, `start.backgroundContrast` | `site.contrast.value`, `site.start.brightness`, `site.start.background.contrast` | 0.5 each, finite `[0,1]` | Phase 5 |
| `start.look.underlight`, `start.look.speakerPurple` | `site.start.look.underlight`, `site.start.look.speaker-purple` | 0.65 each, finite `[0,3]` | Phase 5 |
| `music.masterGain` | `music.instrument.master` | 0.85, finite `[0.2,3]` | Phase 6 |
| `music.categoryGain[id]` | `music.instrument.category.<id>` | keys 1, electric 0.9, pads 0.85, solo 0.95, fx 0.9; `[0.2,2.5]` | Phase 6 |
| `music.autoGain[id]` | `music.instrument.autogain.<id>` | 1, finite `[0.25,4]`; catalog IDs only | Phase 6 |

The 0.25 volume default resolves Start/a11y versus other pages' 1.0; -270 ms resolves global-sync/site-config versus a11y/control fallbacks of 0. They apply only when no valid saved source exists. Explicit 0 volume, 0 sync, and false remain valid. Positive sync delays audio; retain the existing transport math, snapping, and page slider display ranges. Do not replace the music mix multipliers with master volume.

Lighting currently has a shared fallback of 1 and a Start fallback of 0.5. Store `scene.lighting = null` when unset; `getSceneLightingValue()` retains fallback 1 while Start requests fallback 0.5. Preserve existing initialization ordering and its first written value during the thin compatibility migration. Record the consumer fallback explicitly rather than making all scenes brighter or darker. Consolidating that visual default requires baseline evidence in Phase 5/7.

`ASSETS_BASE` is deployment configuration, not a user playback setting. `site.audio.allowed`/cookie are consent, not schema fields. Preserve `videosPage_tabletPose`, `scene.emissive.exclusions`, `scene.emissive.scales`, `audioLeadTrimMs`, debug/panel keys, and session diagnostic keys under their existing owners until their owning phase inventories and validates them. Do not wipe, globally enumerate into snapshots, or reinterpret these keys. Phase 6 must distinguish local `audioLeadTrimMs` from the global sync offset before moving it.

### 3.2 Deterministic migration and storage failure

1. Read raw storage once per refresh through a guarded adapter, including the raw a11y JSON. Never migrate from `SiteA11y.get()` defaults or `window.siteConfig`; those cannot prove a saved choice.
2. For each field use a valid canonical value, otherwise the first valid fallback in table order, otherwise its default. Ignore missing/empty/whitespace-only strings, malformed JSON, wrong types, NaN/infinity, and unknown enum values. Legacy numeric strings are parsed as whole finite numbers; finite out-of-range numbers clamp. Boolean strings accept only `true` or `false`. Preserve unknown a11y object properties on writes for rollback.
3. Canonical keys beat legacy aggregate values even if the aggregate appears newer; historical values have no reliable timestamps. If canonical sync is invalid but legacy global offset is valid, use the legacy offset. Example: volume `'0'` beats a11y `0.8`; sync `'0'` beats legacy `-270`; corrupt volume plus a11y `0.6` yields `0.6`.
4. Write only validated migrated values to absent/invalid canonical keys and metadata when possible. Do not materialize OS-derived reduced motion into an explicit saved preference. Do not remove legacy keys or user data. `site.a11y.settings` writes merge owned properties and keep audio aliases synchronized when that aggregate is used by compatibility facades. Ordinary snapshots/getters do not write.
5. New API `patch` validates all supplied fields before applying any; reject unknown fields/types with a structured validation error and keep the previous snapshot. Explicit `reset(fields)` removes canonical AND matching legacy sources for those fields, so old aliases cannot resurrect a reset value. It never resets consent, assets, other domains, or saved packages.
6. Failed read/write/remove never breaks controls. Maintain a per-key in-memory overlay, including removal tombstones; expose persistence status (`persistent`, `session`, `partial`) to the settings UI. Successful fields can be persisted while other writes fail; localStorage has no multi-key transaction. Report those fields, do not claim atomic durability. Keep overlay values authoritative in that tab and offer explicit retry; don't silently flush stale unsaved edits on focus.
7. Migration is idempotent on every load and retry. Unsupported future schema metadata must not cause deletion or downgrade; read compatible known per-key values, preserve unknown keys, and report the version. Rollback remains possible because no prior keys are destroyed.

### 3.3 Subscriptions, cross-tab semantics, and legacy events

Expose immutable snapshots and `subscribe(listener, {signal, immediate}) -> unsubscribe`. A local accepted patch produces one notification with changed logical fields, source `local`, and persistence status, even if storage failed. Rejected/no-op patches produce none. Consumers never mutate a returned object.

Install one `storage` listener during shared initialization. For relevant keys or `key === null`, reread current persisted values rather than trusting stale event payloads, revalidate/migrate in memory, and notify once with source `other-tab`. Do not write back in response to an event, preventing loops. Unsaved local overlays win for their keys; expose a conflict until retry or explicit discard. Simultaneous successful persisted writes are last-storage-write-wins per key; a multi-key patch is not an atomic cross-tab transaction. Aggregate a11y updates reread/merge before writing, with same-field concurrency still last-writer-wins. Reconcile on `pageshow`/focus for suspended tabs. If storage is wholly blocked there is no durable cross-tab guarantee; retain per-tab functionality.

Bridge existing `syncOffsetChanged` (`offsetMs`, `previousMs`, optional `source`) and `sceneLightingChanged` (`value`) once from store notifications. Keep `audioConsentChanged` exclusively in consent. Keep `window.getSyncOffsetMs`, `window.setSyncOffsetMs`, `window.SiteA11y`, and read-compatible `window.siteConfig` facades until all consumers are migrated. Do not let facades feed their own events back into the store or treat `autoplayApproved` as consent.

```js
/** @typedef {{volume:number, muted:boolean, syncMs:number,
 * preservePitch:boolean}} AudioSettings */
/** @typedef {{schemaVersion:1, audio:AudioSettings,
 * accessibility:Object, scene:Object, start:Object, media:Object,
 * persistence:'persistent'|'session'|'partial'}} SettingsSnapshot */
/** @typedef {{changed:string[], source:'local'|'other-tab'|'system'|'migration',
 * failedKeys:string[]}} SettingsChange */
/** @typedef {{get:()=>SettingsSnapshot,
 * patch:(values:Object)=>{ok:boolean, snapshot:SettingsSnapshot, errors:Object[]},
 * reset:(fields:string[])=>Object,
 * subscribe:(fn:(s:SettingsSnapshot,c:SettingsChange)=>void,
 * options?:{signal?:AbortSignal,immediate?:boolean})=>(()=>void),
 * dispose:()=>void}} SettingsStore */
// Phase 4 usage example; no runtime implementation in this phase.
const stop = settings.subscribe((s) => transport.setVolume(s.audio.volume),
  { signal: scope.signal, immediate: true });
settings.patch({ audio: { syncMs: -270 } });
stop(); // Safe more than once; scope also unsubscribes on dispose.
```

## 4. Audio consent is independent

Retain `site_audio_allowed` cookie (`Path=/`, `SameSite=Lax`, default 365-day duration), `site.audio.allowed`, and `audioConsentChanged` with `{allowed}`. Persisted valid cookie wins over valid local value, preserving current precedence and `shouldPrompt = no valid cookie`. A local-only historical grant remains the legacy effective value while its confirmation prompt is pending; it is not converted into a durable cookie without a choice. No volume, mute, animation preference, save-package request, `siteConfig` flag, or recording preparation operation grants audio permission.

For a current-session explicit choice, update memory first so a blocked cookie/storage cannot make the dialog reopen repeatedly in the same document. Cookie/local writes are best effort and their failures are reported. On reload, if neither survived, prompt again. A denial immediately gates output on every media/synth path; effective mute is `savedMute || !audioAllowed`. Granting permission does not erase saved mute. Browser audio-unlock still requires the appropriate gesture and is separate from consent.

Keep the existing public consent functions through a facade. New owner provides `get`, `setAllowed`, `subscribe`, `prompt({signal,...existingElementIds})`, and `dispose`. Allow only one pending dialog; share its promise. Abort/dispose removes listeners, restores focus, closes an owned dialog, and settles the promise as cancelled without fabricating a grant or denial. Keep existing Start animation-then-audio sequencing and local-review behavior isolated to its explicit existing review mode. Test keyboard focus containment/return and no duplicate prompts.

Cross-tab storage changes trigger a reread of cookie/local precedence; `focus`/`pageshow` catches cookie-only updates. A same-origin BroadcastChannel may signal invalidation where supported, but conveys no authority itself and is not required for correctness. Re-read stores, emit only an effective choice change, and dispose any channel. Total persistence failure guarantees only the current document's choice.

## 5. Media, rendering, and lifetimes

Keep `createMediaController(options)` and existing adapters initially. Extend additively with `subscribe`, `refresh` (active media changed), and `dispose`. State retains title, playing, muted, volume, currentTime, duration, playbackRate, preservePitch, syncMs, syncRangeMs, fullscreen, tabletView, canPlay/canSeek, and controls flags. Add status/error for asynchronous play failure. Treat duration 0/nonfinite as unseekable; derive effective mute through consent. Existing `previewVideo` is a compatibility-only borrowed reference; new views obtain preview media through their adapter.

Actions remain `play`, `pause`, `togglePlay`, `seekToRatio`, `setVolume`, `toggleMute`, `cyclePlaybackRate`, `setRate`, `togglePitch`, `setSyncMs`, `toggleTablet`, `toggleFullscreen`, and `exit`. Preserve the rate cycle `[0.5,0.75,1,1.25,1.5,2]`. Validate direct rate changes as finite positive values within the page's supported range. Capabilities combine available media, page mode, and installed callbacks; disabling a control also rejects its action, including keyboard actions. Games outside video mode cannot dispatch media play/seek. An unavailable action is a documented no-op, not an implicit fallback.

**Seek invariant from Phase 2:** with positive finite duration, normalize `Math.max(0, Math.min(1, Number(ratio) || 0))`; an installed function `seek(ratio, video, audio)` exclusively owns the action, called exactly once. Pass its return through, including `undefined`; do not run default on a falsey return, thrown error, or rejected promise. Only an absent function calls `seekMediaWithFreeze(video, duration * ratio, {audio, syncMs})`. Preserve Home/End bounds, redraw, audio alignment, rate/pitch, and freeze-frame semantics. Handle/report failures without performing a second seek.

```js
/** @typedef {{type:'seekToRatio',ratio:number}|
 * {type:'setVolume',volume:number}|{type:'setRate',rate:number}|
 * {type:'setSyncMs',value:number}|
 * {type:'play'|'pause'|'togglePlay'|'toggleMute'|'cyclePlaybackRate'|
 * 'togglePitch'|'toggleTablet'|'toggleFullscreen'|'exit'}} MediaAction */
/** @typedef {{x:number,y:number,width:number,height:number}} ViewRect */
/** @typedef {{getViewportRect:()=>ViewRect|null,
 * toSurfacePoint:(clientX:number,clientY:number)=>{x:number,y:number}|null,
 * getPreviewMedia:()=>HTMLVideoElement|null,
 * invalidate:()=>void, dispose:()=>void}} RenderAdapter */
/** @typedef {{getState:()=>Object, dispatch:(action:MediaAction)=>unknown,
 * subscribe:(fn:Function,options?:{signal?:AbortSignal})=>(()=>void),
 * refresh:()=>void, dispose:()=>void}} MediaController */
const controller = createMediaController({
  getActiveVideo: () => active.video,
  getActiveAudio: () => active.audio,
  getSyncMs: () => settings.get().audio.syncMs,
  seek(ratio, video, audio) { pageSeek(ratio, video, audio); } // undefined handled
});
// Adapter maps client CSS pixels to logical canvas coordinates; view owns DPR.
const controls = createControlsView({ controller, adapter, scope });
```

Extract the four imports in `video-player-controls.js` from `_2-videos/videos-tablet.js`: `applyScreenCanvasTexture`, `createTabletRaycaster`, `createScreenOverlay`, `createScreenOverlayPlane` into `scene/screen-surface.js`, including only required generic private helpers. Inject page geometry/configuration; leave `applyBlenderAlignment`, model naming/layout, camera pose, tablet focus, and page content in Videos. `videos-tablet.js` can re-export the moved functions for compatibility. Shared video code imports the shared scene owner; the transport/controller imports no rendering module. Preserve existing adapter aliases such as Games `getScreenRect`/`isActive` until Phase 5 migrations finish.

### Lifetime contract

`createScope()` yields `signal`, `defer(disposer)`, tracked `listen`, `timeout`, `interval`, `frame`, and idempotent async `dispose()`. Register cleanup immediately after allocation. Dispose in reverse allocation order after aborting new work; report cleanup errors and continue other disposers. Late model/decode results check generation/signal and release their own allocations rather than touching a disposed page.

| Resource | Owner and cleanup obligation |
| --- | --- |
| Window/document/media/pointer listeners, observers, subscriptions, dialogs | Installing scope removes/disconnects; release pointer lock/capture; no module-top-level installs |
| requestAnimationFrame, requestVideoFrameCallback, intervals, seek/freeze timers | Scheduling scope cancels; a page has one render scheduler; inactive pages stop visual work without disrupting owned active audio |
| HTML media and object URLs | Creator pauses/detaches owned media and revokes owned URLs; controller only unbinds borrowed media; do not destroy borrowed previews |
| AudioContext, nodes, sources, sustain/notes, MIDI queue | Music audio session owns context; controller borrows it. Cancel scheduled work, send note-off/all-notes-off as appropriate, stop sources, disconnect nodes, release buffers; close only owned contexts |
| Three geometry/material/texture, render targets, PMREM, controls/decoder workers | Allocator or reference-counted resource registry disposes once on final release; renderer owner disposes renderer, not a borrower; detach scene objects |
| Saved raw files versus decoded banks | Persistent store outlives page scopes; decoded bank leases belong to music session/preparation; page disposal never erases saved user selections |

`pagehide` with back-forward cache persistence suspends page scheduling; `pageshow` resumes once and reconciles settings. Nonpersisted navigation or explicit teardown disposes. Repeated mount/dispose/mount must not accumulate listeners, frames, audio graphs, or GPU allocations. Do not add Swup navigation just because the package exists.

## 6. Bootstrap, header delivery, and dependencies

`bootstrapPage({pageId, root, mount}) -> Promise<{dispose,suspend,resume}>` initializes configuration/settings/consent services, applies a11y before mounting, enhances existing navigation, optionally loads diagnostics through `debug/debug-loader.js`, then calls `mount({settings,consent,assets,scope})`. Coalesce concurrent calls per root/page ID; on failure clean partial allocations and keep HTML navigation/fallback usable. Retrying after failure/disposal creates a new scope. Page mounting failures do not remove the header. Core service initialization does not itself prompt for audio or start media.

Keep public routes `/`, `/_1-about/about.html`, `/_2-videos/videos.html`, `/_3-graphics/graphics.html`, `/_4-games/games.html`, `/_5-music/music.html`, `/_6-docs/docs.html` and existing alternative routes. Entry scripts become thin orchestrators in their owning phases. Phase 4 only adds thin bootstrapping hooks to those entries; it does not extract page scenes/music.

**Choose a small HTML preparation tool, not a JS bundler.** Phase 4 adds `tools/prepare-site-html.mjs` with write/check modes. It uses `_7-shared-scripts/header.html` and a versioned dependency manifest (proposed `data/runtime-dependencies.json`) as sources and updates marked header/import-map regions in the existing tracked HTML. Generated HTML is checked in so direct file serving and current static deployment need no build service. Initial markup carries working links and accessible names; enhancement marks the current route and installs optional interactions without a header fetch. Start retains its existing unique landing navigation/layout; generate its dependency region and preserve its entry experience. Do not inject a second header into Start.

Benefits: navigation survives JavaScript/fetch failure, dependency URLs match, and drift is testable. Costs: contributors run the preparation command after fragment/manifest edits, review generated HTML diffs, and CI runs check mode. Do not overwrite outside markers, change public filenames, hash assets, transpile, add a framework, require server includes, or make deployment depend on a new runtime. Phase 7 improves the remaining labels/landmarks/fallback content; initial shared header delivery moves to Phase 4 and must not be repeated in Phase 7.

**Dependency policy:** aim for exact Three.js **0.159.0**, the majority existing version, from a single `https://unpkg.com/three@0.159.0/` base. Use `three` and `three/addons/` import-map names everywhere, including Videos, with Draco/Meshopt artifacts from that same release. This is a candidate consolidation, not a claim of compatibility. Validate Start 0.158 -> 0.159 and Docs 0.160 -> 0.159 separately, then the shared render-helper extraction; keep those changes reviewable and reversible. If Docs requires 0.160, evaluate 0.160 for every route as a documented amended decision; do not leave two Three instances in a shared page graph or silently upgrade to current latest.

Capture GLB appearance, material color/lighting, tone mapping/output color space, camera framing, controls, canvas/video textures, CSS3D game placement, Draco/Meshopt decoding, Docs RoomEnvironment/PMREM, and lack of duplicate Three constructors. No appearance retuning solely to suppress warnings. The [Three.js migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide) is the upstream reference; source import inventory is not a compatibility pass.

Keep current exact GSAP/KUTE/soundfont-player CDN versions during extraction. Inventory local WebAudioFont/js-synthesizer file versions, wasm companions, licenses, and lockfile-resolved packages in Phase 4/6; do not infer deployed versions from npm caret ranges. Retain existing fallback loading order until proved equivalent. Phase 8 documents supported versions, reproducible install, and deployment contents. A library upgrade is a separate reviewed change.

## 7. Asset and service-worker contract

New pure resolver: `resolveAsset(input, {pageUrl, siteBaseUrl, assetsBase}) -> string`. `siteBaseUrl` is the deployment root URL with trailing slash, derived from the shared module location, not the current page directory; root production remains unchanged. `pageUrl` is supplied by the caller (normally `document.baseURI`), never inferred from the resolver's module directory. Return a browser-usable absolute URL. The `assetUrl(path)` facade retains local pass-through strings and existing return shapes during migration; resolved network targets must match the table. New code uses the explicit resolver.

Configuration precedence: valid `assetsBase` query parameter (including explicit empty string to disable CDN), then valid local `ASSETS_BASE` (including empty), then local-dev empty or production `https://assets.matthallportfolio.com`. Invalid overrides report diagnostics and fall through. Accept absolute HTTP(S) base or origin-relative base directory; normalize exactly one trailing slash for joining and reject query/hash/credentials in a base. Local dev includes localhost, 127.0.0.1, and IPv6 loopback. Never persist a query override implicitly.

Resolve relative paths against `pageUrl` BEFORE hosted classification. For paths within `siteBaseUrl`, strip that site prefix to get the asset key. Hosted families are `assets/glb/`, `glb/`, `Videos/`, `Renders/`, `midi/`, `music/`, `soundboards/`, `soundfonts/` (classification case-insensitive for compatibility; preserve path case in output). Only `assets/glb/` maps to CDN `glb/`; other keys retain their spelling. Never globally strip `assets/` or lowercase filenames. Nonhosted assets stay on the site. Explicit absolute HTTP(S), protocol-relative, blob/data/about/mailto inputs pass through; do not rewrite an already absolute site/CDN URL. Preserve query and fragment, normalize ordinary spaces once, and never double-encode `%20`.

| Input / context | Local network target | Production target with default CDN |
| --- | --- | --- |
| `../assets/glb/card-test.glb` from Graphics | `/assets/glb/card-test.glb` | `https://assets.matthallportfolio.com/glb/card-test.glb` |
| `../assets/glb/toy-piano.glb?v20251115a` from Music | `/assets/glb/toy-piano.glb?v20251115a` | `https://assets.matthallportfolio.com/glb/toy-piano.glb?v20251115a` |
| `/Renders/tablet-animation.webm` | `/Renders/tablet-animation.webm` | `https://assets.matthallportfolio.com/Renders/tablet-animation.webm` |
| `../soundfonts/arachno/Arachno%20SoundFont%20-%20Version%201.0.sf2?v=1` from Music | `/soundfonts/arachno/Arachno%20SoundFont%20-%20Version%201.0.sf2?v=1` | Same key/query under CDN `/soundfonts/` |
| `../soundfonts/salamander drums/` from Music | `/soundfonts/salamander%20drums/` | CDN `/soundfonts/salamander%20drums/` |
| `../assets/video-playback-icons/volume_high.svg` | `/assets/video-playback-icons/volume_high.svg` | Same site path, no CDN rewrite |
| `https://elsewhere.example/a.glb?q=1#x` | Unchanged | Unchanged |
| `../assets/glb/card-test.glb` at `/portfolio/_3-graphics/graphics.html`, site base `/portfolio/` | `/portfolio/assets/glb/card-test.glb` | CDN `/glb/card-test.glb` |

Root-relative `/assets/...` always means origin root even under `/portfolio/`; callers wanting a site-relative resource use a site-root helper, not ambiguous leading slashes. Bare `Videos/...` historically means an asset key for the facade on CDN, but resolves page-relatively locally; inventory and convert those callers to explicit `assets.fromKey('Videos/...')` before retiring the facade. `fromKey` joins local `siteBaseUrl` or mapped CDN base without page ambiguity. Subpath deployment is not proven today: Phase 4 checks assets/header/worker, Phase 8 checks all HTML/import/CSS/game links before claiming full support.

**Worker:** use pure `core/asset-policy.js` data/functions shared with a classic-worker-compatible generated configuration; keep the classic registration type unless separately tested. The HTML preparation tool can generate a classic `sw-asset-config.js` from the manifest/policy, without duplicating hand-maintained path rules. `sw.js` consumes it via `importScripts`; test both generated output drift and harness loading. Default root install still uses `intro-cache-v3` until cache contents/config require a version bump. Cache cleanup removes only obsolete `intro-cache-*`; never soundfont or unrelated caches.

Intro matching compares BOTH `new URL(request.url).origin` and `.pathname` with the configured expected URL. Ignore request query for this one intro resource, preserve path case, accept GET only. Local expected origin is the site origin plus site-base `/Renders/tablet-animation.webm`; production expected origin is `https://assets.matthallportfolio.com` plus `/Renders/tablet-animation.webm`. An unrelated host with the same path must not match; CDN `/glb/...` must not match. Keep Phase 2 cache-hit offline behavior and `Response.error()` on an uncached network failure. Prefetch only the configured intro.

Runtime `assetsBase` overrides do not silently reconfigure a shared service worker across tabs. With a nondefault override, assets still load directly; no worker cache guarantee is advertised for that alternate base. Deployment manifests configure the default worker origin/site base consistently. Keep custom-base cache behavior an explicit documented limitation. Live CDN CORS/opaque response, playback/range requests, first install, upgrade, offline hit/miss and cache cleanup require browser evidence in Phase 4/8; harness tests alone cannot prove media playback offline.

## 8. Optional soundfont persistence and preparation

### 8.1 Disk store

Choose **IndexedDB** database `site-soundfonts`, schema version 1, with `packages`, `files`, `selections`, and `meta` object stores. Store raw Blob/ArrayBuffer payloads; localStorage only holds a small optional budget preference. IndexedDB enables related manifest/file/selection changes in one transaction and byte accounting, without needing a service worker to intercept arbitrary script loads. The existing intro Cache API is independent. Browser-managed storage may be evicted; treat it as recoverable. [Storage estimates are approximate](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate), and [Cache storage needs explicit lifecycle management](https://developer.mozilla.org/en-US/docs/Web/API/Cache); neither is an unlimited offline guarantee.

User flow: choose instruments -> see unique required packages/download size -> **Save in this browser**. Ordinary play/prepare uses network or existing saved data but does not create persistent selections. No preload/save of all 128 packages. Shared SF2 selections reference one package ID/version; selecting multiple presets never duplicates bank bytes. Show selected instruments, shared-bank membership, saved/partial/missing/stale status, bytes used, budget, and Remove/Remove all saved instruments. Removing a preset deletes a bank only when no selections refer to it; removing a whole bank explains that all its dependent selections lose saved availability. Preserve attribution/license metadata and never promise network-free playback if code/wasm/model dependencies are not cached.

Proposed manifest `data/soundfont-packages.json` records stable package ID, immutable version/content digest, relative asset keys, expected sizes, required file set, format/backend compatibility, and instrument-to-package references. One package can have multiple files. A package is available only after all required files verify and commit. Key payloads by package ID/version/file digest, independent of URL query, so version identity is intentional rather than accidental cache-busting. Accept only catalog-listed sources. Use explicit versioned selections; offer update and retain the old usable version until replacement commits. Account for both versions during an update; when insufficient capacity, ask the user to remove the old version before downloading, explaining the temporary loss of offline availability.

Fetch outside the IDB transaction, verify CORS-readable successful full responses and expected lengths/digests, then commit package/file/reference metadata atomically. Never store opaque/partial error payloads as ready. Serialize reservations across tabs in short IDB transactions with expiring reservation records; do not keep transactions open during network/decode. Recheck budget at commit. Large files require bounded staging and a peak-memory check; manifest completeness, abandoned reservations, quota failure, cancellation, and crash recovery must leave no false ready state. Remove only this feature's orphan/staging records. Content at stable public URLs is not renamed; manifest versions control reuse.

**250 MB means 250,000,000 bytes, proposed and still to validate.** Budget accounting charges payload bytes plus a conservative `max(1 MiB, 5% of payload bytes)` per unique package as metadata/storage headroom. Browser quota is separate and authoritative; use available estimated headroom with another conservative reserve and handle actual quota exceptions. Arachno (155,405,818 bytes) fits the proposed application cap alone. Definitive drums (256,317,998 bytes) does not even fit before overhead; it must be declined with a clear required-space message, not partially saved or silently treated as 250 MiB. Offer explicit increase (e.g. 350 MB, if quota permits) or removal of other selections. Never evict another explicitly saved selection automatically to make room. Browser eviction marks selected packages missing and offers re-save; playing can fall back to network. Request persistent storage only as an explicit optional user action, and show whether it was granted.

`list`, `saveSelections`, `removeSelections`, `removePackage`, `usage`, `readFile`, `subscribe`, and `dispose` form the service API. Errors carry codes such as `unsupported`, `quota`, `budget`, `network`, `integrity`, `cancelled`, `missing`; ordinary playback continues when optional saving fails. Phase 4 implements the service, manifest fixtures, and a small reusable management view; Phase 6 wires the music catalog, loaders, and visible UI. Phase 4 must NOT reroute synthesizer loading or add recording behavior.

### 8.2 RAM and prepare-for-recording

Disk bytes are not decoded RAM bytes. Decoded PCM cost uses sample frames * channels * bytes/sample; SF2/WASM needs explicit backend accounting including raw staging, synth heap and copies. Introduce an independent session memory ledger/lease policy in Phase 6. Use a provisional **128 MiB background-preparation budget**, configurable and measured on target devices; it is not evidence every bank fits or a new cap that breaks the existing one-active-instrument path. Unknown backend memory cost makes preparation unavailable until measured; do not report ready optimistically. Retain the existing playback path with clear preparation failure if the proposed background budget is insufficient. Evict only unleased decoded entries; never steal an active note or prepared-take lease. Saving/removing disk data does not automatically decode/stop/unload an active instrument.

```js
/** @typedef {{instrumentId:string, packageId:string, version:string}} Selection */
/** @typedef {{ready:boolean, reason?:'consent'|'unlock'|'memory'|'unsupported'|
 * 'load-failed'|'cancelled', selection:Selection[], decodedBytes:number,
 * estimatedBackendBytes:number, release:()=>void,
 * subscribe:(listener:(state:{ready:boolean,reason?:string})=>void)=>(()=>void)}} PreparedSession */
/** @typedef {{prepareForRecording:(request:{selection:Selection[],
 * signal?:AbortSignal,onProgress?:(p:{stage:string,done:number,total:number})=>void,
 * memoryBudgetBytes?:number})=>Promise<PreparedSession>}} InstrumentPreparer */
const prepared = await instruments.prepareForRecording({ selection, signal });
if (!prepared.ready) showPreparationReason(prepared.reason);
// A future recorder may use the lease only after ready; no recorder is added here.
prepared.release();
```

Preparation loads saved verified bytes or fetches missing files, initializes the selected backend, decodes required samples, selects SF2 programs/banks, and warms only the requested instruments. Coalesce identical loads and reject stale results after a selection/context-generation change. Do not start audible notes, microphone capture, a transport, a take, or save anything as part of preparation. Consent/unlock must already permit readiness; return an actionable `consent`/`unlock` result otherwise. Prepared readiness requires all requested instruments ready at the documented sample rate/context generation with leases held; partial load is not ready. A backend that supports only one loaded bank must return `unsupported` for an incompatible multibank set instead of claiming all are prepared. Release is idempotent and frees leases, allowing memory eviction. Audio context loss, package/version change, or consent revocation invalidates readiness and notifies its owner. No AudioWorklet rewrite without profiling.

## 9. Acceptance obligations and rollback

| Gate | Required evidence / phase |
| --- | --- |
| Settings | Phase 4 tests conflict precedence, zero/false, invalid/corrupt/partial state, idempotency, failed reads/writes/removes, reset, retry, two tabs, clear/focus reconciliation, one notification, separate consent; browser reload and direct entry |
| Media | Retain Phase 2 custom seek and Home/End tests; Phase 4/5 invalid duration, callbacks returning undefined/false, thrown/rejected seek, mode capabilities, consent, detached audio sync, preview, rate/pitch, teardown and repeated initialization |
| Assets/worker | Table-driven local/CDN/subpath/query/encoded-space/override cases; Phase 2 regressions; Phase 4 live origin/path/CORS/offline/range checks; Phase 8 clean hosted artifact |
| Bootstrap/dependencies | Initial links without JS/header fetch, repeated mount/dispose and failure cleanup; all seven direct entries; dependency graph has no page imports from shared; three-version GLB/material/control comparison before pin adoption |
| Soundfont disk | Phase 4 multitab reservations, shared bank dedup/reference deletion, version replacement, eviction, blocked IDB, quota, cancellation, complete files, 250 MB oversize refusal, accounting; Phase 6 actual loader/UI integration |
| Music readiness | Phase 6 first note, sustain/release/overlap, rapid switching, MIDI clock/sync, existing recording/transcription regression, memory leases/cancel/unsupported banks; Phase 7 comparable cold/disk/memory timing |
| Presentation/release | Recover Phase 1 durable desktop/verified 390px captures, reduced-motion/keyboard/focus/fallback/storage tests before related migrations; Phase 7 full presentation gate; Phase 8 full release gate |

Use existing `npm test`, `npm run lint`, `npm run review`, and `tools/VALIDATION.md`. Historical lint is 682 errors; report deltas and do not disguise it as a clean pass. Browser evidence records browser/version/device, effective viewport, asset origin, cache state, consent, settings, screenshot location, console/network failures, action/result, and timings where relevant. Unavailable audio/production/browser evidence stays open and prevents a claimed pass for its dependent gate. Establish music timing tolerances from reproducible baseline measurements before extraction; no invented performance threshold.

Rollback implementation one bounded step at a time: preserve pre-step working-tree copies/diffs; keep old entry exports/wrappers and existing keys; revert dependency pin separately; keep generated HTML and its fragment/manifest/tool synchronized; delete only feature-owned soundfont data on explicit user removal. Reverting code must not erase saved selections or consent. Preserve Phase 2 fixes through every rollback. Never use broad reset/clean in this inherited dirty checkout.

Phase 3 rollback is documentation only: restore the five future instruction Markdown/PDF pairs from `tmp/phase-03/before/`, remove the three new Phase 3 decision/migration/handoff documents, and leave runtime/tooling/preexisting phase history intact. That scratch backup is not a committed recovery guarantee; preserve it or review the phase diff before cleanup.

The [storage event documentation](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event) confirms that other same-origin documents receive storage notifications, not the originating document. This supports the separate same-tab subscription and cross-tab invalidation design above. External references were consulted October 5, 2026; product policy choices in this record are project decisions, not browser guarantees.
