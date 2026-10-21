# Phase 6 Music ownership and timing baseline

October 6, 2026. This is a partial extraction map and bounded software baseline, not a passed Phase 6 acceptance gate. Read `phase-06-handoff.md` before continuing.

## Entry points and current owners

`_5-music/music.html` still loads `music-piano-controls.v2.js?v=2026-01-05-2`, plus `music.js`, shared scripts and the existing dependency import map. No public route or entry query changed. `music.js` owns the decorative note bubbles and its own timers; those are outside the extracted catalog. `music-tablet.js` remains a separate geometry/media helper; its entry comment calls it a no-op, but the module has an implementation, so trace the actual call before changing it.

| Responsibility | Actual owner after this work | State / remaining lifecycle work |
| --- | --- | --- |
| Instrument definitions, envelopes, ranges, tabs, random pools, source order | `instruments/catalog.js`, `createInstrumentCatalog(...)` | Each call owns fresh arrays/maps. Config objects intentionally remain mutable because loading adds sample ranges and pickers register dynamic IDs. The caller supplies resolved URLs and the Salamander range. |
| Raw JS map fetch/evaluation; sample name/index/range; SF2 preset headers | `instruments/loader.js` | Stateless exported helpers; `_noteList` metadata belongs to the supplied map. No AudioContext, persistent store, saving, decoding or preparation. JS evaluation still uses `Function`, so strict CSP can refuse it. |
| Backend choice, loading side effects, active selection, rapid switching | v2 entry: `loadInstrument`, `loadLocalSoundfontForConfig`, `loadSf2InstrumentForConfig`, `triggerInstrumentButton` and picker helpers | Still shared mutable `instrumentPlayer`, current config/name and per-side slots. The bounded rapid-switch test is not a proof against all out-of-order fetch/decode races. Finish generation checks before moving backend publication. |
| Audio context, decoded song, gain graph and synth | v2 entry: `audioCtx`, `audioBuffer`, `audioSource`, limiter/master/category gains, `sf2SynthState` | Context uses latencyHint `interactive`; fall back to default constructor. Single SF2 synth/current URL is not a proven multi-bank backend. Full close/disconnect/unload and pending-decode cleanup remain. |
| Live voices, sustain and samples | v2 entry: `NoteEngine`, `heldNotes`, `activeVoices`, note routes, local-player buffer/promise caches and pad loops | Preserve release/overlap/stop-before-decode, pedal, mono/percussion routing, note-off timers and loop scheduling. `panicAllNotes` is not page teardown. |
| Mixer and calibration | v2 entry: `INSTRUMENT_MIX`, auto-gain map, meter/UI and calibration functions | Master 0.85, categories keys 1/electric 0.9/pads 0.85/solo 0.95/fx 0.9; master [0.2,3], category [0.2,2.5], auto gain [0.25,4]. Boost 3.16 and final master max 4.2 stay unchanged. |
| Song transport and MIDI visuals | v2 entry: `audioStartCtxTime`, `midiStartCtxTime`, `transportStartAudioTime`, saved/paused positions, event index, stretch and note spans | AudioBufferSource owns song sound. `advanceMIDI` advances key/glow/pedal visuals from parsed events; do not replace it with an independently ticking audible synth scheduler. |
| Piano scene, hit testing, keyboard and panel drawing | v2 entry, Three.js renderer/scene/camera/loaders, UV/key maps, QWERTY maps, canvas drawing and pointer handlers | Still no complete page mount/remount, renderer/texture/material/decoder disposal, listener/timer inventory, late-load invalidation or BFCache gate. Do not call the small bootstrap hook full page ownership. |
| Shared video UI | Shared `media/controls-view.js`/`controls-input.js` via existing facade; Music `ui/video-controls-lifetime.js` | Music releases its UI at track/top-pad stop and bootstrap disposal. UI disposal clears its canvas/context references and delegates pending preview/pointer cleanup. It does not pause/destroy borrowed media. Existing page stop functions still pause their owned playback. |
| Page diagnostics | `debug/debug-loader.js` -> `debug/music-diagnostics.js` | RESET-DEBUG history/event hooks load only with the existing debug preference/query, and scope disposal restores owned hooks. Other legacy instrument/UV/timing logs and debug globals still need inventory/gating. |
| Existing recorder | `music-2d.html` -> `music-2d.js` -> `music-transcription.js` | Active v2 does not import the transcription module. The alternative v2(1) copy also imports it. Keep its exported `recording` and `configureRecordingEngine`; do not reconnect it to 3D or implement a new recorder as part of extraction. |

