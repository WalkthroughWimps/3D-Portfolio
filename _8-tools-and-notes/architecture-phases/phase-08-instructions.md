# Phase 8 Clean up and validate the release

Model: GPT-6.1 Sol | Reasoning: High | Complexity: Medium with high impact review

Revision 9 | October 6, 2026 | Status: INCOMPLETE acceptance gate; tooling and bounded validation delivered

## Phase launch instruction

Execute Phase 8 only: Clean up and validate the release. Use GPT-6.1 Sol with High reasoning. Read this entire document, current repository instructions, and all prior handoffs. Complete the instructions and acceptance gate, write _8-tools-and-notes/architecture-phases/phase-08-handoff.md, report remaining work, then stop. Do not deploy.

## Required context

Read all available phase-01 through phase-07 handoffs, especially phase-07-handoff.md. If a prerequisite gate is incomplete, resolve or report it before dependent work. Read every phase handoff and verify that required gates passed. Use GPT-6 Astra at High for a final architecture and regression-risk review.

## Instructions

### Phase 8 attempt and release inputs

Phase 8 has delivered explicit packaging, strict CI jobs, a loopback-only artifact preview, reference/network/browser/worker tooling, current module/dependency/setup/hosting/rollback documentation and an Astra/High review. Read `phase-08-handoff.md`, `phase-08-validation.md`, `phase-08-release.md` and `phase-08-final-review.md` before continuing. Final local artifact evidence is under `output/phase-08/`; candidate packaging is not publishing or release approval. Phase 8 remains **INCOMPLETE** because prior acceptance and current regression gates fail.

Keep all 32 prior tests plus three Phase 8 integrity/preview tests. Lint still has 642 inherited errors. The artifact retains manifests/generated HTML/worker config, actual shared modules, GLBs, required synth files/licenses, public alternatives, generated games and the six site-relative Videos previews; tools/evidence/source art are excluded. No uncertain legacy source was removed. Two Start image references were corrected from `assets/SVG/` to exact `assets/svg/`; scene/audio logic and public route/key/event contracts remain unchanged.

New release evidence includes CDN 404s for `glb/card-test.glb` and `soundfonts/hypersound/hypersound.sf2`, plus a `Videos/videos-page/music-videos-hq.webm` payload-size mismatch (local candidate 74,213,638 bytes; CDN 74,364,825). Reconcile that version/integrity difference before changing the pinned recovery manifest. Sampled CORS allows the production site origin but not arbitrary local previews. Browser probes still reproduce six unavailable-WebGL failures and Music's `instrumentPickerEl` initialization error. The real local intro worker passes bounded install/upgrade/offline hit/miss/cache ownership, but an online Range request with empty cache fails because a 206 response cannot be cached, and a cached offline Range request returns the full 200 response. These are required Phase 2/4 release corrections, not successful offline media acceptance.

Fresh npm installation in a disposable working-tree source snapshot with explicitly supplied local assets does not establish clean committed-checkout reproduction. Inherited modules/manifests remain uncommitted; ignored media (including the bank and six previews) require verified provisioning. CI must remain visibly failing until those inputs, lint, runtime and full prior gates are closed. Complete every unfinished step in the final handoff; there are no later numbered implementation phases. Do not publish/deploy.

### Phase 7 presentation and performance inputs

Phase 7 is **INCOMPLETE** because earlier page-lifecycle/audio/store gates and full accessibility/fallback acceptance remain open. Read `phase-07-handoff.md` and `phase-07-validation.md`. Durable before/after references and machine-readable results are in `output/phase-07/`; screenshots use verified 1280 x 720 and 390 x 844 CSS viewports, DPR 1, Windows headless Chrome 154.0.8037.98 with software WebGL. This is viewport emulation, not physical mobile/device/audio evidence. Local `http://127.0.0.1:8878` responses are no-store; workers are blocked and test contexts are disposable with denied audio. The review server also injects local diagnostics, so do not promote its heap/RAF/load values into production measurements.

