# Phase 8 final handoff - Cleanup and release validation

**Status: INCOMPLETE acceptance gate, October 6, 2026.** Phase 8's bounded cleanup, CI/artifact/reproduction tooling, documentation, regression evidence, required Astra/High review and review fixes are delivered. Earlier implementation/device gates and reproduced runtime/hosting failures remain open. No later phase, publishing or deployment was started. Stop here.

**Model/effort:** Requested primary GPT-6.1 Sol / High; the session provides no independent primary-model introspection. The explicitly required separate reviewer was configured as GPT-6 Astra / High through `astra_final_review`. Its final report and addenda are `phase-08-final-review.md`; it edited only that report. New tooling findings R1-R3 and R4's provisioning wiring were corrected and reviewed. R4's external recovery/clean-checkout gate and inherited I1-I5 remain open; review completion is not release approval.

**Working-tree reference:** Starting and ending HEAD both **`add5dd6eae8c81c40d0052371bcd8a387f7c0385`**; no commit. `output/phase-08/starting-status.txt`, `starting-head.txt`, `ending-status.txt`, `ending-head.txt`, `protected-runtime-start.json` and `protected-runtime-final.json` record provenance. Of 109 protected runtime/config files, **108 are unchanged**. The only runtime-content change is the two image path cases in `index.html`; all prior JavaScript/scene/audio/settings/store code remains intact. Its pre-Phase-8 rollback copy matches the starting SHA-256.

## Deliverables and changes

| Files | Change and actual behavior |
| --- | --- |
| `.github/workflows/validation.yml` | Separate strict contract/artifact, lint and feasible browser jobs, verified provisioning and literal-reference gate; reports uploaded, no deployment job or lint waiver |
| `package.json`, `package-lock.json` | Exact dev-only @playwright/test 1.63.0; Node >=24.19.0/npm >=11 tooling requirement; added check/build/preview/browser and asset-hydration scripts. Runtime dependencies unchanged |
| `tools/release-artifact.json`, `release-artifact.mjs` | Explicit runtime site selection, required owners/manifests/generated files/vendor/license/GLBs/recorder/games; case/symlink/LFS guards; immutable new output and streaming per-file hash report |
| `tools/required-release-assets.json`, `hydrate-release-assets.mjs`, `fetch-test-assets.mjs` | Exact size/digest provisioning for real Hypersound and six retained video previews; bounded temporary downloads, verified exclusive copy, mismatched existing data preserved; bank-only helper retained |
| `tools/phase-08-server.mjs` | Loopback static artifact preview, no diagnostic/admin injection; artifact default, loopback Host/dot-path/realpath containment and byte ranges |
| `tools/phase-08-browser.mjs` | Strict bounded root/subpath shell/navigation/storage/motion/failure/settings matrix; records HTTP failures and fails missing local scripts/styles/fonts; negative missing-module sentinel |
| `tools/phase-08-references.mjs`, `phase-08-network.mjs`, `phase-08-worker.mjs` | Literal reference/cleanup evidence, HTTP/CORS/range sampling and real disposable classic-worker checks; limitations and failures retained |
| `tools/phase-08-artifact.test.mjs` | Three meaningful integrity/retention/LFS/stale-output/preview-host/hidden-path/junction/range regressions, retaining all 32 prior tests |
| `index.html` | Only `assets/SVG/mouse-LMB.svg` and `mouse_RMB.svg` corrected to exact lowercase `assets/svg/`; no image redesign, public route or scene logic change |
| `README.md`, `tools/VALIDATION.md`, `_8-tools-and-notes/README-GH-PAGES.md` | Current setup/test/debug/hosting/reproduction entry points replace stale paths and unsupported completion claims |
| `phase-08-release.md`, `phase-08-validation.md`, `phase-08-final-review.md`, this handoff | Actual module/dependency/settings/storage/hosting/rollback map, complete evidence, review disposition and all unfinished work |
| `phase-08-instructions.md`, `output/pdf/phases/phase-08-instructions.pdf` | **Revision 9**, INCOMPLETE status and current implementation/evidence/blockers; five PDF pages regenerated and visually checked. No prior gate/model/stop point changed |
| `output/phase-08/`, `tmp/phase-08/` | Durable reports/screenshots/final local artifact; scratch retains rollback copies and PDF QA. Superseded phase-created artifacts/reproduction trees removed after explicit resolved-path checks |