## Clocks, settings and timing invariants

The audio device clock is `audioCtx.currentTime` in seconds. Track offsets, source starts, playback position and MIDI clock origins use that clock. `performance.now()` is milliseconds for UI, log windows, camera easing, note interaction and release animation bookkeeping; RAF/Three.Clock drive rendering. HTMLVideoElement.currentTime is a separate media clock synchronized to the song position. Browser timers wake pad scheduling and some note-off/recording work, but are not interchangeable with the audio clock.

Fresh song start uses a 0.2-second scheduling lead plus `SONG_LEAD_IN_SEC = 1`. Positive global sync delays audio; negative sync delays MIDI zero. `tAudio - (midiStartCtxTime + firstMidiNoteSeconds)` must equal the global sync offset. Seek/resume/rate changes use a separate 0.05-second lead. MIDI event adjustment is `first + (raw-first) * stretch / rate`, preserving stretch and rate order. Falling-note lead remains 1,000 ms. Backboard and top-pad maximum redraw rates remain 20 and 24 FPS.

Track video targets `max(0, songPosition - syncMs/1000)`, with the existing hard-correction threshold `max(0.25, 0.12 * max(1, rate))` seconds. This threshold is source behavior, not a measured perceptual tolerance. The test fixture's loose 0.3-second check is only a smoke alarm; it is not an acceptance tolerance.

`audioLeadTrimMs` is the latest detected leading silence written by `loadAudio`, not the shared sync setting. The current entry does not read it back. RMS threshold is 0.0025, scanning windows are 2,048 samples, and the cap is 20,000 ms. Energy onset detection uses 1,024-sample frames with 512-sample hops. Baby and Forests explicitly force leading trim to zero. Preserve this behavior before deciding whether the diagnostic storage write should migrate. A blocked write currently shares the audio-load try/catch; do not silently claim that path validated.

Keep `music.instrument.master`, `music.instrument.category.<id>`, and `music.instrument.autogain.<id>` distinct from `site.audio.volume`, `site.audio.muted`, `site.audio.sync`, `site.audio.preservePitch`, and the consent cookie/key. This work did not migrate them. Dynamic catalog IDs and custom FX can depend on asset base/patch; stable persistent selection IDs still require design reconciliation.

## Observed local software baseline and extraction comparisons

Windows in-app Chromium reported Chrome 154, AudioContext 48,000 Hz, baseLatency 0.01 seconds. Output latency reported 0.04 seconds in one run and 0 in subsequent runs; these API values are not audible-output measurements. Effective test viewport was 1005 x 884 CSS pixels. An earlier uninstrumented visual smoke was 1280 x 720. Local server `http://127.0.0.1:8878` sends no-store responses; this is not production-CDN cold loading. Each reported run selected a fresh local Grand Piano player and decoded C4 once, then requested the same buffer again. No saved-raw or full prepared-instrument timing exists.

| Run | Select to JS-map/player return (ms) | First C4 decode (ms) | Cached C4 retrieval (ms) | Fresh song lead (ms) | Observed video minus song (ms) |
| --- | --- | --- | --- | --- | --- |
| Baseline 1 | 26.1 | 7.4 | 0 | 1200 | -128.7 |
| Baseline 2 | 19.8 | 6.4 | 0 | 1200 | -120.7 |
| Catalog extracted | 22.1 | 6.3 | 0 | 1200 | -110.0 |
| Raw loader extracted | 18.8 | 6.3 | 0.1 | 1200 | -128.7 |
| UI cleanup/history gate | 19.1 | 6.0 | 0 | 1200 | -118.0 |

