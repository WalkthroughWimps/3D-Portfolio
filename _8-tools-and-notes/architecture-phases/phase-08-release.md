# Phase 8 release reference and architecture reconciliation

October 6, 2026. **Release gate: INCOMPLETE.** This document reconciles the Phase 3 design and migration plan against actual Phase 4-7 sources plus Phase 8 tooling. It does not rewrite the completed design history or promote planned APIs to implementation evidence.

## Actual module map

| Owner | Implemented responsibility | Remaining boundary |
| --- | --- | --- |
| `core/preferences.js`, `core/settings-schema.js`, `core/settings.js` | Guarded persistence, validated per-field schema, migration, snapshots/subscriptions/reset/retry | Complete browser failure/conflict/Save/Reset matrix |
| `core/consent.js` and `audio-consent.js` facade | Separate cookie/key choice, accessible shared prompt, subscriptions/disposal | All output paths, cookies blocked, revocation/device gates |
| `core/asset-policy.js`, `core/assets.js`, `assets-config.js` facade | Page/site/CDN mapping and overrides | Dynamic callers, complete CDN/subpath/worker integration |
| `core/lifecycle.js`, `bootstrap.js`, `header.js` | Scope and thin page hooks, initial navigation enhancement | Thin hooks are not full page lifetime ownership |
| `media/transport.js`, `media/controller.js` | Shared borrowed-media actions/state and seek ownership | Complete page adapters/media/browser lifetime gates |
| `media/controls-view.js`, `controls-input.js` | Canvas controls, hit testing, preview/input disposal | Videos/Games page-owned disposal and full control parity |
| `scene/screen-surface.js`, `scene/demand-render-loop.js` | Reusable texture/raycast surfaces; Graphics demand rendering | All remaining resource owners and offscreen/performance gates |
| `storage/soundfont-store.js`, `soundfont-budget.js`, `soundfont-management-view.js` | Optional raw-package store infrastructure | Browser store gate; actual catalog/UI/loader integration absent |
| `_0-start/start/*` and `start-page.js` | Partial settings/accessibility/calibration/camera/scene cleanup | Full Start controller, flow and resource gate incomplete |
| `_2-videos/videos.js`, tablet/adapters; `_4-games/games.js`, layout/bridge/adapters | Existing orchestration, generated-game/reel integration | Planned sessions/preview/game scene-camera modules not implemented |
| `_5-music/instruments/catalog.js`, `loader.js`, `ui/video-controls-lifetime.js` | Catalog/raw helper extraction and bounded shared UI cleanup | Backend/audio graph/live-note/mixer/MIDI/scene/input/panel ownership remains in v2 entry |
| `_5-music/music-2d.js`, `music-transcription.js` | Existing separate recorder/transcription route | Full real note/record/playback/transcription regression |
| `debug/debug-loader.js`, `music-diagnostics.js`, panel modules | Guarded/gated diagnostic hooks and bounded disposal | Remaining logs/globals and ownership |
| `tools/prepare-site-html.mjs`, two manifests, `sw-asset-config.js` | Marked HTML/import-map/worker generation | Three candidate acceptance and worker production evidence |
| Phase 8 tools, artifact policy and CI | Local packaging, strict failure reporting, no-injection previews, regression evidence | Full acceptance/clean Git reproduction/remotely executed CI |

Shared paths in the first eight rows are under `_7-shared-scripts/`. Existing facades remain active. `prepareForRecording`, independent preparation memory ledger/leases and saved-byte playback integration remain **unimplemented**. Planned filenames in Phase 3 are not shipped APIs.

## Runtime and tooling versions

| Component | Source-observed version/policy |
| --- | --- |
| Node/npm | Locally validated Node 24.19.0, npm 11.17.0; lockfile install; vendor requires Node >=22/npm >=11 |
| Three.js + addons | All seven main import maps pin `https://unpkg.com/three@0.159.0/`; manifest says candidate-under-review. Final supported-device adoption is not established |
| Draco | Music/Docs decoder URL under Three 0.159.0 `examples/jsm/libs/draco/`; follows that release, not an independently measured compatibility pass |
| js-synthesizer | Vendored package.json 1.11.0; runtime local dist scripts; FluidSynth externals named 2.4.6, including libsndfile alternative; retain companions/license |
| soundfont-player | Existing CDN pin 0.8.1 with current fallback ordering |
| KUTE | Existing CDN 2.2.4; SVG plugin response remains a network investigation candidate |
| WebAudioFont | Remote `surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js` has no immutable pin; local preferred fallback path is absent. Backend support is unverified |
| Swup/npm runtime ranges | Lockfile controls installation; source loading/support require separate tracing. Caret ranges do not prove deployed identity |
| Playwright | New exact dev dependency `@playwright/test` 1.63.0. Local tests use installed Windows Chrome 154.0.8037.98; CI installs matching Chromium |

