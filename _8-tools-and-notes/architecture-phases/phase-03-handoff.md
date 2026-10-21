# Phase 3 handoff - Design shared architecture boundaries

**Status: COMPLETE for the Phase 3 design acceptance gate.** The architecture record, concrete interface examples, settings mapping, file-by-file migration order, testing/rollback obligations, and revised future instructions are complete. No runtime code was changed, no Phase 4 implementation started, and nothing was committed or deployed. Prior browser/timing evidence gaps remain open; this status does not mark those gates complete.

**Model/effort:** Phase 3 requested GPT-6 Astra / High and primary-model execution. Work was performed by the primary agent without delegation. The session does not expose a verifiable active model identifier/effort setting, so the requested model/effort cannot be certified.

**Working-tree reference:** Starting and ending HEAD: `add5dd6eae8c81c40d0052371bcd8a387f7c0385`. All deliverables are uncommitted within already-untracked documentation/output directories. `tmp/phase-03/starting-status.txt` and `protected-hashes.json` record the starting state; final `validation-results.json` confirms 248 protected source/configuration/document files have identical SHA-256 hashes. No new runtime module, schema, store, bootstrap, HTML generator, or recording API has been implemented.

## Read next

1. `phase-03-architecture-decisions.md`, Revision 1: authoritative design (ADR), source corrections, ownership/dependencies, settings/consent, media/rendering/lifetimes, bootstrap/header/dependencies, asset/worker behavior, disk storage/preparation, validation and rollback.
2. `phase-03-migration-plan.md`, Revision 1: ordered file-by-file tasks for Phases 4-6 and every remaining Phase 7/8 step. Paths marked proposed do not yet exist.
3. `phase-04-instructions.md`, **Revision 3**: next user-selected phase; includes the separate Astra/High review requirement. Follow editable Markdown over any older attachment.
4. Phase 1 baseline/handoff, Phase 2 handoff, `tools/VALIDATION.md`, and existing Phase 2 tests for preserved behavior and missing evidence.

## Inherited changes preserved

At start, tracked dirty files were `.gitignore`, `_0-start/start-page.css`, `_0-start/start-page.js`, `_1-about/about.html`, `_1-about/about.js`, `_3-graphics/graphics.js`, `_4-games/games.js`, `_5-music/music-piano-controls.v2.js`, `_6-docs/docs-3d.js`, `_7-shared-scripts/media-controller.js`, `_7-shared-scripts/shared-video-controls.js`, `_7-shared-scripts/video-player-controls.js`, `eslint.config.mjs`, `package.json`, `sw.js`, and `tools/review-server.mjs`.

Untracked paths at start were `_7-shared-scripts/video-filter.js`, `_8-tools-and-notes/architecture-phases/`, `blender-cleanup/`, `data/video-filter.json`, `debug/panel-shell.css`, `debug/panel-shell.js`, `output/`, `tmp/`, `tools/VALIDATION.md`, `tools/mp4-to-webm-preserve-aspect.bat`, `tools/phase-02-correctness.test.mjs`, and `tools/render-phase-pdfs.py`. These were preserved. Phase 3 only adds/revises the documentation/PDFs listed below and its own scratch evidence. No repository AGENTS.md was found by the filename scan; the user-provided requirement to list all remaining phases/steps was followed.

## Changed files and behavior

| File(s) | Phase 3 change |
| --- | --- |
| `phase-03-architecture-decisions.md` | New decision record, Revision 1 |
| `phase-03-migration-plan.md` | New bounded migration instructions, Revision 1 |
| `phase-03-handoff.md` | This handoff |
| `phase-04-instructions.md` through `phase-08-instructions.md` | Revision 2 -> **Revision 3**, October 5, 2026; scope/acceptance/history reconciled with decisions |
| `output/pdf/phases/phase-04-instructions.pdf` through `phase-08-instructions.pdf` | Regenerated from current Revision 3 Markdown; all 11 final pages visually inspected |
| `tmp/phase-03/` | Pre-edit copies, hash/status evidence, read-only source probe, PDF layout wrapper/QA renders, validation script/results |

The filenames in the first five rows are under `_8-tools-and-notes/architecture-phases/` unless otherwise qualified. Phases 1-3 instruction documents and prior handoffs remain history. The existing PDF renderer was not edited; a scratch wrapper keeps headings with following text and avoids paragraph widows/orphans. All final PDFs are current; none is marked superseded. Older Revision 2 attachments of Phases 4-8 are superseded by repository Revision 3.