The seven HTML entries now have descriptions and one main landmark. Six generated headers have decorative SVGs, static current-page state and keyboard skip links; Games targets `model-stage`, Docs targets `glb-viewer`, and the other content routes target `page-main`. `prepare-site-html.mjs` owns these differences. Start retains its distinct landing layout and now has usable no-JavaScript text navigation. `template.css` owns focus/44px mobile navigation tokens, collapsible HTML alternatives and shared consent-dialog styles. Videos' narrow Skip button is placed below the header by `videos.css`; its desktop placement code clears inline overrides on narrow screens, preventing it from covering navigation. Start's sound choice is intentionally mirrored in its existing accessible DOM dialog with focus wrapping/Escape denial. The shared generated consent prompt has a linked title/description and Escape denial. Do not restore the inaccessible canvas-only Start sound gate or put the Settings link offscreen again.

`scene/demand-render-loop.js` is active only in Graphics; retain it in runtime contents. It coalesces invalidation, drains OrbitControls damping via change events, pauses GPU submissions while hidden, and cancels its own work on disposal. Graphics has a guarded renderer constructor and an immediate automatic camera endpoint when shared reduced-motion is enabled. Preserve its camera constants, materials and lighting. Six comparable two-second idle samples submitted zero Graphics WebGL draws after the change, versus baseline medians 336 desktop/339 narrow; keyboard camera actions still redraw. This is a scene submission improvement, not a total-page CPU, loading, memory or audio-latency claim. Other page scenes and media redraw/teardown remain their owning-phase work. Keep the 29 earlier tests plus three render-loop tests; the Phase 6 diagnostic test now injects the real guarded preference adapter.

Initial no-JavaScript navigation/skip checks, denied keyboard onboarding (normal/missing model), blocked local/session-storage direct entry, and reduced-motion class checks passed their bounded local scenarios. A blocked-storage probe exposed diagnostic reads and Start's worker-clear guard; those now use guarded access without changing keys. Static HTML alternatives remain usable when JS/WebGL/assets fail, but do not claim complete interaction parity: video links are visual-only previews because audio is separate, direct games retain their own controls/consent, Music links to the retained 2D recorder, and Docs supplies a tool overview rather than keyboard card manipulation. Validate alternative asset links at the real production asset origin and subpath before release.

Release blockers to reproduce: unavailable WebGL still raises renderer errors in Start/About/Videos/Games/Music/Docs; Music also raises `Cannot access 'instrumentPickerEl' before initialization`. Graphics now handles that failure. Failed GLBs had no uncaught page errors in the local probe, but absence of an error is not successful fallback/playback. Finish constructor/load-failure recovery, keyboard parity for canvas menus/piano/cards, screen-reader/contrast/zoom testing, reduced-motion scene behavior, resource-counted lifecycle/BFCache and physical mobile/audio checks. Retain the inherited invalid Videos font URL and blocked KUTE plugin response as investigated cleanup candidates, not proven-unused deletions. Lint remains an inherited failing gate; use the final Phase 7 count and delta in its handoff.

Phase 6 Save/saved-byte loading/preparation APIs still do not exist. Network-cold/saved-raw/prepared first-note comparisons, disk/RAM limits, shared SF2, backend peak memory, leases and eviction remain dependent Phase 6/7 gates. Do not claim the Graphics optimization closes them. Finish prior-phase acceptance before release cleanup can pass; Phase 7 has not implemented Phase 8 CI, artifact cleanup, final review or deployment.

### Phase 6 release prerequisites

Phase 6 is **INCOMPLETE** after catalog/raw-loader extraction, Music-owned shared UI disposal and gated history instrumentation. Read its handoff and Music ownership/timing map. Keep `_5-music/instruments/catalog.js`, `instruments/loader.js`, `ui/video-controls-lifetime.js` and `debug/music-diagnostics.js` in any eventual runtime artifact; keep `tools/music-regression-fixture.mjs`, `tools/fixtures/`, the inventory tool and generated `.phase06-fixture.*` pages out. Temporary served fixtures were removed at handoff. The eight new Phase 6 tests must remain with the earlier 21 tests. Compare the final lint report in the handoff rather than assuming lint is green.

