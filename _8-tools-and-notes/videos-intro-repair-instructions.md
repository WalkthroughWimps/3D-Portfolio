# Videos tablet intro repair instructions

Repair the Videos page so the complete tablet intro plays reliably, continues through recoverable buffering, and plays its separate soundtrack when consent, saved settings and browser policy permit. The tablet GLB must transition into view only after the intro ends or the user explicitly skips it.

This is a planning packet dated October 6, 2026. It changes no runtime code and starts no implementation. Execute it only when the user explicitly launches the repair. Work locally and stop after validation and a handoff; do not push, publish, deploy or modify production hosting.

## Recommended model

Use **GPT-6 Luna with High reasoning** for this bounded repair. Luna is available in this local Codex environment and is suited to scoped tasks in [OpenAI's model selection guidance](https://developers.openai.com/api/docs/guides/model-selection). High reasoning is a task-specific recommendation because event ordering, browser audio activation and worker caching interact here. Use one implementing agent; no delegation is required.

If repeatable failures remain unexplained after tracing, or a fix expands into shared consent architecture, large media re-encoding or general Videos orchestration, report the evidence and remaining work for GPT-6.1 Sol with Medium/High reasoning. Do not broaden the task merely to finish the older architecture phases.

## Scope and preserved behavior

The user reports incomplete/stuttering intro playback, mid-animation timeouts followed by the GLB dropping down, and missing intro audio. Repair those behaviors together, with the smallest coherent patch.

Preserve the existing intro assets, tablet pose, camera, materials, lighting, 1,200 ms GLB drop and visual handoff until measurement shows a specific necessary change. Preserve public routes, settings keys/defaults, cookie precedence, saved volume zero/mute true and sync sign. Audio consent remains independent of volume, playing, saving or URL parameters.

Primary edit candidates are `_2-videos/videos.js` and `sw.js`. A small page-owned intro controller may be extracted if it simplifies ownership and tests. Change `videos.html`/`videos.css` only for recovery, readiness or sound controls needed by this repair. Update generated worker configuration through its existing generator only if the configuration actually needs changing. Shared player/preloader edits require evidence of a directly relevant fault and focused cross-page regressions.

Do not finish the full Phase 5 Videos refactor, change Music/Games/Start behavior, mass-fix lint, upgrade dependencies, replace assets, delete old implementations or reset the dirty checkout. Existing work is uncommitted. Keep selective pre-edit backups and record changed paths. Do not clear the user's real browser storage or unregister unrelated workers; use disposable test contexts.

## Read before editing

Paths below are relative to `C:\Dropbox\Resume Website`. Re-search symbols before relying on the planning-time line numbers.

| File | Relevant area |
| --- | --- |
| `_2-videos/videos.js` | Intro config/state/drop, lines 22-193; `setupIntroVideo`, 196-413; skip, 416-461; consent/init, 482-556; GLB handoff/preloads, 728-831 |
| `_2-videos/videos.html`, `videos.css` | `tabletIntro`, `introGate`, `introPlay`, `introSkip`, loading UI and overlay transitions |
| `_2-videos/videos-tablet.js` | GLB loading, pose and camera ownership; preserve authored alignment |
| `_7-shared-scripts/audio-consent.js`, `core/consent.js` | Actual consent state, prompt, subscription, revocation and session fallback |
| `_7-shared-scripts/audio-settings.js`, `global-sync.js`, `media/transport.js` | Saved volume/mute and sync; `syncTargetTime(videoTime, syncMs)` |
| `_7-shared-scripts/video-player-controls.js` | Grid creation, preview/full media, `__ensureSrc`, `__warmMetadata`; inspect for eager fetch/decode as well as page queue behavior |
| `sw.js`, `sw-asset-config.js`, `tools/prepare-site-html.mjs` | Intro interception, complete-response cache, install/upgrade and generated URL configuration |
| `_0-start/start-page.js` | Worker registration near line 5487; a worker installed by Start can control Videos. Direct Videos entry may have different worker state |
| `tools/phase-02-correctness.test.mjs`, `phase-08-artifact.test.mjs`, `phase-08-worker.mjs`, `phase-08-browser.mjs`, `phase-08-server.mjs` | Existing behavioral regressions, range evidence, test patterns and clean local preview |
| `_8-tools-and-notes/architecture-phases/phase-04-handoff.md`, `phase-05-handoff.md`, `phase-07-handoff.md`, `phase-08-validation.md`, `phase-08-final-review.md`, `phase-08-handoff.md` | Preserved contracts, incomplete page ownership, known runtime/hosting failures and limits of prior tests |

## Current evidence and hypotheses

These are source findings and earlier recorded tests, not a new browser reproduction of the user's incident. Establish which paths occur in an actual trace.

1. **Priming can consume real-play initialization.** `setupIntroVideo` briefly plays muted video, pauses and rewinds it. Its `playing` listener uses `{ once: true }` and returns while `__priming` is true. A priming `playing` event can remove that listener before genuine playback, leaving timeout cancellation, deferred audio loading and watchdog setup unavailable. Confirm event order rather than assuming every browser schedules it identically. The priming promise can also pause/rewind after an overlapping Play request.
2. **The Play button creates a deadline that finishes the intro.** Around lines 365-371 it calls `play()` without handling its returned rejection, starts audio, arms an unconditional `finishOnce` timeout and hides the gate. If the real `playing` path does not cancel that timeout, it can finish while frames are advancing.
3. **Recoverable stalls are treated as completion.** A watchdog calls `finishOnce` after 12 seconds without advancing media time. It does not distinguish buffering, backgrounding, seeking, explicit pause or fatal failure. `markIntroDone` pauses/hides both media and starts the GLB drop. This turns a transient stall into the user's sudden handoff.
4. **Readiness is reported without media evidence.** Priming failures mark ready after 1.5 seconds; another fallback forces 100 percent and Ready after 15 seconds. The initial startup timer can finish before a user starts playback. Readiness is written by several competing paths.
5. **Audio startup has competing asynchronous paths.** The soundtrack is a separate `Renders/tablet_animation_1.opus`, initially created only when setup-time permission is considered allowed. Its URL is assigned in the real `playing` handler, while click and `timeupdate` can call `startIntroAudio` before a source exists. That function marks audio started before successful playback and waits asynchronously; rejected plays only reset a flag. Deferred setup waits for metadata before its explicit `load()`, and later permission changes have no intro-owned subscription. Browser gesture loss, early state flags, delayed loading and swallowed errors are hypotheses to trace. The muted video element itself is intentional.
6. **Preloads can interfere with a long intro.** The grid warmup starts after 15 seconds even if the intro is unfinished. `createPreloadQueue.enqueue` runs a task immediately and also puts it in the queue; concurrency limits therefore do not reliably apply and work can run twice. The completion poll and fallback can also each start warmups. Confirm actual network/decoder contention and any eager loads inside grid creation.
7. **Worker range faults are already reproduced.** Phase 8's live worker test passed 4/6 checks. A cold online 206 response causes `cache.put` to reject and the catch substitutes `Response.error()` for a successful network response. A warm offline Range request receives the full cached 200 without Content-Range. Cache full-response availability does not establish correct streaming/seek behavior.

## Step 1 Capture a focused baseline

Record starting Git status and selective backups/hashes. Keep new evidence under `output/videos-intro/` and disposable fixtures under `tmp/videos-intro/`. Do not regenerate or overwrite Phase 8's frozen artifact/evidence as if it were a new passing candidate.

Reproduce direct Videos entry and Start-to-Videos navigation. Use fresh contexts for worker absent, controlled with an empty owned cache, and controlled with a cached complete intro. Observe the actual `navigator.serviceWorker.controller`; do not assume blocking the worker is representative. The older page-shell harness blocks workers and denies sound, so its normal pass cannot validate this bug.

Capture video/audio events (`loadstart`, metadata/data, `canplay`, `playing`, `waiting`, `stalled`, `pause`, seeking/seeked, timeupdate, ended and error), play-promise outcomes, media time/duration/readyState/networkState/buffered ranges, document visibility, consent/settings and every completion reason. Include worker/network status, 200/206 headers and transfer timing for video/audio/GLB/previews. Observe progress with a lightweight bounded sampler and, where supported, presented/dropped video-frame counters; avoid heavy per-frame logs.

Measure real asset duration, codec, resolution, frame rate and audio duration if ffprobe or an equivalent existing tool is available. The candidate video is 9,380,850 bytes and separate Opus is 161,123 bytes. `tablet_animation_1.webm` is a different existing file: do not substitute it based on its name or size. Check actual local/CDN GET/range responses, MIME and browser CORS enforcement. Do not infer playback from HEAD 200.

Reproduce slow loading, a temporary mid-clip stall exceeding the old 12-second deadline, and a background-tab interval exceeding 15 seconds. Record whether media time and presented frames advance when a finish occurs. First distinguish network starvation, decode pressure, main-thread/render work and timer races.

## Step 2 Give the intro one lifecycle owner

Replace overlapping priming/readiness/play/timeout paths with a small explicit state model: loading, ready, starting, playing, buffering, paused or suspended, blocked/error recovery, and completed/skipped/disposed. Keep media readiness, user play intent and terminal completion distinct.

Use exactly one idempotent completion path with a recorded reason. Normal completion comes from the genuine visible-play generation's `ended`; Skip button/S is an explicit user completion. Priming events, startup deadlines, watchdog deadlines, waiting/stalled events and hidden-tab time never count as successful completion or trigger the drop. After a permanent media failure, retain a clear Retry and Skip route rather than silently skipping. A pre-start timeout reports slow loading and offers recovery; it does not pretend the clip ended.

Remove decoder priming if normal buffered startup is adequate. If evidence justifies retaining it, isolate its generation, completion and cancellation so it cannot consume listeners, start audio, pause/rewind real playback or trigger terminal events. Keep the Play button disabled only when playback cannot reasonably begin; disable duplicate starts while a start is pending. Handle `play()` promises and preserve accessible recovery controls on rejection.

Show truthful loading/buffering states using actual media evidence. `preload=auto` and `canplaythrough` are hints, not guarantees. Do not fake 100 percent or require a full download forever on browsers that do not provide it. Use measured startup buffering appropriate to this short clip and keep recovery available on slow networks.

Own timers, intervals, event listeners, subscriptions, audio elements and pending asynchronous work. Use cancellation/generation checks after every await and before delayed play/seek. Skip, retry, completion, navigation and disposal must prevent late callbacks from restarting media. Preserve the last intro frame while waiting for a slow GLB where possible; apply the existing drop once when both terminal intro state and GLB readiness permit. Late GLB arrival must not replay the drop. Keep the existing narrow Skip placement.

## Step 3 Repair worker streaming

Add regressions around the actual worker handler before changing it. A successful network media response must be returned even when cache opening, reading or writing fails. Never put a 206 response under the complete-asset key. Cache only a valid complete response; caching is best effort and must not manufacture a network failure.

Choose and document range behavior: pass through online ranges when no complete cache exists, and serve correctly sliced ranges from a verified complete cached body for offline playback. Handle ordinary bounded, open-ended and suffix single ranges, correct status/Content-Range/Content-Length/type and unsatisfiable 416. Define unsupported multiple-range behavior explicitly rather than returning misleading partial data. Preserve query-insensitive matching only for the intended exact origin/path, unrelated-request pass-through and owned-cache cleanup.

Consider bounded memory cost when slicing the approximately 9.4 MB intro; do not introduce an unbounded general media cache. Use a coherent owned cache-version update if stale responses must be replaced. Do not register workers on every page or change unrelated cache/storage policies just to make a test pass. Audio offline support is a separate design choice; record that only the intro video is currently cached.

## Step 4 Repair consent aware synchronized audio

After consent allows audio, prepare the separate soundtrack early enough for reliable start. Denied consent must keep the animation usable and silent. URL `sound=1` must not override an explicit denial; verify the existing shortcut and constrain the intro path if needed without silently changing other pages.

Start permitted video/audio through one user Play action where browser policy requires activation. Browser audio authorization can be lost across await/timer boundaries; use a tested gesture-safe strategy rather than assuming saved consent unlocks playback. Use ready media and synchronous gesture initiation where possible, and show a clear sound-enable/retry action if the audio play promise is blocked. Never call blocked audio successful or automatically persist consent to bypass policy.

Track source-ready, play-pending and actually-playing separately. Handle every play rejection, avoid repeated timeupdate retries, and cancel pending starts on skip/retry/disposal or consent revocation. Recheck consent at asynchronous boundaries. Honor saved volume/mute and subscribe for changes/revocation during the intro. Revocation pauses soundtrack immediately without finishing the visual intro.

Use video media time as the master clock. Preserve the shared sign convention `audioTime = max(0, videoTime - syncMs / 1000)` and test zero, negative/default -270 ms and positive sync, plus non-1 playback rate. Pause soundtrack on video buffering/pause/suspension; on recovery re-align before resuming. Positive sync requires a cancellable delay until its target is valid; recompute against current media time on delayed resume. Measure drift and use bounded corrections rather than seeking audio every animation frame. Audio buffering must not falsely complete video; choose a coherent pause/recovery policy when permitted sound cannot keep up. Missing/failed audio must report a sound problem with Retry or an explicit continue-silent option.

## Step 5 Remove competing intro work

Make grid warmup start exactly once after the terminal intro handoff, never simply because 15 seconds elapsed. Cancel its completion poll/fallback or replace them with the owner callback. Fix the queue so each task is invoked once and its returned promise represents that queued invocation; enforce measured concurrency. Verify all producers inside grid creation, not only the page scheduler, defer nonessential full/LQ fetches and decode while the intro has priority.

Profile any remaining stutter after race/worker/preload fixes. If GLB parse, shadows or continuous WebGL rendering compete with the visible overlay, defer or limit measured work during the intro while preserving the final scene. Do not retune the scene or re-encode assets speculatively. Record further asset/GPU work as unfinished if it requires a broader decision.

## Step 6 Validate the real failure modes

Use meaningful behavioral tests against actual code plus real browser playback. Add narrowly scoped tests to the existing `tools/*.test.mjs` suite and a focused disposable browser harness if needed. Synthetic timers cannot prove successful decoding or audible sound.

| Required scenario | Acceptance |
| --- | --- |
| Priming event followed by real play; slow priming promise resolves after click | Real play initialization still runs once; no late pause, rewind, silent deadline or missing audio |
| Media time advances beyond both old 12/15-second deadlines | Overlay remains active and GLB does not drop until genuine ended or explicit Skip |
| Temporary waiting/stall longer than 12 seconds | Shows buffering/recovery, no automatic drop; resumes remaining clip in sequence |
| Hidden tab, return, pause/seek/rate change | No deadline skip; soundtrack pauses/re-aligns, cleanup and timeline remain coherent |
| Cold, warm, direct entry, navigation from Start | Full real clip completes; actual worker controller and cache state recorded |
| Autoplay rejection, repeated Play, Retry | Visible usable controls, no unhandled rejection, duplicate playback, late rewind or audio retry loop |
| Consent allow/deny/revoke, mute, zero/nonzero volume, sync signs | Permitted sound starts after legitimate gesture and follows timeline; denied/muted/zero remains silent; revoke cancels pending work |
| Audio slow/404/CORS/error or policy rejection | Sound failure is visible/recoverable; no false playing state, implicit consent or premature GLB drop |
| Video failure, slow/missing GLB, explicit Skip/S during loading/play/buffer | Recoverable controls; one terminal handoff/drop when appropriate; late loads/promises do not restart media |
| Cold online range plus cache.put failure; warm offline range; 416 | Correct 206 bytes/headers or defined failure, never valid network response converted to error; existing matching/upgrade/hit/miss tests retained |
| Preview warmup and completion repeated | No preload pressure during intro; one warmup and one invocation per queued task within limits |
| Navigate away/dispose/retry repeatedly | No retained intro timers/listeners/audio nodes/subscriptions or late playback; unrelated borrowed media left alone |

For local media, use the existing clean static server with `SITE_ROOT` pointing at the repository and a new port. Example PowerShell: `$env:SITE_ROOT=(Get-Location).Path; $env:SITE_PORT='8881'; node tools/phase-08-server.mjs`. It is a loopback development server, not publication. Stop it and restore task-set environment variables when finished. The default Phase 8 artifact is frozen and will not reflect new source edits. Use a separate new artifact output for any build test; never overwrite a reviewed artifact.

Run `npm test`, `npm run check:site-html`, targeted lint and full `npm run lint` with an error delta. The baseline is 35 passing tests and 642 inherited lint errors; preserve all prior tests and introduce no new errors. Run the live worker probe and the affected browser matrix against the edited source. Smoke-check Start's worker path and Videos grid Skip/category/player/seek/volume/sync, and Games/Music shared controls if shared code changes. Observe actual root and local subpath behavior; do not claim production deployment acceptance from local tests.

Use verified 1280x720 and 390x844 CSS viewports, slow network/CPU cases and repeat cold/warm playback enough to expose intermittent ordering. Record run counts, completed clips, stalls/dropped frames and completion reasons. Do not invent an exact performance pass threshold without a baseline. Verify perceived soundtrack alignment with an audible recording or user-assisted listening; headless time advancement is weaker evidence. Do not claim physical mobile/Safari testing unless performed. Capture logs/screenshots or recordings and exact environment. Existing unrelated WebGL/lint/CDN failures stay labeled separately; a shell pass is insufficient.

## Step 7 Review and hand off

Review timer/event order, consent/gesture paths, range/cache failures, cancellation and exactly-once drop/preloads against the tests. Deliver `_8-tools-and-notes/videos-intro-repair-handoff.md` with cause/evidence, selective changed files, behavior before/after, tests and run counts, audio/frame measurements, inherited/new failures, rollback and every unfinished step. Link durable evidence. Update affected documentation only; do not mark older architecture gates complete merely because this intro repair passes. Stop without committing, pushing or deploying unless separately requested.

## Remaining work and stop conditions

All seven execution steps above remain pending: baseline reproduction; intro lifecycle; worker streaming; synchronized consent-aware audio; competing preloads/performance; full validation; review/handoff. This packet alone completes none of them.

The broader unfinished work remains: Phases 1/2 device/audio/Start/live-worker evidence; Phase 4 settings/lifecycle/dependency/CDN/IndexedDB/memory/lint acceptance; Phase 5 Start/Videos/Games ownership and interaction closure; Phase 6 Music/audio/save/preparation/timing/disposal; Phase 7 accessibility/fallback/device/motion/performance; Phase 8 verified inputs/licensing/committed reproduction/remote CI/full regression/review closure. Phases 2 and 3 completed their original gates, and there is no later numbered phase. The detailed prior checklist is `architecture-phases/phase-08-handoff.md`. Publishing/deployment is separate and remains unauthorized.

If an unavailable production asset, browser limitation or missing audible/device evidence blocks a gate, finish independent authorized repairs, preserve the failure evidence and list the exact unfinished check. Never label the overall task complete because the page shell loads or because a timer stopped reproducing in one run.