The legacy Start alternative retains Three 0.153.0. No runtime dependency upgrade was made. Complete Meshopt/decoder/backend/version, appearance and device gates remain open; this inventory is not a final compatibility endorsement.

## Settings, consent and storage

`createSettingsStore`/`getSharedSettings` expose `get`, `patch`, `reset`, `refresh`, `subscribe`, `retry`, `discardPending`, `dispose`. Canonical per-field keys win over valid raw legacy sources. Zero/false are valid. Absent volume is 0.25, mute false, sync -270 ms; sync snaps to 5 ms within [-3000,3000]. Scene lighting is nullable: shared fallback 1, Start initialization 0.5; saved zero is retained. Schema defines `music.masterGain`, but existing Music mix keys/state remain owned by its entry pending full migration.

Keys: `site.audio.volume`, `.muted`, `.sync`, `.preservePitch`; legacy `globalAudioMidiOffsetMs` and raw `site.a11y.settings` audio aliases. Accessibility stays in `site.a11y.settings`; `site.settings.schemaVersion` is informational. Start keys, `video-sync-unlimited-drag`, `video.tablet.focus`, Music master/category/autogain and `audioLeadTrimMs` stay unchanged. Reset removes matching canonical/legacy sources for requested fields and preserves other domains/unknown accessibility properties. Failed writes/removes use in-document overlays; retry/discard is explicit. Other tabs reread persisted state; failed overlays are not durable atomic cross-tab writes.

Consent is separate: cookie `site_audio_allowed` (cookie precedence), local key `site.audio.allowed`, event `audioConsentChanged`; blocked choices can be session-only. Volume/mute/saving/preparation never grants permission. Preserve `syncOffsetChanged`, `sceneLightingChanged` and legacy APIs. Scope/consent/store disposal contracts do not establish that every page calls them correctly.

IndexedDB `site-soundfonts` v1 has packages/files/selections/meta. Decimal 250,000,000-byte accounting charges payload plus max(1 MiB,5%). Four-bank manifest IDs are placeholders. Definitive drums is oversize; full-ArrayBuffer hash staging and browser transactions/quota/eviction are unproven. Provisional 128 MiB preparation RAM remains independent unimplemented integration. No user preferences, consent or saved selections changed in Phase 8's disposable tests.

## Artifact and hosting

`tools/release-artifact.json` is the explicit site allowlist. `check:artifact` records `output/phase-08/artifact-plan.json`; `build:artifact` creates a new `output/phase-08/artifact/site/` plus `artifact-built.json` with SHA-256/bytes. The builder refuses existing output. Case collisions, missing required files, symlinks and unhydrated LFS pointers fail packaging. Final generation v3 was relocated to that canonical path after explicit cleanup of superseded generated copies. It contains 1,041 files / 1,360,297,403 bytes; all 1,041 recorded hashes were independently rechecked after relocation.

Include checked HTML/import maps, classic worker/config, runtime manifests, shared/page/debug code, JSON metadata, GLBs, icons/fonts/local runtime media, generated games, synth dist/externals/wasm companions, attribution and license/notice files. Public legacy alternatives are retained because nonuse is unproven. Exclude developer tools/tests/fixtures, hidden files, vendor src/build/tools/types, lock/build configuration, notes/evidence, source art/projects, local utilities and temporary Music fixtures. Source originals are preserved; artifact exclusion is not deletion or a licensing decision. Inventory external media/generated-game rights before release; an included license alone does not establish rights for every asset.