Runtime behavior, storage contents, URLs, APIs, dependencies and events are unchanged **today**. The following are implementation decisions, not completed changes:

- Existing per-field settings keys remain authoritative. Volume defaults to **0.25** and sync to **-270 ms** only without a valid saved source. Dedicated canonical keys beat raw legacy values; zero/false are preserved. No destructive legacy-key deletion or second authoritative settings blob. Settings subscribers, storage-failure overlays/reset/retry and old event/global facades are specified in ADR section 3.
- Audio consent stays separate: cookie `site_audio_allowed`, key `site.audio.allowed`, event `audioConsentChanged`, existing cookie precedence and prompt semantics, with current-document memory for blocked persistence. Volume/mute, saving files, animation and preparation never grant consent.
- Shared transport/controller may not import a page implementation or rendering. The four screen helpers move from Videos to a shared scene module with compatibility re-exports. Installed `seek(ratio, video, audio)` owns the seek even when returning undefined; default runs only when absent. Ratios clamp to `[0,1]`, preserving Phase 2.
- Proposed explicit bootstrap/lifetime services and checked-in initial HTML navigation use a small HTML preparation tool, without a JS bundler/SPA conversion. Initial header delivery **moves from Phase 7 to Phase 4**; Phase 7 verifies and improves its semantics. Preserve Start's distinct landing navigation.
- Candidate single Three.js **0.159.0** must pass comparisons against Start 0.158.0 and Docs 0.160.0 before adoption. Remaining five content routes use 0.159.0. This source correction expands compatibility checks; no pin was changed and compatibility is not established.
- `../assets/glb/` keeps local `/assets/glb/` versus CDN `/glb/` targets. Current `../soundfonts/...` rewriting **already works** in the resolver; earlier handoff concern is not a confirmed defect. Actual CDN availability/CORS is still untested. Intro worker matching preserves exact origin plus pathname and the query-insensitive intro rule; custom runtime asset-base overrides have no promised worker-cache support.
- Optional selected-package persistence uses proposed IndexedDB `site-soundfonts` v1, version/digest manifests and shared-bank references. The proposed **250 MB = 250,000,000 bytes** cap includes a defined overhead reserve and needs validation; definitive-drums is larger even before overhead. Increasing capacity is explicit, never automatic eviction of another chosen bank. Phase 4 implements infrastructure/management view; Phase 6 connects live loaders/UI.
- A separate provisional **128 MiB background-preparation** budget must be measured against decoded PCM/backend/staging cost. It does not replace existing playback behavior or reuse the disk budget. `prepareForRecording` has cancellation, readiness, progress and release leases; it does not start recording, sound, microphone capture, or persistent saving. Phase 6 implements this foundation only.

All proposed module paths, interfaces, legacy-to-logical fields, metadata keys, retained events, unchanged routes and migration ordering are in the ADR and migration plan.

## Validation commands and exact outcomes

Commands were run from `C:\Dropbox\Resume Website`. Bundled Python below means `C:/Users/spami/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`; Poppler means the `dependencies/native/poppler/Library/bin/pdftoppm.exe` in that same runtime root.