Local software checks preserved a 1,200 ms track lead and exercised notes/sustain/pause/seek/resume/video position; they do not establish audible first-note/reference recordings, long-run drift, full recording/transcription, physical devices, SF2 or all-bank correctness. Full Music state ownership, late-async cancellation, disposal/remount and consent revocation remain prior-phase gates. Preserve the functioning `music-2d.html` route and transcription module. No legacy Music implementation was proven unused.

The four-bank runtime save manifest still has Phase 4 placeholders. `phase-06-package-inventory.json` is evidence only: 20 fixed selections, 99,999,069 payload bytes, with MP3 maps, 59 Salamander WAVs and Hypersound. The Dog preset request does not match that bank and currently falls back to program 0. No explicit Save UI, saved-byte backend loading or preparation API was connected. Resolve catalog/version/CSP integration, browser IndexedDB/quota/eviction/large-file memory and independent 128 MiB preparation leases/readiness before release; do not silently promote an audit or file-size count into an acceptance pass. These remain Phase 6 completion work, not cleanup substitutions.

### Phase 5 release prerequisites

Phase 5's handoff, updated October 6, is **INCOMPLETE** after partial Start work. Its shared `media/controls-view.js` and `controls-input.js` are active through `shared-video-controls.js`; `createVideoControlsUI().dispose()` is additive, but Videos and Games callers still need page-owned disposal; Phase 6 adds bounded Music UI disposal as described above. The Start mount now uses Phase 4 bootstrap/scope and has partial renderer/audio cleanup, while its camera/controller and full mount-dispose/browser gate remain unproven. Videos and Games were only smoke rendered; their Phase 5 orchestration, resource cleanup and media regressions are still required. Keep these as earlier-phase completion gates in the final matrix, not as Phase 8 cleanup substitutions. The Phase 5 focused suite includes borrowed-media replacement; retain it in CI alongside Phase 2/4 tests. Full lint is still failing at 642 errors after a 27-error improvement from Phase 4's 669; track later deltas without calling lint green.

On October 6, Start added `start/camera-flow.js` for authored frame conversion/easing and page `suspend()`/`resume()` hooks. A local fixture observed one same-document 3D remount during the pending animation prompt and one missing-GLB 2D fallback remount; the fixture was removed. A follow-up local check found and fixed the missing-GLB sound choice by using the accessible DOM dialog. This does not prove repeated resource accounting, BFCache, mobile, audio, keyboard/focus, or complete Start interactions. The focused suite now has 21 passing tests including camera timing; retain it in CI. The full lint baseline remains 642 errors and must be reconciled before release.

### Phase 4 runtime and release inputs

The actual generated-runtime command pair is `npm run prepare:site-html` / `npm run check:site-html`, sourcing `_7-shared-scripts/header.html` and `data/runtime-dependencies.json`, with checked-in marked HTML and `sw-asset-config.js`. The service worker stays classic (`importScripts`) and matches the intro by exact origin and pathname. The manifest currently describes a Three.js 0.159.0 candidate and four optional SF2 packages in `data/soundfont-packages.json`; inspect the Phase 4 handoff before declaring either gate complete. Include both manifests, all generated HTML/config, GLBs, soundfont metadata, attribution and required code/wasm in the release artifact. `core/assets.js` exports `resolveAsset`, `createAssets`, `resolveAssetsBase`; old `assetUrl` remains a facade, and custom runtime `assetsBase` does not reconfigure the worker. `core/settings.js`, `core/consent.js`, `media/controller.js`, `scene/screen-surface.js`, and `storage/soundfont-store.js` are the concrete shared owners. Phase 4's local unit/browser checks do not substitute for production CDN CORS/range/offline, browser IDB/quota, true subpath, or cross-device media evidence. CI must report those as pending until proven, while retaining the original Phase 2 regression tests and an explicit lint delta.