Separate external media inputs: `Renders/`, `Videos/`, `music/`, `midi/`, `soundfonts/`, and CDN `glb/` mapped from local `assets/glb/`. They are not copied wholesale: families include source/alternate files and over 20 GB of media. Six explicit site-relative Videos previews are included for static navigation. Production must supply every other actually referenced key with exact case, readable CORS/CORP/range behavior. The artifact includes local GLBs but does not upload them. Current probes find CDN card-test and Hypersound 404s; the CDN music-videos-hq payload length differs from the candidate's pinned local input. Sampled CORS responses allow `https://matthallportfolio.com`, not the local preview origin; remote assets cannot be presumed usable from arbitrary preview hosts.

Resolver precedence: valid `assetsBase` query (empty disables CDN), then `ASSETS_BASE`, then local empty/production default origin. Normalize HTTP(S) directories; retain query/fragment/case/encoding. `assets/glb/` maps to `glb/`; other hosted families retain case. Nonhosted icons stay on site. Local root/subpath probes do not establish complete hosted subpath behavior: origin-root paths, alternatives and generated games need testing. Custom runtime bases do not reconfigure worker caching.

Worker stays classic, cache `intro-cache-v3`, `importScripts('./sw-asset-config.js')`. It matches exact origin/path, ignores intro query, handles GET. Production uses manifest asset origin; loopback uses registration scope. Activation removes older intro-cache-* only. Cached full responses may be returned to range requests; range/offline media acceptance is required. It is an intro cache, not a complete offline site/synth bank cache.

## Reproduction and cleanup decisions

See `tools/VALIDATION.md`. Git has inherited uncommitted modules/manifests/docs and ignored media; `HEAD` alone cannot reproduce this candidate. Hydrate LFS and provide verified external assets. `tools/required-release-assets.json` pins bytes/digests for the real bank and six video alternatives; `npm run hydrate:assets` validates existing inputs or streams missing files to bounded temporary storage, verifies integrity and copies exclusively. Both relevant CI jobs invoke it. Local seven-input verification passed, but the missing-bank recovery probe exits 1 on HTTP 404; music-videos-hq also needs version/integrity reconciliation. A disposable working-tree snapshot plus fresh `npm ci` supplies install evidence, not a clean committed checkout. CI has strict lint/contracts/browser jobs and no deployment action. Full media/audio/device/store/accessibility gates remain red or pending.

`output/phase-08/references.json` traces 269 literal imports/HTML/CSS references, with zero missing/case mismatches in its limited scope. Recorder/transcription, Start alternative and shared facades have references or unresolved external public use, so all are retained. Videos font URL, KUTE plugin, diagnostic controls and old Music files are investigation candidates, not proven-unused removals. No source/art/vendor/game asset was deleted or archived. Only Phase 8's superseded generated artifact copies and disposable reproduction/worker trees were removed, after resolved-path checks; evidence and rollback backups remain.

## Release summary and rollback

Phase 8 adds CI, a pinned tooling dependency, packaging, no-injection local preview, regression scripts and current docs, and corrects two Start image path cases from assets/SVG to assets/svg. Of 109 protected runtime/config files, only index.html changed; all scene/audio JavaScript, keys/events/public routes and production state are unchanged. Release remains blocked by earlier implementation/device evidence, 642 lint errors, six WebGL failures/Music TDZ, CDN missing/mismatched inputs and store/readiness/lifetime/backend/licensing gates. Read the final Astra/High review with validation/handoff; review completion does not waive failures.

Rollback Phase 8 only: restore `package.json`, `package-lock.json`, `tools/VALIDATION.md`, hosting note from `tmp/phase-08/` after reviewing later edits. `tmp/phase-08/index.before.html` reverses only the two image-case fixes and matches the recorded starting hash. Remove only Phase 8-created tools/config/workflow/README if desired; restore prior Phase 8 instruction Markdown/PDF from matching backup. Retain review/evidence of unfinished gates. Do not reset/clean the dirty tree or clear localStorage, cookies, IndexedDB, saved selections or unrelated caches. Reinstall restored lockfile only in the intended dev environment. No live data/hosting rollback is needed.

For a future authorized deployment, preserve a last-known-good coherent HTML/modules/manifests/worker/dependency artifact and asset inventory. Revert that code coherently, retaining public URLs and old versions needed by saved selections. Worker activation may remove only owned intro caches. Rollback must preserve preferences, consent, IDB selections and unrelated caches; browser-wide clearing is not a rollback technique.
