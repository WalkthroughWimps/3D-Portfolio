# Phase 8 final architecture and regression-risk review

October 6, 2026. **Verdict: INCOMPLETE release gate. Do not deploy.** The dedicated final reviewer was assigned the requested **GPT-6 Astra / High** configuration. This review does not independently attest the model through a runtime introspection API.

The review covers Phase 8 CI, artifact selection/building, static preview, browser/reference/network/worker tools, dependency/lockfile changes, release documentation and their interaction with actual runtime contracts. All Phase 1-7 handoffs, Phase 7 validation, current Phase 8 instructions and release reference were read. The reviewer edited only this report. Earlier-phase implementation failures were not fixed or waived. The primary agent separately corrected the new tooling findings below and two verified `assets/SVG` versus `assets/svg` references in Start HTML; that narrow asset-case correction must be identified in the final handoff rather than claiming every runtime file is byte-identical.

## Evidence and limits

- Final local and isolated-snapshot suites each have **35 passing tests**, zero failures/skips/cancellations, with all 32 prior tests retained. The final preview containment test passes. Lint remains 642 inherited errors, zero warnings; no clean lint or baseline waiver is claimed.
- Final strict root and genuine local `/portfolio/` browser runs each record **58 bounded cases: 52 passes and six unavailable-WebGL failures**, including Music's additional initialization error. Each missing-script sentinel and settings migration/zero/false/reset/reload/other-tab case passes. These supersede the initial 57-case runs. They are disposable Windows Chrome 154.0.8037.98 contexts, denied audio, software WebGL and verified desktop/narrow CSS viewports; workers were blocked. They are not physical-mobile, audible-playback, full accessibility, production or full lifecycle evidence.
- Artifact v1 contained 1,035 files / 971,887,168 bytes. The primary agent found six site-relative no-JavaScript Videos links whose files had been excluded as external media. The final **v3 artifact has 1,041 files / 1,360,297,403 bytes** under `output/phase-08/artifact-v3/site`, retaining those videos and the two image-case corrections. Root/subpath HEAD checks for the six alternatives pass 12/12. Their video sound remains separate; a HEAD pass does not establish parity or playback. Earlier artifacts are preserved rather than overwritten.
- The corrected reference scanner reports 269 literal references, zero missing references and zero case mismatches. This excludes HTML comments and still has an explicit limited scope: dynamic paths, vendor/generated-game internals, external public users and playback are not established by this result.
- Network evidence has 32 bounded probes, 16 passes. The production-origin probes succeed for the other four sampled keys; `glb/card-test.glb` and `soundfonts/hypersound/hypersound.sf2` return 404 under both sampled request origins. Local preview origins do not satisfy the sampled production-only CORS policy. Header probes are not browser playback/CORP/offline acceptance.
- Real disposable classic-worker checks establish local install/activation, deletion of owned old intro caches, retention of an unrelated cache, a query-insensitive offline full-cache hit and offline misses. Both cached-range and online empty-cache range behavior fail, as detailed below. Production worker behavior, genuine hosted subpaths and decoded media playback remain unverified.
- A fresh `npm ci --ignore-scripts` in an isolated working-tree snapshot installed 127 packages. This is installation evidence, not clean committed-checkout reproduction: inherited modules/documents are uncommitted, and required ignored media are not restored by Git/LFS checkout. CI has not run remotely.
- Actual asset/settings/store sources agree with the documented key precedence, 0.25 volume / -270 ms sync defaults, separate consent, placeholder soundfont selections and missing preparation integration. Thin bootstrap/scope hooks do not establish whole-page ownership. Three 0.159.0 remains a candidate, not a completed compatibility gate.

## New Phase 8 findings and disposition

### R1 — P2 — Normal browser cases could pass with a missing main module

**Location:** `tools/phase-08-browser.mjs:43` (current corrected predicate; initial defect was the pass expression at the same stage).

The initial predicate used landmarks/title/description and absence of `pageerror`, while ignoring failed HTTP requests. In an independent disposable Chrome negative probe, the Graphics main module was fulfilled with HTTP 404: `errors=[]`, the response list contained `graphics.js` 404, and the original normal predicate returned true. A failed module load need not produce an uncaught page exception, so this could let a packaging regression pass CI.