| Command/check | Outcome |
| --- | --- |
| `git rev-parse HEAD`; `git status --short` | Starting/ending commit unchanged; inherited dirty paths retained; no commit created |
| `rg --files -g AGENTS.md -g '!node_modules' -g '!vendor'` | No repository instruction file found; user-supplied AGENTS instructions applied |
| Source reads of Phase 3 instructions, Phase 1/2 handoffs/baseline, Phases 4-8, shared modules, settings consumers and entry import maps | Completed; corrected soundfont-prefix and Docs-version assumptions in new documents |
| `npm test` | **8 passed, 0 failed** (2 storage tests + 6 Phase 2 regression tests); no tests added to runtime test suite |
| `node tmp/phase-03/probe-source.mjs` | **6 resolver cases passed**, covering local/CDN soundfont base, encoded SF2 query, piano GLB query; **7 import-map versions** confirmed. Results in `source-probe-results.json`. No network/CDN fetch claim |
| `git diff --check` | Exit 0, no whitespace errors in tracked diff; existing LF/CRLF conversion warnings printed. Documentation is untracked and separately checked below |
| `& <bundled-node> <pdf-skill>/container_tools/mark_artifact_operation_started.mjs --operation-kind edit --expected-output-count 5 --output-format pdf` | Exit 0 before first PDF generation |
| `& <bundled-python> tools/render-phase-pdfs.py 04 05 06 07 08` | Five PDFs generated; first visual pass exposed orphaned headings and a two-line extra Phase 6 page |
| `& <bundled-python> tmp/phase-03/render-pdfs.py` | Final generation after tightening Phase 6 wording and layout-only scratch wrapper; existing renderer/source tools unchanged |
| `4..8` loop running `& <Poppler> -r 110 -png "output/pdf/phases/phase-$phaseNum-instructions.pdf" "C:/Dropbox/Resume Website/tmp/phase-03/pdf-qa/final-$phaseNum"` | Rendered all final pages. Poppler warned about unavailable Symbol/ArialUnicode display fonts; exit successful; visual output showed no missing glyphs/clipping/overlap |
| Visual inspection of all five final contact sheets (`final-contact-04.png` through `final-contact-08.png`) | **11 pages reviewed:** Phase 4 has 3; Phases 5-8 have 2 each. Headings/paragraphs readable with no orphan headings, clipping or overlap |
| `& <bundled-python> tmp/phase-03/validate-documents.py` | **248 protected files unchanged**; all five Markdown/PDF revisions, unchanged model lines/stop markers, every source paragraph present in PDF, and new document fence/whitespace checks passed. Results in `validation-results.json` |

No browser runtime scenario was re-run because this phase changed no runtime code. No timing, accessibility, live CDN, storage, soundfont or dependency-compatibility implementation pass is claimed. Full lint was not rerun for documentation-only work; the last measured 682 errors are inherited Phase 2 evidence, not a current clean lint result. Runtime code hashes plus the existing regression suite establish the scope of this phase's verification.

Exact executable paths for reproducing the final PDF/document checks (the generation marker already ran once; do not repeat it for read-only checking):

```powershell
& 'C:/Users/spami/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' tmp/phase-03/render-pdfs.py
$phaseQa = 'C:/Dropbox/Resume Website/tmp/phase-03/pdf-qa'
4..8 | ForEach-Object {
    $phaseNum = $_.ToString('00')
    & 'C:/Users/spami/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe' -r 110 -png "output/pdf/phases/phase-$phaseNum-instructions.pdf" "$phaseQa/final-$phaseNum"
}
& 'C:/Users/spami/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' tmp/phase-03/validate-documents.py
```

The marker executable was `C:/Users/spami/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`, with script `C:/Users/spami/.cache/codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime/plugins/pdf/skills/pdf/container_tools/mark_artifact_operation_started.mjs` and the six arguments shown in the validation table.

Upstream references consulted for design constraints: Three.js migration guide and MDN storage events/estimates/Cache documentation, linked at the relevant ADR decisions. These confirm platform considerations, not this site's runtime acceptance.

## Known issues and next-phase prerequisites

There are **no unresolved architecture choices blocking the start of Phase 4**. The following evidence and implementation checks remain required:

1. Recover durable screenshots, true narrow viewport measurements, reduced-motion/keyboard/dialog/fallback/blocked-storage browser checks before depending on their baseline. Saved volume reload and recurring animation prompt observations from Phase 1 remain unverified causes.
2. Test live production assets/CORS and intro worker install/upgrade/offline/range behavior. The source probe only proves current string mapping, not server response or media playback.
3. Compare the candidate Three.js version against all seven routes, especially Start lighting and Docs RoomEnvironment/PMREM. If it fails, retain the prior behavior and record/review an amended decision; do not assert standardization complete.
4. Validate IndexedDB availability, reservation/transaction behavior, actual package hashes/bytes/quota, and explicit oversize handling in Phase 4. In Phase 6, measure backend/decoded/peak-copy memory and readiness; current proposed limits are not performance measurements.
5. Establish actual music timing tolerances and reference audio/device evidence before extraction. Preserve generated games, live v2 music, alternative-route files, debug/filter edits and attribution.
6. Phase 4 must record actual APIs/paths, run its separate Astra/High review, update later instructions/PDFs as needed, and stop. Its thin settings/bootstrap integration must not absorb Phase 5/6 page rewrites.

## Rollback for Phase 3 only