Global sync was an existing saved zero during these runs; floating-point difference between audio start and first MIDI was below 1e-9 ms. Existing effective volume was 0.26, master mix 0.85, playback rate 1 and trim zero. No gain/sync settings were changed. C4 decoded PCM was 1,201,488 bytes; that is one sample, not a whole instrument's memory cost. The browser fixture temporarily enabled sound with explicit user approval and restored denial after each completed run. An initial Playwright click did not unlock/resume; native browser gestures did. The fixture now bounds resume waits and restores on pagehide.

The baseline establishes exact scheduling algebra for the unchanged paths and an observed range of local decode times. It does **not** establish an audible first-note latency tolerance, long-run drift tolerance, synth switching correctness on every backend, or cross-device regression threshold. Those are still required before timing-sensitive audio/session/scheduler extraction. No microphone or new recording feature was used, and no physical reference recording was captured.

Each reported run checked sample reuse, overlapping live notes, sustain holds/release, panic clearing held voices, audio/MIDI start, MIDI advance, pause freeze, quarter-track seek, resume, bounded video position, stop, and two rapid instrument selections. It exercised ordinary local piano samples, not every category, SF2, failed loading in-browser, MIDI hardware, long takes or background/BFCache behavior. Recorder browser evidence is start -> Recording -> Stop -> Idle on the separate 2D route; no recorded note or transcription-output acceptance is claimed.

## Soundfont and preparation boundary

`phase-06-package-inventory.json` is an audit, not a runtime manifest. Reproduce it with `node tools/music-package-inventory.mjs`. It hashes every required file for the 20 fixed catalog selections without saving browser data or decoding samples. All files existed; total payload is 99,999,069 bytes. Most fixed presets use `musyngkite/*-mp3.js`; default Odd FX uses FluidR3. Grand Piano MP3 map is 2,306,794 bytes. Drums uses 59 Salamander WAVs totaling 52,098,202 bytes; it does not use definitive-drums. Dog uses the 568,430-byte Hypersound SF2; it does not currently use WappyDog.

The catalog requests `DOGBW60`, which is absent from Hypersound. The bank contains `Dog barking` at program 123/bank 1; the existing code falls back to program 0. No timbre correction was made. Resolve/document the intended preset before advertising saved Dog readiness. Do not infer real catalog mappings from the four Phase 4 placeholder IDs.

The Phase 4 store and manifest remain unchanged and unwired. No Save UI, saved-byte loader interception or preparation API is shipped by this partial phase. Integration still needs verified raw reads for JS and SF2, same fallback order, CSP behavior, real browser IndexedDB transaction/quota/version/dedup/eviction/removal/cancellation checks and truthful selection status. Metadata must cover dynamic/custom selections or clearly restrict saving to specific named defaults.

Disk cap remains decimal 250,000,000 bytes, charged with payload plus max(1 MiB,5%). Definitive-drums remains too large. Background preparation remains provisionally 128 MiB (134,217,728 bytes), independent of disk and ordinary playback. Arachno raw staging alone exceeds 128 MiB. No decoded/backend/peak-copy budget or concurrent SF2 bank capability was validated; no set can be reported recording-ready on this evidence. Implement leases, all-requested readiness, cancellation/progress and context/version/consent invalidation only with measured backend accounting. Do not decode all saved packages, automatically save on play/prepare, add recording, or rewrite to AudioWorklet.

## Regression and legacy obligations

Keep the eight Phase 6 contract tests with the 21 inherited tests. Retain exact preset/source/envelope fixtures and per-step source checkpoints. Before the next extraction, recover audible first-note/reference and device timing, then repeat the same local fixture plus failed loading, all categories/SF2, left/right switching, nonzero sync/rates, MIDI sustain/overlap, real recording notes/playback, consent revocation, blocked storage, pending loads and repeated page disposal.

No legacy file is proven safe to delete. `music-2d.html` is a functioning separate recorder route, and `music-piano-controls.v2(1).js` references transcription. The two old piano implementations are not the main-route entry, which is insufficient proof of non-use. No alternatives, vendor assets, licenses, reference recordings or user soundfont selections were removed.