**Disposition: RESOLVED within scope.** Source correction reviewed: request/response records include resource type; same-origin script, stylesheet and font failures now participate in failure. An independent repeat of the missing-Graphics-module negative probe records that 404 as a required local script failure and the corrected resource gate returns false. The final root/subpath matrices now include a passing missing-script sentinel, using the same classifier. External media and intentional GLB failure injection remain separately reported. A bounded shell pass still must not be promoted to successful scene/audio initialization.

### R2 — P2 — Reference validation skipped ordinary relative URLs and was absent from CI

**Location:** `tools/phase-08-references.mjs:14`; `.github/workflows/validation.yml:24`.

The original filter discarded bare relative paths such as `graphics.js`, `music.css` and `music-2d.html`, all of which are actual runtime references. It therefore missed entry scripts, styles and the retained recorder link while reporting zero missing paths. CI did not invoke the reference checker. Expanding the scan initially also counted a commented-out Music SVG block as live references.

**Disposition: RESOLVED within scope.** Corrected source now resolves bare HTML/CSS paths, retains import-map semantics for bare JavaScript specifiers, strips HTML comments and runs the checker in the contract job. The final observed report is 269/0/0. Two actual Start image-case mismatches discovered by the stronger scanner were corrected by the primary agent. This resolves the identified scanner/CI defect within its documented scope; it is not a complete dependency graph.

### R3 — P2 — Preview default exposed repository metadata and lacked resolved-path confinement

**Location:** `tools/phase-08-server.mjs:15` and CLI root selection near the end of the file.

Initially `npm run preview:artifact` defaulted to the repository root; a read-only `HEAD /.git/config` returned 200. The server accepted arbitrary Host values in source and checked only lexical path containment before following filesystem links. Loopback binding alone is not a sufficient file-serving boundary.

**Disposition: RESOLVED within scope.** The primary agent changed the default to the artifact root, rejects non-loopback Host values and dot segments, and checks resolved realpaths. Independent post-fix checks returned 403 for `/.git/config`, 403 for an actual `node:http` request with `Host: review.invalid`, 200 for a valid loopback-host page and 206 with a 64-byte Content-Length for `bytes=0-63`. The added focused regression also covers an escaping directory junction and passes in both final 35-test suites. No secret file contents were read by the review probes.

### R4 — P1 — Clean CI recovery remains blocked after provisioning wiring was corrected

**Location:** `tools/release-artifact.json:7`; `tools/required-release-assets.json:5`; `tools/hydrate-release-assets.mjs:15`; `.github/workflows/validation.yml:21` and `:59`.

Preserving the six site-relative Videos alternatives fixes the local packaging omission, but those files live under ignored `Videos/` and are not made available by `actions/checkout` with LFS. Initially the hydration tool covered only Hypersound, and the browser job had no hydration step. The reviewer confirmed `git ls-files` returns no entry for any of the six videos or the bank. A local snapshot containing ignored files does not close clean recovery.

**Provisioning-code disposition: CORRECTED.** The primary agent added a seven-input manifest and streaming `hydrate:assets` command, now called before tests/build in both relevant CI jobs. The reviewer read the new code and independently compared all seven byte lengths/digests with the runtime bank manifest or final artifact records: every entry matches. Existing files are verified without rewrites; missing-file downloads have an expected-size bound, digest check, exclusive destination copy and scratch cleanup. `output/phase-08/hydration.txt` records successful verification of all seven existing local files. The legacy single-bank command remains available but is no longer the CI provisioning path.

**Acceptance disposition: OPEN, externally blocked.** The Hypersound CDN source still returns 404, and a clean download of all pinned inputs has not been demonstrated. Restore/verify exact external bytes, then test this command and all checks from the complete committed candidate and run CI remotely. Do not synthesize the real-bank fixture, omit the six alternatives, skip tests or call this solved by local verification. The new workflow wiring defect is corrected; external availability and true clean-checkout evidence remain release blockers.

## Inherited release blockers reproduced or confirmed