Reconcile `phase-03-architecture-decisions.md` and `phase-03-migration-plan.md` with actual Phase 4-7 implementations. Proposed APIs/versions/budgets are not implementation evidence. Keep every prior browser/timing/CDN coverage gap visible until recovered or explicitly dispositioned against its gate.

1. Remove or archive only files proven unused by reference tracing and runtime checks. Keep generated games, vendor packages, source art, local utilities, and published assets clearly separated. Preserve attribution and licensing information.

2. Update setup, architecture, debugging, test, asset hosting, and deployment documentation to match the implementation. Record supported runtime/dependency versions and how to reproduce local and production-like behavior.

3. Add CI for the agreed lint, unit/contract, and feasible browser checks. Define an explicit deployment artifact and exclude development-only files. Verify asset case, base paths, service-worker behavior, CDN access, and clean-checkout reproducibility.

4. Run the complete regression matrix for all seven routes, including playback, settings migration, consent, keyboard access, mobile layout, fallback behavior, and music timing. Compare with Phase 1 and explain intentional differences.

5. Complete the Astra review and resolve release-blocking findings. Prepare a release summary and rollback instructions. Do not publish or deploy as part of this phase unless the user separately requests it.

6. Include HTML/import-map/worker-config preparation check mode in CI, and verify manifests and generated runtime files are present in the deployment artifact while tooling/evidence are excluded. Trace facades and alternative music routes before removal. Document the final Three.js pin and decoder/backend versions, settings precedence/reset/consent events, supported root/subpath asset behavior, and custom assetsBase worker-cache limitation. Run local/CDN/offline/range checks plus optional soundfont selection/version/dedup/quota/removal/eviction and separate disk/RAM/readiness regression cases. Rollback must preserve user preferences, consent and saved selections.

## Acceptance gate

A clean environment can reproduce the site and checks; deployment contents are explicit; all required gates pass; material review findings are resolved; known limitations and rollback steps are documented. If any gate fails, report INCOMPLETE with exact remaining work.

Astra at High performs the final architecture and regression-risk review.


---


## Phase 8 handoff and update instructions

## Working rules

Work in C:\Dropbox\Resume Website. Inspect git status and preserve existing user changes. Record starting commit and dirty files, and separate inherited changes from this phase. Keep public URLs, stored preferences, playback behavior, 3D appearance, consent, and accessibility intact unless the approved phase scope explicitly changes them.

Use small reviewable changes and meaningful checks. Record exact commands, outcomes, and manual coverage. Do not label untested behavior as passing. Do not publish, discard unrelated work, or delete uncertain legacy files. If blocked, report INCOMPLETE with the precise remaining steps.

## Permission to update upcoming documents

There are no later phase documents to revise. Reconcile the final remaining-work list against all prior handoffs. Do not mark an incomplete gate complete or silently remove an unmet requirement.

Editable source documents in _8-tools-and-notes/architecture-phases/phase-NN-instructions.md are authoritative. Update their revision/date and append what changed, why, which phase found it, and any effect on acceptance checks or model choice. Preserve phase numbers and stop points. Record moved or completed work explicitly so it is not repeated or lost.

Regenerate changed PDFs under output/pdf/phases/ from the latest Markdown and visually verify them. If a PDF cannot be regenerated, mark it superseded in the handoff and give the next model the current Markdown. Never rely on an older PDF attachment over a revised repository source. Preserve completed-phase instructions as history.

## Required pass off

Deliver the final module map, validation evidence, release/rollback instructions, known limitations, and artifact or commit references. List all remaining work: zero implementation phases only if all gates passed; otherwise enumerate unfinished steps. Publishing remains a separate action.

