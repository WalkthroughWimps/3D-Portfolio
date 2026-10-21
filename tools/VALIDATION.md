# Validation entry point

Use Node 24.19.0 and npm 11.17.0 from the repository root:

```powershell
npm ci --ignore-scripts --cache tmp/phase-08/npm-cache
npm test
npm run check:site-html
npm run lint -- --format json --output-file output/phase-08/lint.json
npm run check:artifact
npm run build:artifact
```

`npm test` retains all 32 prior contracts and adds three artifact/preview integrity checks. Real local GLBs and Hypersound metadata are prerequisites. Hydrate Git LFS first. `npm run hydrate:assets` validates or retrieves seven explicitly pinned inputs (Hypersound plus six static Videos previews), with bounded streaming/hash/size verification and no overwrite of existing mismatches. `hydrate:test-assets` remains a bank-only helper. The tested bank CDN URL returns 404; the remote music-videos-hq length also differs from the pinned candidate. Clean recovery remains blocked until those inputs are reconciled. Do not substitute a synthetic bank, skip tests or change hashes to accept unreviewed content. Lint remains a failing gate at 642 errors, zero warnings; new Phase 8 tooling is lint-clean.

After changing `_7-shared-scripts/header.html` or `data/runtime-dependencies.json`, run `npm run prepare:site-html`, review the marked regions in seven HTML entries and `sw-asset-config.js`, then run check mode. All seven main routes use the Three.js 0.159.0 candidate; its complete compatibility gate remains open. Six content routes have generated links/skip targets; Start retains its landing navigation.

`npm run review` serves diagnostic preview at `http://127.0.0.1:8878/`, injects local tools and sends no-store responses. It is unsuitable for production CPU/heap/cache claims. `npm run preview:artifact` is a separate static preview with no injection or admin endpoint:

```powershell
$env:SITE_ROOT='output/phase-08/artifact/site'
npm run preview:artifact
# In a second terminal:
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run test:browser
```

Unset `PLAYWRIGHT_CHANNEL` to use Playwright's installed Chromium, as CI does; install with `npx playwright install chromium` when needed. Tooling dependency is pinned to `@playwright/test` 1.63.0. Browser checks exit nonzero on failed assertions and save screenshots/errors/HTTP failures in `output/phase-08/browser/`. Disposable contexts deny audio and block workers. They check 1280x720/390x844 navigation/shells, blocked storage getters, reduced-motion class, failed GLBs, unavailable WebGL and settings migration/zero/false/reset/reload/another tab. Inspect separate HTTP/request arrays: a page shell does not establish media/audio acceptance.

For a genuine local subpath, start another static server with `SITE_BASE=/portfolio/`, `SITE_PORT=8880`, same artifact root. Run browser checks with `SITE_URL=http://127.0.0.1:8880/portfolio/` and `BROWSER_OUTPUT=output/phase-08/browser-subpath`. Server requests outside the prefix return 404; links escaping to origin root are not concealed. This is local emulation, not production hosted/device acceptance.

`node tools/phase-08-references.mjs` checks literal HTML/CSS/import references against the artifact. Dynamic paths, vendor/generated-game internals and external public consumers require more tracing. `node tools/phase-08-network.mjs` probes HEAD/Range against six CDN keys plus the running root/subpath previews; inspect request origin, CORS, status and range headers. It cannot prove browser playback/offline acceptance.

`.github/workflows/validation.yml` has separate contract/artifact, lint and browser jobs and uploads reports. Both contract/artifact and browser jobs provision the explicit inputs before testing/building; the contract job also checks literal references. There is no deployment/publishing command or lint-baseline waiver. CI remains red while hydration, lint and WebGL gates fail and has not run remotely in this phase.

## Required release matrix

Direct routes: `/`, `/_1-about/about.html`, `/_2-videos/videos.html`, `/_3-graphics/graphics.html`, `/_4-games/games.html`, `/_5-music/music.html`, `/_6-docs/docs.html`, plus `/_5-music/music-2d.html` and linked generated games. Record browser/version/device, effective CSS viewport/DPR, base/cache/worker conditions, consent/settings, screenshots, actions, network/errors and timings.

1. All main routes: direct entry/navigation/no-JS/fetch failure, keyboard/focus/dialogs, saved settings/Reset/reload/cross-tab failures, denied sound, reduced motion, 320px/390px/zoom/contrast/screen-reader/touch and failed WebGL/assets.
2. Start: motion then sound prompts, Save/Reset, missing lighting 0.5 and saved zero, fallback/calibration/camera/authored controller behavior, controls and repeated lifecycle/BFCache.
3. Videos: intro/Skip/tablet/preview/replacement/cancellation; active play/pause/seek/rate/pitch/volume/sync/keyboard/disposal.
4. Graphics: camera/damping/resize/hidden/resume/redraw, material/light comparisons and complete GPU disposal.
5. Games: Home/End/J/L/arrows/reel, generated controls/audio/iframe focus/keyboard return, modes/CSS3D/consent/lifecycle.
6. Music/recorder: audible reference/first note, notes/overlap/release/sustain/panic, all backends/banks/switching, MIDI/rates/nonzero sync/long-run drift/video alignment, real recorded notes/replay/transcription, revocation/late loads/cleanup.
7. Store/readiness: explicit Save/usage/removal/saved JS/SF2/CSP, browser IDB atomicity/dedup/version/reservation/concurrency/quota/cancellation/eviction/reload and peak staging/backend memory; independent decimal 250 MB disk/provisional 128 MiB RAM/readiness/leases/invalidation/unsupported banks. Integration is not implemented.
8. Assets/dependencies/worker: full CDN CORS/CORP/ranges/alternative links; root/genuine hosted subpath/custom-base limits; worker install/upgrade/query/origin/offline hit/miss/range/cache ownership; Three/Draco/Meshopt/RoomEnvironment/PMREM/CSS3D/material/video-texture/device comparisons.

Use Phase 8 validation/handoff for actual outcomes. Screenshots, unit passes, process exits and software timing do not replace audible/device, full accessibility, saved-package or production gates.