Architecture document basenames above are in `_8-tools-and-notes/architecture-phases/`. Full exact runtime module map and Phase 3 proposal-versus-implementation reconciliation are in `phase-08-release.md`. Phase 1-7 instructions/handoffs and Phase 3 design remain historical; no later numbered instructions exist to update.

**Final candidate artifact:** `output/phase-08/artifact/site/`, final generation v3 relocated locally to the canonical path. **1,041 files / 1,360,297,403 bytes**. `artifact-built.json` lists every path/length/SHA-256; `artifact-final-verify.json` rehashed all 1,041 successfully. It includes both runtime manifests, prepared HTML/import maps/config, actual new shared/Music modules, local GLBs, synth code/companions/licenses, recorder/transcription, generated games, attribution and six static video alternatives. Tools/tests/fixtures/source art/local utilities/evidence are excluded. Other external media remain separately required. This artifact is reviewable, **not release-approved or deployed**.

## Inherited changes and cleanup

All inherited dirty/untracked paths in starting-status are preserved, including user Start styling, About/Docs work, video filters, debug panels, shared Phase 4 modules, partial Phase 5/6 entries, Phase 7 presentation/Graphics changes, vendor/game assets, source art, media and local tools. Existing package/index/document edits were isolated against pre-phase copies/hash records; a full Git diff must not be attributed solely to Phase 8.

No uncertain legacy source was deleted or archived. Recorder/transcription, Start alternative, old Music copies and public facades were traced and retained because active or external use remains possible. Invalid Videos font/KUTE plugin, diagnostic controls and unproven alternatives remain investigation candidates. Artifact exclusion separates development contents without deleting originals or deciding licensing rights.

Only Phase 8-created superseded `output/phase-08/artifact/` generation v1, `artifact-v2/`, disposable `tmp/phase-08/clean-source/` and `worker-site/` copies were removed, then v3 was moved into the canonical artifact directory. `removed-generated-trees.json` records exact resolved paths; all were checked inside Phase 8 workspace subtrees before deletion/move. Original assets, reports/screenshots, existing evidence and rollback backups remain. Temporary browser contexts were disposed and local servers stopped. Nothing was pushed or published.

## APIs, defaults, keys, events and URLs

Phase 8 adds developer commands/tooling only and corrects the two invalid image-case URLs above. Public page URLs, entry query versions, storage schema/keys, media actions, consent events and playback/scene defaults remain. No user profile/preferences/cookies/IndexedDB selections were cleared or migrated.

Preserve canonical per-field precedence and valid zero/false, volume 0.25 and sync -270 ms when absent; Start missing lighting 0.5 versus shared fallback 1. Consent remains independent under `site_audio_allowed`/`site.audio.allowed` and `audioConsentChanged`; sync/lighting bridge events stay. IndexedDB `site-soundfonts` v1 infrastructure, placeholder IDs, decimal 250 MB accounting and unimplemented independent 128 MiB preparation remain as documented, not accepted capacities/readiness. Save/saved-byte loader/preparation APIs are still absent. Three 0.159.0 is still candidate-under-review; exact decoder/backend/loading limitations are in the release map.

## Exact validation and review result

See `phase-08-validation.md` for all commands, environment, scope, screenshots and differences from Phase 1. Durable evidence is under `output/phase-08/`.