Restore **only** Phase 4-8 instruction Markdown/PDF pairs from matching paths under `tmp/phase-03/before/`. Remove the three Phase 3-created architecture/migration/handoff documents if reverting the whole phase. Scratch Phase 3 evidence can be retained for review. Do not revert HEAD, erase inherited untracked directories, touch runtime files or revert Phase 1/2 changes. The prior versions were untracked, so preserve this backup or an equivalent reviewed diff before cleaning scratch data. No runtime/storage rollback is needed for Phase 3.

## All remaining phases and steps

The full file order and checklists are in `phase-03-migration-plan.md`; the complete remaining scope is summarized here.

**Phase 4 - Consolidate shared infrastructure.** (1) Snapshot current work and recover affected baseline evidence. (2) Implement schema/preferences/lifecycle and migration/failure tests. (3) Adapt settings/consent facades and thin page call sites, including cross-tab and reload checks. (4) Implement explicit asset policy/resolution and its test matrix. (5) Implement idempotent bootstrap, initial HTML header/dependency preparation and classic worker configuration. (6) Extract shared transport/controller and four screen helpers with contracts, wrappers and cleanup. (7) Validate then consolidate Three.js/dependencies separately from logic. (8) Implement optional versioned IndexedDB package storage, management view, capacity/dedup/removal/eviction tests. (9) Gate diagnostics, run all affected routes/production worker checks, obtain Astra review, resolve findings, update documents/PDFs and hand off. Stop.

**Phase 5 - Refactor Start, Videos and Games.** (1) Extract Start settings flow, controller scene, camera, calibration, accessible controls/debug; preserve prompt sequence, saved settings/lighting fallback and 2D fallback. (2) Finish shared media drawing/input extraction and Videos transport/content/preview/tablet orchestration. (3) Extract Games scene/reel/session/camera/layout while preserving generated game input/audio bridges and Home/End behavior. (4) Apply explicit cleanup and test each page before the next; preserve needed wrappers, compare baselines, report lint/presentation debt, update documents/PDFs and hand off. Stop.

**Phase 6 - Refactor music.** (1) Confirm active v2 entry, map state/clocks/backend versions and measure timing tolerances/reference audio. (2) Extract catalog/loader and integrate explicit saved-package loading/management. (3) Extract audio session/mixer/MIDI scheduler while preserving note/sustain/switching/sync semantics and trim keys. (4) Extract scene/hit testing/keyboard/UI, gate diagnostics and dispose audio/timers/buffers/GPU resources; retain transcription and trace legacy references. (5) Implement preparation/progress/cancellation/readiness/memory leases and measure independent RAM limits and cold/saved/prepared startup; no new recording feature or unprofiled AudioWorklet rewrite. (6) Check audio/MIDI/sustain/rapid switching/existing recording/transcription/sync after every extraction, preserve rollback points, document coverage, update documents/PDFs and hand off. Stop.

**Phase 7 - Improve presentation and performance.** (1) Complete accessible names, landmarks, titles/descriptions/HTML alternatives; validate Phase 4 initial navigation. (2) Recover screenshots and verify keyboard/focus/dialog/reduced-motion/mobile/denied-audio/blocked-storage/failed-asset/WebGL fallback. (3) Consolidate CSS against intentional visual comparisons. (4) Measure then optimize demonstrated load/frame/media/resource costs. (5) Repeat desktop/mobile/keyboard measurements under documented conditions. (6) Compare network-cold/disk-cached/memory-prepared instrument startup and first note, validate separate budgets/shared banks/removal/eviction, update Phase 8/PDF and hand off. Stop.

**Phase 8 - Clean up and validate release.** (1) Trace references before removing obsolete files/facades; preserve alternatives/generated games/vendor assets/art/licenses/attribution. (2) Update actual setup/architecture/debug/test/hosting/dependency/asset/storage documentation. (3) Add CI lint/unit/contract/browser and generation checks; reconcile inherited lint and define deployment contents. (4) Reproduce cleanly and run all route/media/settings/consent/keyboard/mobile/fallback/music/storage/readiness plus local/CDN/subpath/worker regression cases, recovering/dispositioning every prior evidence gap. (5) Obtain Astra review, resolve blockers, deliver release and rollback evidence and enumerate unfinished work. Stop; deployment remains separate.

**Beyond the phases:** publishing/deployment is not authorized by this request. A new recording feature and any AudioWorklet redesign need their own scope. They are not hidden implementation requirements of Phases 4-8.

**END OF PHASE 3 - Documentation saved. Do not start Phase 4 until the user selects it.**
