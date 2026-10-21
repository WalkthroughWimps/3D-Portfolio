# Phase 2 handoff - Fix isolated correctness defects

**Status: COMPLETE for the Phase 2 acceptance gate.** Five confirmed defects were fixed and have passing focused regression checks: games Home/End, service-worker intro matching, custom seek fallback, and the graphics and music model URLs. No deployment or Phase 3 implementation occurred. Phase 1's durable browser, accessibility, and timing evidence gaps remain open and are prerequisites for later validation; they did not prevent the isolated fixes.

**Model/effort:** The phase requested GPT-6.1 Sol / Medium. The active session did not expose a verifiable model identifier or effort setting, so actual model/effort cannot be asserted.

**Working-tree reference:** Starting and ending `HEAD` are `add5dd6eae8c81c40d0052371bcd8a387f7c0385`; no commit was created. At start, tracked dirty files were `.gitignore`, `_0-start/start-page.css`, `_0-start/start-page.js`, `_1-about/about.html`, `_1-about/about.js`, `_6-docs/docs-3d.js`, `_7-shared-scripts/shared-video-controls.js`, `_7-shared-scripts/video-player-controls.js`, `eslint.config.mjs`, `package.json`, and `tools/review-server.mjs`. Untracked paths were `_7-shared-scripts/video-filter.js`, `_8-tools-and-notes/architecture-phases/`, `blender-cleanup/`, `data/video-filter.json`, `debug/panel-shell.css`, `debug/panel-shell.js`, `output/`, `tmp/`, `tools/VALIDATION.md`, `tools/mp4-to-webm-preserve-aspect.bat`, and `tools/render-phase-pdfs.py`. These inherited changes were preserved. The architecture folder and output folder were already untracked; the Phase 2 additions inside them are listed below.

## Changed files and behavior

- `_4-games/games.js`: defines the active-video seek helper before Home/End use. Home seeks to 0, End to finite duration; other relative seeks retain clamping, audio sync, and key prevention. Home/End now request redraw.
- `sw.js`: matches the intro asset by normalized URL origin and pathname, so the local site and production CDN request can be intercepted. It prefetches and caches usable responses, serves cached media offline, returns a network error when nothing is cached, and deletes only prior `intro-cache-*` entries during activation. Cache version advanced from `intro-cache-v2` to `intro-cache-v3`.
- `_7-shared-scripts/media-controller.js`: `seekToRatio` calls an installed `seek(ratio, video, audio)` exactly once, regardless of its return value. The default `seekMediaWithFreeze` runs only when the callback is absent. Ratios remain clamped to `[0,1]`; duration must be positive and finite.
- `_3-graphics/graphics.js`: the model and CORS probe use `../assets/glb/card-test.glb`, resolving locally to `/assets/glb/card-test.glb`.
- `_5-music/music-piano-controls.v2.js`: the active piano loader and error diagnostic use `../assets/glb/toy-piano.glb`; the existing model version query remains.
- `tools/phase-02-correctness.test.mjs`: checks both games shortcuts on the actual handler body, callback ownership and clamping, local/CDN model resolution, service-worker install/cache/offline behavior under local and production host configurations, and no-cache network failure.
- `_8-tools-and-notes/architecture-phases/phase-03-instructions.md`: Revision **3**, October 5, 2026, carries the corrected seek, asset, and service-worker contracts into architecture design. `output/pdf/phases/phase-03-instructions.pdf` was regenerated from that Markdown and visually inspected. No other future phase document required revision; their existing obligations already cover later browser and release checks.

## Contracts and affected interfaces

No public route, preference default, storage key, consent decision, or custom event changed. The custom seek callback signature is `(ratio, video, audio)` and its return value is passed through; `undefined` means the callback handled the action, not a request for fallback. `createVideosVideoAdapter` and `createGamesVideoAdapter` spread caller context into the controller and can therefore supply this callback; no concrete `seek` callback was found in those two active adapters. Music's top-pad seek calls `seekMediaWithFreeze` directly and was not changed.

The corrected local URLs are `/assets/glb/card-test.glb` and `/assets/glb/toy-piano.glb?v20251115a`. With the current `assetUrl` resolver, the same page-relative source paths map to production CDN `/glb/card-test.glb` and `/glb/toy-piano.glb?v20251115a`. The intro URL is local `/Renders/tablet-animation.webm` or `https://assets.matthallportfolio.com/Renders/tablet-animation.webm`; worker matching requires the corresponding origin and path, ignoring a request query string. The service-worker cache name changed; no other storage names were touched. The unresolved `assetUrl('../soundfonts/...')` production-prefix concern remains for Phase 3 design.

## Validation and evidence

| Check | Outcome |
| --- | --- |
| `npm test` | 8 passed, 0 failed: 2 inherited storage tests and 6 Phase 2 tests. |
| `npm run lint -- --format json` parsed for counts | 51 files, 682 errors, 0 warnings. This equals Phase 1's 682 inherited errors; the new test and changed service worker/media controller add none. |
| `npx eslint` on the six changed source/test files | 359 inherited errors after the service-worker catch cleanup: graphics 1, games 60, active music piano 298, media controller 0, service worker 0, test 0. |
| `HEAD` on local review server | Correct model URLs returned 200; prior graphics and piano paths still returned 404. |
| Direct-entry browser `/_3-graphics/graphics.html` | Graphics card model visibly rendered; no new page error observed. |
| Direct-entry browser `/_5-music/music.html` | 3D toy piano visibly rendered; no GLB error observed. Three.js lighting deprecation warnings remain. First audible note was not measured. |
| Direct-entry browser `/_4-games/games.html` | Arcade console and reel visibly rendered. Home and End on focused reel produced no browser error. Current time was not exposed by DOM because the media is rendered in the canvas; the automated handler check confirms both bounds and two audio synchronizations. |
| Service-worker local/production behavior | Deterministic worker harness tested install prefetch, matching, cache hits offline, rejection of unrelated origins/paths, and empty-cache network failure. A live production CDN/offline browser run was unavailable and is not claimed. |
| Phase 3 PDF | Bundled Python renderer generated two pages; pypdf found Revision 3; Poppler render of both pages was visually inspected with no clipping or overlap. |

