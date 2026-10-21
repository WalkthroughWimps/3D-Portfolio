# Phase 1 baseline evidence

October 5, 2026. Starting commit `add5dd6eae8c81c40d0052371bcd8a387f7c0385`. Tested with `npm run review` at `http://127.0.0.1:8878/` in the Codex in-app browser. This file records observations, not a clean browser pass.

## Routes and dependencies

| Public route | Active entry script(s) | Main ownership and dependencies |
| --- | --- | --- |
| `/` (`index.html`) | `_0-start/start-page.js`, `_0-start/a11y.js`, `js/site-utils.js` | Settings controller, camera transition, shared preferences, consent, video controls, lighting, asset resolver; Three.js 0.158 import map. |
| `/_1-about/about.html` | `_1-about/about.js`, `js/site-utils.js` | Cube alignment, shared 3D mouse controls and asset resolver; Three.js import map. |
| `/_2-videos/videos.html` | `_2-videos/videos.js`, `js/site-utils.js` | Tablet, focus, preview segments, video adapter; shared media/video controls, consent and asset resolver; Three.js 0.159 from unpkg in JS. |
| `/_3-graphics/graphics.html` | `_3-graphics/graphics.js`, `_3-graphics/graphics-morph.js`, `js/site-utils.js` | Shared 3D controls and asset resolver; Three.js import map, KUTE 2.2.4 from jsDelivr. |
| `/_4-games/games.html` | `_4-games/games.js`, `js/site-utils.js` | Layout, video adapter, audio bridge; shared media/video controls, consent, asset resolver; Three.js import map. Generated game exports are separate. |
| `/_5-music/music.html` | `_5-music/music.js`, **`_5-music/music-piano-controls.v2.js?v=2026-01-05-2`**, `js/site-utils.js`, `_7-shared-scripts/global-sync.js` | Piano, MIDI, synthesis, recording boundary, music tablet; shared consent, media, asset resolver; Three.js import map, GSAP 3.11 CDN, soundfont-player 0.8.1 CDN fallbacks, local WebAudioFont and js-synthesizer assets. |
| `/_6-docs/docs.html` | `_6-docs/docs.js`, `_6-docs/docs-3d.js`, `js/site-utils.js` | Document controls, 3D scene, asset resolver; Three.js import map. |

Shared HTML/CSS: `_7-shared-scripts/header.html`, `template.css`, `colors.css`, `js/site-utils.js`. Runtime shared JS includes `assets-config.js`, `local-preferences.js`, `settings-store.js`, `audio-consent.js`, `global-sync.js`, `scene-lighting-sync.js`, `media-controller.js`, `shared-video-controls.js`, `video-player-controls.js`, `shared-glb-mouse-controls.js`, and `media-catalog.js`. Start's inherited `video-filter.js` and debug panel changes are present. Production asset resolver defaults to `https://assets.matthallportfolio.com`; local host uses relative paths. Fonts use Google Fonts. Three.js is mixed between 0.158 import maps and 0.159 unpkg imports. Legacy alternatives: `_5-music/music-2d.html` is a separate route; `_5-music/music-piano-controls.js`, `_5-music/music-piano-controls.v2(1).js`, and `_0-start/stupid.js` are not loaded by the seven main HTML pages. They were excluded from primary lint scope, not deleted.

## Tooling checks

- Before Phase 1, `npx eslint _4-games/games.js _7-shared-scripts/local-preferences.js --format json` reported zero messages for both despite known issues; old config applied no rules to nested files. A root-wide old-config scan was stopped because it traversed large unrelated trees.
- `node --test tools/local-preferences.test.mjs`: 2 passed, 0 failed before the tooling edit.
- After Phase 1, `npm test`: 2 passed, 0 failed.
- `npm run lint` / direct JSON report: 50 files checked, 682 errors, 0 warnings: 681 `no-unused-vars`, 1 `no-empty`. Top files: music piano v2 298, shared video player 153, start 88, games 60, shared video controls 29. No auto-fixes or blanket suppressions were applied. `sw.js` and browser-only `tools/local-admin` each receive their own environment. The JSON scratch report is `tmp/phase-01-eslint.json` (ignored working data).

## Browser observations

- Direct entry displayed an accessible page shell on all seven routes. From Docs, the About Me header link navigated to `/_1-about/about.html` with the expected title.
- Start first visit displayed an animation-choice dialog. The dialog returned on reload. The visible volume slider changed from 25 to 26 by keyboard, then displayed 25 after reload. Persistence is not verified; the browser's read-only inspection API cannot read storage and the cause of the reset is unconfirmed.
- Graphics console: `GLTF LOAD FAILED` for `/_3-graphics/assets/glb/card-test.glb` (404). `HEAD /assets/glb/card-test.glb` returned 200, 1,982,556 bytes. Reproduce by direct entry to `/_3-graphics/graphics.html` on the local review server.
- Music console: `GLB load FAILED` for `/glb/toy-piano.glb?v20251115a` (404). `HEAD /assets/glb/toy-piano.glb` returned 200, 27,809,200 bytes. Reproduce by direct entry to `/_5-music/music.html`. The missing 3D piano prevented a valid first-note timing observation.
- Videos intro initially showed `Unable to play media` / `Loading...`; the file `/Renders/tablet-animation.webm` exists and returned 200, 9,380,850 bytes. Playback did not receive a conclusive pass. Browser logs contained Three.js removed/deprecated lighting warnings. Console logs are cumulative across navigation in this browser, so each warning was attributed by source URL rather than current-page presence alone.
- Screenshots were captured for all seven routes and a nominal narrow pass in the browser tool session. They could not be saved into the repository through the browser's supported export APIs; a data-URL download was rejected by browser security policy. The viewport override requested 390x844 but a read-only DOM measurement still returned 849 CSS pixels, so the narrow pass is unverified. This is a Phase 1 evidence gap, not a mobile pass.
- Reduced-motion emulation, blocked browser storage, failed-network injection, production CDN loading, audio-device playback, games seek keys with active media, and service-worker offline behavior were unavailable in this browser setup. The Node test covers blocked storage for `local-preferences.js` only.

## Suspected defects for Phase 2

- `_4-games/games.js` lines around 2503-2506 call `seekBy` for Home/End before its `const` declaration. Exercise the active video keyboard path; expect `ReferenceError` until fixed.
- `sw.js` constructs full CDN URLs in `INTRO_ASSETS` but compares those strings with `url.pathname`, so production matching cannot succeed. Local matching may work.
- `_7-shared-scripts/media-controller.js` around line 63 uses `options.seek?.(...) || fallback`; a custom callback returning `undefined` triggers the fallback as well.
- Graphics and music local model URLs above are confirmed 404s despite files under `assets/glb/`.

## Instrument package baseline

File sizes from the workspace, not transfer or decode timings: `soundfonts/fluidr3_gm` has 128 `*-ogg.js` packages totaling 345,783,322 bytes. Representative per-instrument packages: acoustic grand piano 2,657,542 bytes, violin 3,653,304, accordion 3,437,811. Shared SF2 banks: WappyDog 6,064,330 bytes, Arachno 155,405,818, definitive drums 256,317,998. A proposed 250 MB disk limit cannot hold the definitive-drums bank (about 244.4 MiB) plus meaningful overhead and another large bank. Validate the unit and capacity policy in Phase 3. The active piano code uses per-instrument soundfont-player loads and SF2 bank URLs; disk size cannot stand in for decoded RAM cost. Network-cold, disk-cached, memory-prepared, and first-note timings remain unmeasured because the model did not load and no audio timing surface was available.