Write _8-tools-and-notes/architecture-phases/phase-08-handoff.md. Include status; model/effort; starting/ending commit or working-tree references; changed files and behavior; inherited changes preserved; APIs, defaults, storage keys, events and URLs affected; exact validation results; known issues; rollback for this phase only; updated future documents with revision numbers; next-phase prerequisites; and all remaining phases/steps.

## Remaining phases after this phase

No later implementation phases. List any incomplete work from Phases 1 through 8. Deployment is separate and is not authorized by this document.

**END OF PHASE 8 - Deliver final validation and all unfinished steps. Stop here. Deployment is a separate action.**

## Revision history

Revision 1 - October 5, 2026. Split from the original guide into a standalone phase document; added permission to maintain upcoming documents and bounded soundfont storage/preparation work. All implementation remains pending.

Revision 2 - October 5, 2026. Phase 1 left durable browser screenshots, mobile/reduced-motion/blocked-storage evidence, and cold/warm first-note timings unavailable; these are explicit release-validation inputs to recover or disposition by Phase 8. Reconcile the inherited 682 ESLint errors against the final maintained-file scope and require a reported delta, not an unqualified lint pass. Check local and CDN asset URLs, including the original graphics/music 404s, before release. These additions refine acceptance evidence; model choice is unchanged.

Revision 3 - October 5, 2026. Phase 3 added generated HTML/import-map/worker-config checks, manifest-aware deployment contents, final dependency/settings/consent documentation and optional storage/readiness regressions. Cleanup must trace compatibility facades and alternative routes; rollback preserves preferences and saved selections. Carry all prior evidence gaps to the final gate. Model choice, Astra/High review and no-deploy stop point are unchanged.

Revision 4 - October 5, 2026. Phase 4 supplied concrete generated-runtime commands, manifests and shared module paths, and identified unverified CDN/IDB/subpath/device gates above. Release validation must reconcile the final Three pin and optional store before deployment contents or CI can claim completion. Acceptance, Astra/High review and no-deploy stop point remain unchanged.

Revision 5 - October 5, 2026. Phase 5 extracted shared controls view/input and part of Start while leaving the page-by-page gate incomplete. Added required earlier-phase completion, UI disposal and focused-test/lint inputs to release validation. Acceptance, Astra/High review and no-deploy stop point remain unchanged.

Revision 6 - October 6, 2026. Phase 5 continuation added Start camera timeline helpers, suspend/resume, bounded 3D/fallback remount evidence, and an accessible missing-GLB sound choice. Release validation retains every earlier-phase gap, updates its focused-test count and lint result. Acceptance, Astra/High review and no-deploy stop point are unchanged.


Revision 7 - October 6, 2026. Phase 6 recorded a partial catalog/raw-loader extraction, Music UI disposal, gated history instrumentation, local software timing and the actual default-package inventory. Added the uncompleted audio/resource/storage/preparation gates, separate recorder route and inherited SF2 preset mismatch. Acceptance still requires audible/device and browser storage evidence; no scope was removed or moved into this phase. Model choice and stop point are unchanged.

Revision 8 - October 6, 2026. Phase 7 added bounded HTML/CSS/focus/consent and blocked-storage fixes, durable verified-viewport references, a measured Graphics demand-render loop and explicit WebGL/runtime/interaction failures. Added actual runtime/tool/test paths, intentional visual differences and performance limits above. Preserve every earlier unfinished gate, including the missing Phase 6 storage/preparation APIs; nothing moved into cleanup as a substitute. Acceptance, Sol/High execution, Astra/High final review and the no-deploy stop point remain unchanged.

Revision 9 - October 6, 2026. Phase 8 delivered packaging/CI/review tooling and bounded evidence, reconciled actual modules/dependencies and added CDN availability/version, worker-range and clean-source provisioning blockers. Updated this document's status to INCOMPLETE and linked the final review/validation/handoff. No prior gate was waived or moved; model choice, acceptance and no-deploy stop point are unchanged.