The Phase 1 browser baseline remains attached as `phase-01-baseline.md`. Durable screenshots, a validated 390px viewport, reduced motion, blocked browser storage, audio-device playback/first-note timing, network cold/warm comparisons, and live production CDN/offline worker behavior remain unverified. These are carried forward, not labeled as passing. The Three.js 0.158/0.159 warning/dependency issue is unchanged.

## Rollback for Phase 2 only

Restore the pre-Phase-2 contents of the five runtime files named above from starting `HEAD`, remove `tools/phase-02-correctness.test.mjs`, restore Phase 3 Markdown Revision 2 and its PDF, and remove this handoff. Keep all inherited Phase 1 and user changes. If reverting only the worker change, delete `intro-cache-v3` via the normal worker lifecycle and restore `intro-cache-v2`; do not delete unrelated caches. Avoid broad `git reset` or `git clean` in this dirty checkout.

## Next-phase prerequisites and known issues

Phase 3 should read this handoff and `phase-01-baseline.md`, adopt the callback and URL contracts above, and explicitly resolve relative soundfont paths, query/encoded paths, and production CDN assumptions. It should design how to obtain the missing durable browser and timing evidence without claiming it already exists. Phase 4 should validate live CDN worker caching during implementation. Phase 8 retains the full release regression matrix. No issue found here requires extending Phase 2 into structural refactoring.

## All remaining phases and steps

**Phase 3 - Design shared architecture boundaries.** (1) Assign settings/storage/assets/consent, media/scene, page, and tooling ownership. (2) Design validated settings defaults, legacy precedence, storage failures, cross-tab subscriptions, and separate consent. (3) Define media actions/state/capabilities, adapter contract, callback ownership, and lifecycle cleanup. (4) Design bootstrap, header, dependency policy, asset resolution for relative/local/CDN/query/encoded paths, intro worker matching, and migration order. (5) Design opt-in versioned soundfont disk storage, shared-bank deduplication, quota/removal, separate disk/RAM budgets, and prepare-for-recording API. (6) Carry unresolved browser/timing evidence and production CDN integration checks into the decision record. Stop and hand off.

**Phase 4 - Consolidate shared infrastructure.** (1) Implement settings/storage migration with blocked-storage and cross-tab tests. (2) Implement idempotent bootstrap/header for direct entry. (3) Move shared rendering helpers out of page ownership, document contracts, and validate asset URLs and live CDN behavior. (4) Standardize compatible Three.js imports, lifecycle helpers, and debug gating. (5) Implement agreed opt-in soundfont storage with capacity/version/deletion/eviction behavior. (6) Run affected pages and reconcile required Astra review. Stop and hand off.

**Phase 5 - Refactor start, video, and games pages.** (1) Extract start settings flow, controller scene, camera, calibration, accessible controls, and debug integration. (2) Extract video drawing/input/transport/preview while preserving playback controls and tablet transitions. (3) Extract games orchestration, reel, game bridge, camera, and layout while preserving generated game integration and Home/End checks. (4) Add cleanup and run each page's baseline before moving on. Stop and hand off.

**Phase 6 - Refactor the music subsystem.** (1) Map state/clock ownership and timing tolerances. (2) Extract catalog/loading, synthesis/graph, mixer, and MIDI scheduling while preserving note semantics. (3) Extract scene, hit testing, keyboard, and UI while retaining transcription boundary. (4) Gate diagnostics and dispose audio/timers/listeners/buffers/GPU resources; verify legacy references. (5) Check audio, MIDI, sustain, switching, recording/transcription, and sync after each extraction. (6) Integrate saved soundfonts and readiness/predecode API, measure cold/warm and memory limits, and profile before AudioWorklet decisions. Stop and hand off.

**Phase 7 - Improve presentation and performance.** (1) Improve names, landmarks, titles, descriptions, and initial HTML navigation. (2) Verify keyboard/focus/dialog/reduced-motion/fallback/mobile/asset-failure behavior. (3) Consolidate CSS against durable baseline screenshots. (4) Measure and optimize demonstrated load/frame/media/resource costs. (5) Repeat desktop/mobile/keyboard checks and report comparable measurements. (6) Compare cold/disk-cached/memory-prepared instrument startup, eviction, shared SF2, and separate disk/RAM limits. Stop and hand off.

**Phase 8 - Clean up and validate the release.** (1) Trace references before removing obsolete files; retain needed artifacts and licensing data. (2) Update setup, architecture, debugging, testing, hosting, dependency, and local/production asset documentation. (3) Add CI lint/unit/contract/browser checks and separate deployment artifact from tooling/fixtures/assets. (4) Run the full route/playback/settings/consent/keyboard/mobile/fallback/music regression matrix, including production CDN/offline worker and unresolved Phase 1 evidence. (5) Complete Astra review, resolve blockers, and deliver release/rollback report. Stop; deployment remains separate.