### I1 — P1 — Intro worker mishandles both cached and uncached range requests

**Location:** `sw.js:55` and `sw.js:58`.

For an offline cached `Range: bytes=0-63` request, the worker returns the entire 9,380,850-byte intro with status 200 and no Content-Range. More seriously, with a real worker active, its intro cache deleted in a disposable context and the browser still online, the same range request rejects with `TypeError: Failed to fetch`; a direct request to the same static server returns 206 and 64 bytes. The worker treats a successful 206 response as cacheable, `cache.put` rejects the partial response, and the surrounding catch converts the successful network response into `Response.error()`.

**Required closure:** In the owning earlier phase, separate cache-write failures from network delivery and implement/verify the intended full-response/range strategy. Cover cold/warm, online/offline, satisfiable/unsatisfiable ranges, query matching, upgrade and cache ownership in actual browsers, then establish decoded playback on production hosting. The current Phase 8 scope must retain this failure rather than silently change worker semantics.

### I2 — P1 — Six routes still fail unavailable-WebGL entry; Music adds a TDZ error

**Locations:** `_0-start/start-page.js:761`, `_1-about/about.js:12`, `_2-videos/videos.js:510`, `_4-games/games.js:436`, `_5-music/music-piano-controls.v2.js:128`, `_6-docs/docs-3d.js:14`; Music's early `instrumentPickerEl` access is at `:48`, before its `let` at `:1272`.

Root and subpath evidence reproduce renderer-construction errors on these six routes; Music additionally reports `Cannot access 'instrumentPickerEl' before initialization`. Graphics alone has the guarded renderer path. Static HTML remaining visible does not mean the page's fallback initialization is healthy.

**Required closure:** Finish owning-phase constructor/load-failure recovery and usable keyboard fallback, including Music initialization order; rerun failed-WebGL/GLB, denied audio, blocked storage and full interaction cases after the fixes. No runtime fix was made by this reviewer.

### I3 — P1 — Required production assets are unavailable

**Locations:** `_3-graphics/graphics.js` card-model resolution, `data/soundfont-packages.json:18`, and `output/phase-08/network.json`.

Production CDN card-test GLB and Hypersound requests return 404. Local GLB inclusion cannot repair a production resolver that maps to the CDN key; the bank failure also blocks clean fixture hydration. Successful HEAD/range on other sampled files is not evidence that these missing inputs work. Production-only CORS is also incompatible with arbitrary local-preview CDN use.

**Required closure:** Restore or deliberately reconcile the exact production keys and integrity metadata, then prove real browser CORS/CORP/range and alternative-link behavior at approved root/subpath origins. Publishing or changing production hosting was not authorized during this phase.

### I4 — P1 — Planned lifetime, storage and preparation contracts remain unimplemented or unaccepted

**Locations:** `data/soundfont-packages.json:17`, `_7-shared-scripts/storage/soundfont-store.js:143`, `_5-music/instruments/loader.js`, and the Phase 4-7 handoffs.

The four-bank save manifest still uses placeholder instrument identities; live saved-byte loading/Save management and `prepareForRecording` readiness/lease integration do not exist. Full-ArrayBuffer hash staging and actual IndexedDB quota/concurrency/version behavior lack the device gate. Start is only partly extracted; Videos/Games page orchestration and ownership, and most Music backend/audio/scene ownership, are unfinished. Bounded helpers and a passing unit suite cannot establish disposal, memory limits or recording readiness.

**Required closure:** Complete the earlier-phase work and its acceptance evidence below. Preserve independent 250,000,000-byte disk and provisional 128 MiB preparation limits; no implicit persistence or consent grant, no substitute recorder or unprofiled AudioWorklet expansion.

### I5 — P2 — Maintained-source lint and device/accessibility/dependency gates remain failing or unverified

**Location:** `output/phase-08/lint.json`, Phase 4-7 handoffs and `tools/VALIDATION.md` required release matrix.