- **35/35 unit/contract tests pass**, all prior 32 retained; generated HTML/import-map/worker check passes.
- Full lint **exits 1: 642 errors, 0 warnings, zero new tooling errors**. Delta 0 versus Phase 7, -40 versus Phase 1. No gate waiver.
- Artifact/reference checks pass in their scope: **269 literal references, 0 missing/case**, 1,041 final hashes match. Two true image-case defects fixed; nine commented-out SVG references were correctly excluded rather than treated as live failures.
- Final root and local `/portfolio/` browser runs each **52/58 pass**, process **exit 1**. Normal/no-JS desktop/narrow, blocked storage getters, reduced-motion class and no-uncaught failed-GLB probes pass. Six WebGL failures persist, with Music TDZ. Settings zero/false/cross-tab/0.37 reload/Reset-to-0.25/denied-consent preservation and the deliberate module-404 harness sentinel pass.
- Six packaged video alternatives return **12/12 local root/subpath HEAD 200**. This is link availability, not audio or complete interaction parity.
- Real worker **4/6 pass**, process **exit 1**: owned-cache install/upgrade/full offline/query hit and both misses pass; cold online Range fails fetch, warm offline Range returns full 200 without Content-Range.
- HTTP/CORS/range sampling **16/32 pass**; production card-test GLB/Hypersound return404; production-origin four other sampled HEAD/ranges pass; localhost CORS unsupported. Separate provisioning probes **5/7 pass**: bank404 and CDN music-video length differs from candidate. No full remote digest or production playback pass.
- Seven local provisioning inputs validate exact hashes/bytes. Isolated missing-bank recovery **exits 1 on HTTP404**, preserving/restoring only its temporary snapshot bank. Fresh isolated npm install (127 packages), **35 tests**, generated and artifact checks pass with explicitly supplied local assets. **Clean committed-checkout/external recovery/remote CI remain incomplete**; the snapshot was removed after evidence retention.
- Tracked whitespace check passes, with inherited line-ending notices. Revision9 PDF has five visually verified pages/current end marker; Markdown is authoritative. Approved source-asset read escalation resolved sandbox setup failures; no unresolved approval rejection exists.
- Required Astra/High final review complete. R1 missing-module predicate, R2 relative-reference/CI coverage, R3 preview containment and R4 provisioning wiring are corrected with review/negative regression evidence. External recovery/version identity/clean Git, worker, WebGL, lifecycle/storage/preparation, lint/device/accessibility/compatibility findings remain open.

No audible first-note/reference, physical-mobile, complete playback/record/transcription, screen-reader or counted-lifecycle gate was claimed. Phase 7's Graphics improvement remains bounded historical evidence. Failure-free page shells do not establish usable playback/fallback parity.

## Known release blockers

1. Six unavailable-WebGL constructor failures plus Music's early `instrumentPickerEl` reference.
2. Worker cold online partial response cannot cache and is converted to network failure; cached offline range is full200 instead of206.
3. CDN `/glb/card-test.glb` and `/soundfonts/hypersound/hypersound.sf2`404; `/Videos/videos-page/music-videos-hq.webm` CDN74,364,825 bytes versus candidate74,213,638. Resolve hosting/version/integrity deliberately without silently altering URLs/pins/baselines. No production change is authorized here.
4. Full earlier lifetime/page/music/backend/save/readiness work is missing or unaccepted; browser IDB/quota/staging and independent memory gates are unproven.
5. Lint642; full accessibility/device/scene-motion/media/dependency/backend/alternative/link/licensing and clean committed-source/CI acceptance remain open.

## Rollback of Phase 8 only

Review later edits before restoring. `tmp/phase-08/` retains original `package.json`, `package-lock.json`, `VALIDATION.md`, `README-GH-PAGES.md`, `index.before.html`, `phase-08-instructions.before.md` and matching `.pdf`. Restore only the corresponding paths/hunks; the index copy matches its starting hash and preserves every earlier HTML change. Remove only this phase's new tools/config/workflow/README if reverting. Keep documentation/evidence of unmet gates when reverting code. Restore the prior lockfile coherently and reinstall only in the intended developer environment.

Do not reset/clean the dirty repository, recursively remove original assets, restore whole inherited diffs or clear preferences/cookies/IndexedDB/saved selections/unrelated caches. Generated scratch/artifacts can be recreated from reviewed inputs. No live data/hosting migration needs rollback. Future separately authorized release rollback must preserve a coherent prior code/config/dependency/asset set and old versions used by saved selections; details are in `phase-08-release.md`.

## Every unfinished phase or step

**No later numbered implementation phase exists. Phases 2 and 3 completed their original correctness/design gates; their fixes/design are retained. The following earlier evidence, implementation and Phase 8 acceptance steps remain unfinished.**

### Phase 1 evidence and Phase 2 live-worker/media closure

1. **Open — device and audible evidence.** Obtain physical-device/audible reference and justified first-note/network-cold/warm timing evidence, plus screen-reader/mobile/device results beyond durable emulation. Reuse the saved desktop/narrow screenshots and bounded storage/no-JS evidence unless source changes require new captures. Existing headless runs explicitly did not verify audible output or physical devices.
2. **Partial — Start UI persistence.** Complete saved-volume reload plus visible Save/Reset and animation-prompt behavior checks. Phase 8's shared-store zero/false, cross-tab, 0.37 reload, Reset-to-0.25 and consent-preservation checks pass, but they do not establish the complete Start UI Save/Reset and prompt behavior. Phase 7 also records that the prompt reappeared and the slider changed from 26 to 25 after reload; cause remains unverified.
3. **Partial — live worker and decoded media.** Focused repair evidence in `output/videos-intro/worker.json` passes 6/6 in a disposable local real-worker browser for install/owned-cache upgrade, online 206, complete cache/offline hit, cached 206, unrelated miss and matching empty-cache miss. Unit coverage also simulates cache-write failure. This does not close the production/live acceptance: Phase 8's packaged worker run remains 4/6, with cold online Range failing fetch and warm offline Range returning full 200 without `Content-Range`; production decoded playback, origin/query coverage, custom base/subpath, CORS/CORP and offline decoded media remain open. Do not repeat focused local checks without source changes; repair the newly reproduced gate first, then run the smallest relevant live matrix.


### Phase 4 acceptance closure

1. Complete settings/consent Save/Reset/reload, blocked cookies/reads/writes/removes, conflict/retry/discard/clear/focus and every output-path denial/revocation gate beyond the passing bounded two-tab case; preserve zero/false and independent consent.
2. Prove resource-counted mount/dispose/remount/BFCache, late async and owned/borrowed media/listener/timer/audio/GPU cleanup and active replacement across affected routes.
3. Complete Three0.159 candidate versus Start0.158/Docs0.160 comparisons across all GLBs/materials/lighting/cameras/Draco/Meshopt/RoomEnvironment/PMREM/CSS3D/video textures/controls and supported devices; establish final decoder/backend pins/support or amend the decision with evidence.
4. Resolve required production CDN keys/version mismatch, then real browser CORS/CORP/ranges/alternative assets and worker install/upgrade/offline/root/genuine hosted-subpath/custom-base limitations.
5. Run actual browser IndexedDB save/dedup/atomicity/cancellation/quota/reservation renewal/concurrency/crash recovery/version repair/replacement/removal/eviction/reload cases and representative large-bank hash/staging/peak-memory gates.
6. Reconcile lint642 in maintained owned files and keep all earlier compatibility/storage/media contracts passing.

### Phase 5 - Finish Start, Videos and Games

1. Finish Start scene/controller/camera/calibration/accessibility/debug ownership, animation-then-sound/settings/Save/Reset/fallback/media interactions and constructor recovery, preserving authored timing/look/missing0.5/saved0.
2. Prove repeated counted cleanup/remount/BFCache, late loader/timer/dialog cancellation and owned media/WebAudio/GPU release.
3. Finish Videos content/session/transport/preview/tablet orchestration, explicit page/shared-UI disposal and complete controls, retaining repaired narrow Skip placement.
4. Finish Games scene/reel/session/camera/layout/generated-game bridges, input/audio/iframe focus/keyboard return/nonvideo capabilities/Home-End redraw and audio alignment.
5. Verify borrowed replacement, adapter DPR/coordinates, drag/pointer-lock/preview cancellation, seek/rate/pitch/volume/sync/consent and complete browser/device page baselines; update ownership handoff/docs/PDFs after completion.

### Phase 6 - Finish Music