The 642-error lint gate is still failing. Three/decoder/backend adoption, physical touch/mobile/audio, audible reference/first-note tolerances, screen-reader/contrast/zoom and full keyboard parity have not passed. Graphics' measured idle-draw improvement has a valid bounded scope and cannot close those other gates. No new Phase 8 lint waiver or unsupported release-readiness claim was found in the reviewed documents.

## All remaining phases and steps

1. **Earlier Phases 1/2 evidence and Phase 4 acceptance:** recover physical-device audible references and timing; finish settings/consent Save/Reset, blocked-cookie/write, retry/conflict/reload cases beyond the passing bounded settings scenario; prove resource-counted mounts/remounts/BFCache and late async cleanup; complete Three 0.159 versus prior Start/Docs versions, all GLB/material/lighting/Draco/Meshopt/RoomEnvironment/PMREM/CSS3D/video-texture/backend comparisons; resolve CDN keys and actual browser root/hosted-subpath/custom-base/range/offline worker gates; run real IndexedDB atomicity, reservation/concurrency, cancellation, dedup/version/eviction/removal/reload/quota and large-bank staging/memory checks; reconcile lint. Completed Phase 2 correctness and Phase 3 design work need no wholesale repetition.
2. **Phase 5:** finish Start scene/camera/calibration/accessibility/debug ownership and all prompts/settings/fallback/media interactions; prove repeated counted disposal, pending-loader/timer/dialog cancellation and BFCache; finish Videos session/content/transport/preview/tablet and shared-UI disposal; finish Games scene/reel/session/camera/layout/generated-game bridge, focus and keyboard return; verify replacement, DPR/coordinates, preview cancellation, seek/rate/pitch/volume/sync and Home/End audio alignment. Complete each page's browser/device acceptance and update handoff/documents.
3. **Phase 6:** obtain audible first-note/reference recordings and justified timing tolerances before timing-sensitive extraction; finish backend/load-generation, audio graph/live-note/session/mixer/MIDI and scene/input/panel ownership; repair initialization failures and prove consent revocation, late loads and voice/buffer/media/GPU/decoder cleanup; map fixed/dynamic identities/versions and intentionally resolve the Dog preset mismatch; wire explicit Save/usage/removal and saved JS/SF2/CSP/fallback; implement measured independent RAM accounting, truthful all-requested readiness, leases/progress/cancellation and version/context/consent invalidation; compare cold/saved-raw/prepared timing and shared-bank/backend peak memory; repeat audio/MIDI/sustain/overlap/switching/failure/nonzero-sync/rate/long-run drift/video/real recorder/transcription/lifecycle gates and update handoffs.
4. **Phase 7:** close six WebGL and complete failed-asset fallback gates; finish canvas-menu/piano/card keyboard parity and all dialogs, screen-reader/contrast/zoom/320px/physical-touch and reduced-motion coverage; compare later structural work against durable desktop/narrow references while preserving authored lighting/materials/cameras; measure remaining load/long-task/offscreen/media/retained-resource costs before further optimization; complete dependent cold/saved/prepared, shared-SF2/eviction/removal/lease and disk/RAM checks after Phase 6 exists; update validation and handoff. Retain the already delivered navigation, consent and Graphics improvements.
5. **Phase 8:** preserve the completed final strict tooling evidence and rerun affected cases after future fixes; hydrate all required non-Git inputs, reproduce from the complete committed candidate and run CI; finish dynamic/vendor/generated-game/alternative reference and licensing/attribution review without speculative deletion; complete the full route plus recorder regression matrix and production-like asset/worker/dependency checks; resolve all material open review findings and earlier gates; finish the final validation/handoff reconciliation with exact artifact identity, instruction/PDF revision and rollback instructions. Current working-tree installation, partial browser passes and this review do not satisfy release acceptance.
6. **Deployment:** no later numbered implementation phase exists. Publishing/deployment is a separate action requiring separate user authorization after the unresolved release gates are closed. No deployment occurred during this review.

## Final evidence addendum