1. Capture audible reference/first-note and device tolerances before remaining timing-sensitive extraction; existing software1,200ms lead is not perceptual acceptance.
2. Finish backend/load-generation/late async ownership after the delivered catalog/raw helper extraction.
3. Extract/own synth/audio graph/live voices/session/mixer/MIDI/transport while preserving unlock/sustain/release/overlap/trim/sync/rate semantics.
4. Extract scene/hit testing/keyboard/panels; repair WebGL/initialization-order failure and retain the functioning separate recorder/transcription boundary.
5. Gate remaining diagnostics; dispose voices/buffers/leases/timers/listeners/media/GPU/decoders and prove revocation/BFCache/remount/late-load cleanup without stuck notes.
6. Map fixed/dynamic/custom package/version identities and intentionally resolve Dog's missing DOGBW60/program0 fallback; wire explicit Save/usage/removal and saved JS/SF2 loading with CSP/network/backend fallback and all browser store gates. Ordinary play/preparation must not opt into saving.
7. Implement measured independent RAM ledger/all-requested preparation readiness/leases/progress/cancellation/context-version-consent invalidation/unsupported-bank behavior; no substituted recorder or unprofiled AudioWorklet redesign.
8. Measure network-cold/saved-raw/prepared first note/readiness and shared-SF2/decoded/backend/staging peak memory, oversize/independent disk-RAM limits and eviction/removal while protecting active/prepared leases.
9. Repeat all supported audio/MIDI/failure/switching/sustain/overlap/nonzero-sync/rates/long-run-drift/video/real recorded notes/replay/transcription/lifecycle/device cases after each extraction; retain rollback checkpoints and update handoff/docs/PDFs.

### Phase 7 - Close presentation and performance acceptance

1. Complete keyboard parity for canvas menus/piano/cards/all dialogs, screen-reader/contrast/zoom/320px/physical touch and focus-return coverage; alternatives alone are not interaction parity.
2. Close six WebGL failures and complete failed-asset/denied-audio/cookie-storage and usable fallback cases; validate every scene's reduced-motion behavior.
3. Compare later structural changes against durable desktop/narrow references, preserving lights/materials/camera constants/Start sound dialog and Skip/navigation placement.
4. Measure remaining load/long-task/offscreen/media-startup/retained-resource costs before optimizing, then repeat comparable browser/cache/device cases without harming audio timing; Graphics idle draws alone do not close them.
5. Complete dependent cold/saved/prepared/shared-bank/removal/eviction/lease and disk/RAM cases after Phase6 exists; reconcile final evidence/instructions/PDFs/handoff.

### Phase 8 - Finish release acceptance after prerequisites

1. Recover verified external inputs (bank/card404 and music-video version/size/digest), finish all other dynamic/vendor/generated-game/alternative reference and attribution/licensing checks; remove only additional files proven unused by both tracing/runtime evidence.
2. Capture a complete coherent committed candidate with hydrated LFS/non-Git inputs, run clean-checkout installation/provisioning/tests/artifact reproduction and remote CI; confirm all required runtime/dependency metadata/companions/licenses and development exclusions. Current working-tree snapshot is not this gate.
3. Re-run full seven-route plus generated-games/recorder playback/settings/consent/keyboard/mobile/failed-assets/WebGL/Music timing/storage/readiness and local/production/root/hosted-subpath/CORS/CORP/range/offline worker matrix after owning-phase fixes. Recover or explicitly disposition every older gap against its gate, without unsupported pass claims.
4. Close lint, all material open review findings, full device/backend/Three-version support and cold/disk/RAM/performance gates; update final module/dependency/release/rollback evidence and instruction/PDF revision coherently.
5. Obtain final review of the completed candidate/remaining fixes, close acceptance only when all required gates pass, and write the final complete handoff. This attempt's review and tooling fixes are finished; do not repeat unchanged checks without new changes or unresolved concerns.

**Deployment/publication remains a separate, unauthorized action after the release gate closes. This Phase 8 attempt stops with the INCOMPLETE handoff; it does not authorize starting earlier-phase completion, publishing, pushing or changing production hosting.**