The reviewer read `output/phase-08/tests.txt` and `clean-tests.txt`: **35 tests pass in each**, zero failures/skips/cancellations, including the new loopback-host/hidden-file/junction/range regression. The isolated snapshot explicitly received local bank/media files; it is not clean-Git evidence. Final `browser-final/results.json` and `browser-subpath-final/results.json` each have **58 cases, 52 passing and six failing**, with passing missing-script sentinels and settings cases. Normal/no-JavaScript each pass 14/14; blocked-storage, reduced-motion-class and failed-GLB/no-uncaught-error each pass 7/7; unavailable-WebGL passes only Graphics, 1/7. Both processes correctly exit nonzero. The sentinel's intentionally failed resource is expected and separately labeled.

The reviewer also read the final v3 artifact inventory, 269/0/0 reference results, 12/12 local alternative-link HEADs, final 642-error/zero-warning lint report, and the final worker report (**4/6 pass**, both exact range failures retained). `protected-runtime-final.json` records **108 of 109 protected files unchanged**, with only the two Start image path-case edits in `index.html`; the rollback copy matches its starting hash. Revision 9 of the Phase 8 instructions explicitly retains INCOMPLETE status. The primary agent reports the corresponding five-page PDF regenerated and visually verified; this reviewer did not independently perform PDF visual QA. The subsequent seven-input hydration-tool/CI correction was source-reviewed, metadata-compared and locally verified as described under R4; it changes no runtime artifact or browser result.

R1-R3 and R4's provisioning wiring are closed on source review and bounded evidence. **R4's external recovery/clean-checkout acceptance and I1-I5 remain open.** The primary agent is completing the final validation/handoff documents; their completion does not waive any release gate. Final review is complete, release acceptance is not.

### Subsequent provisioning evidence — R4/I3 remain blocked

The reviewer read `output/phase-08/provision-source-probes.json`: production-Origin HEAD/length/CORS probes pass **5/7**. Hypersound remains HTTP 404. `Videos/videos-page/music-videos-hq.webm` returns HTTP 200 but advertises **74,364,825 bytes**, whereas the locally verified candidate manifest/artifact pins **74,213,638 bytes**. HTTP 200 therefore does not establish recovery of the intended asset version. The other five matching lengths are only HEAD evidence; downloaded digest verification remains required.

This extends **R4's input-recovery blocker and I3's production-source blocker**: restore or deliberately reconcile the intended source version and exact digest for the music-videos file as well as the missing Hypersound/card-test keys. Preserve the current candidate's pinned hashes/bytes until that version decision is made; do not silently accept the larger CDN object or update the manifest to make hydration pass. Remaining Phase 8 clean-checkout/CI gates include successful full integrity-checked recovery of all seven required inputs after these discrepancies are resolved.

`output/phase-08/clean-missing-bank.txt` initially reproduced HTTP 404 in the isolated snapshot after its bank was removed. The initial uncaught error was followed by a Windows/Node libuv shutdown assertion. The reviewer read the subsequent hydrator correction: it cancels a rejected response body, catches the operational error and sets `process.exitCode=1`. The final rerun result and artifact relocation will be recorded below when confirmed; source inspection alone does not establish clean error-exit behavior.

### Final confirmation and canonical artifact location

The corrected `clean-missing-bank.txt` now records only the expected `Required asset HTTP 404` failure, without the earlier Node/libuv assertion; the primary agent reports exit code **1**. This confirms graceful failure reporting, not successful recovery. The CDN music-video version mismatch and Hypersound 404 remain open under R4/I3.

The final v3 content now resides at **`output/phase-08/artifact/site`**. This supersedes every earlier `artifact-v3/site` location reference in this review. The reviewer read the updated build manifest and `artifact-final-verify.json`: **1,041 of 1,041 file hashes match**, total **1,360,297,403 bytes**. Relocation changed no candidate bytes.

Earlier statements that old artifact directories are preserved describe the intermediate review state and are now superseded: the primary agent removed only the phase-created superseded artifact/reproduction trees recorded in `output/phase-08/removed-generated-trees.json`. Original assets, backups, reports and screenshots remain, and the primary agent reports that its local preview servers are stopped. The full remaining-phase list above still applies, including integrity-checked external recovery of the intended versions and true clean-checkout/remote-CI evidence. **Final verdict remains INCOMPLETE; deployment was not authorized or performed.**
