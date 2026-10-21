# Phase 4 Consolidate shared infrastructure

Model: GPT-6.1 Sol | Reasoning: High | Complexity: High

Revision 3 | October 5, 2026 | Status: Not started

## Phase launch instruction

Execute Phase 4 only: Consolidate shared infrastructure. Use GPT-6.1 Sol with High reasoning. Read this entire document, current repository instructions, and the required prior handoffs. Complete the instructions and acceptance gate, write _8-tools-and-notes/architecture-phases/phase-04-handoff.md, update affected future phase documents as authorized below, then stop. Do not start Phase 5 or deploy.

## Required context

Read all available phase-01 through phase-03 handoffs, especially phase-03-handoff.md. If a prerequisite gate is incomplete, resolve or report it before dependent work. Read Phase 3 decisions plus the Phase 1 baseline and Phase 2 fixes. Use GPT-6 Astra at High for a separate review of the final shared changes.

## Instructions

Follow `phase-03-architecture-decisions.md` (ADR) and the ordered Phase 4 steps in `phase-03-migration-plan.md`. They define proposed paths/contracts, not completed runtime work. Keep Phases 1-2 evidence gaps open until measured. Phase 3 found no design decision blocking the start of this phase; failed compatibility/browser gates can still make implementation incomplete.

1. Implement ADR sections 3-4: existing per-field keys remain authoritative, volume defaults to 0.25 and sync to -270 ms only when no valid saved value exists; preserve zero/false and raw legacy precedence. Keep cookie/local audio consent separate. Add failure overlays, reset/retry, immutable subscriptions, legacy event facades, and cross-tab invalidation without write-back loops. Use thin call-site integration across pages; their scene/flow/music extraction remains Phase 5/6.

2. Introduce idempotent bootstrap and initial HTML navigation per ADR section 6. Add the bounded HTML preparation tool, dependency manifest, marked generated regions, and write/check commands. Preserve Start's unique landing navigation and all public URLs. Remove duplicated header fetchers on the six content routes. Generated HTML stays checked in and statically deployable. This completes header delivery previously assigned to Phase 7; Phase 7 validates and improves semantics instead of repeating it.

3. Move the four shared screen helpers from videos-tablet.js into scene/screen-surface.js with re-exports; inject page placement/configuration. Extract pure media transport and add controller lifecycle/subscriptions without absorbing Phase 5 drawing/input refactors. Preserve installed-seek callback ownership even on undefined return and [0,1] clamping. Implement ADR section 7 asset resolution and classic worker configuration; test page/site-relative paths, GLB CDN /glb mapping, soundfonts, spaces/query strings, overrides, and local/CDN/subpath cases. The current resolver already rewrites ../soundfonts paths; earlier risk wording is superseded by Phase 3 evidence.

4. Evaluate a single Three.js 0.159.0 pin against Start's 0.158.0, the five 0.159.0 routes, and Docs' 0.160.0. Check Docs RoomEnvironment/PMREM, all GLBs/materials/lighting, loaders/decoder paths, CSS3D, video textures and controls before adoption. Keep pin changes separable; a failed comparison requires an amended recorded candidate and an incomplete gate, not a silent upgrade. Add lifecycle helpers and gate diagnostics through the existing debug loader.

5. Run all affected page checks and request the Astra review. Resolve material findings before completion; record deferred nonblocking findings for the correct later phase.

6. Implement the ADR IndexedDB soundfont store, version/digest manifest, shared-bank references, complete-package transactions, cross-tab reservations, capacity checks, removal, eviction recovery, and reusable management view. Validate the proposed 250,000,000-byte disk cap plus overhead: Arachno fits alone, definitive-drums does not; an increase must be explicit. Persist only selected packages; never decode all saved instruments. Phase 6 owns live music-loader/UI integration and the separate RAM/readiness API. No recording feature is added.

## Acceptance gate

Cross-page settings, consent, navigation, and playback checks pass; migrated preferences survive reloads; shared modules no longer depend on page implementations; dependency and asset resolution checks pass; review findings are resolved or explicitly dispositioned.

Use the ADR section 9 test matrix and Phase 3 migration plan. Require initial navigation with JavaScript unavailable, teardown/reinitialization checks, the Phase 2 regression suite, lint deltas, and live production CDN/intro offline/range evidence. Preserve the worker's exact origin-plus-path matching and custom-base cache limitation. Browser/device coverage that remains unavailable must be reported against its gate, not called passing. Record actual APIs/wrappers and whether proposed budgets/version pins were validated.

Astra at High performs the final shared-infrastructure review.


---


## Phase 4 handoff and update instructions

## Working rules

Work in C:\Dropbox\Resume Website. Inspect git status and preserve existing user changes. Record starting commit and dirty files, and separate inherited changes from this phase. Keep public URLs, stored preferences, playback behavior, 3D appearance, consent, and accessibility intact unless the approved phase scope explicitly changes them.

Use small reviewable changes and meaningful checks. Record exact commands, outcomes, and manual coverage. Do not label untested behavior as passing. Do not publish, discard unrelated work, or delete uncertain legacy files. If blocked, report INCOMPLETE with the precise remaining steps.

## Permission to update upcoming documents

The user authorizes Phase 4 to revise instructions for any later phase when findings, actual interfaces, file paths, dependencies, or completed work require it. Make those documentation updates before the handoff. This permission does not authorize implementing later phases, silently dropping requirements, or expanding into a new feature.

Editable source documents in _8-tools-and-notes/architecture-phases/phase-NN-instructions.md are authoritative. Update their revision/date and append what changed, why, which phase found it, and any effect on acceptance checks or model choice. Preserve phase numbers and stop points. Record moved or completed work explicitly so it is not repeated or lost.

Regenerate changed PDFs under output/pdf/phases/ from the latest Markdown and visually verify them. If a PDF cannot be regenerated, mark it superseded in the handoff and give the next model the current Markdown. Never rely on an older PDF attachment over a revised repository source. Preserve completed-phase instructions as history.

## Required pass off

Pass Phase 5 the actual public APIs, migrated keys/defaults, event names, compatibility wrappers, cleanup obligations, and review findings. Pass Phase 6 any music-specific constraints; do not remove a wrapper until its consumers are migrated.

Write _8-tools-and-notes/architecture-phases/phase-04-handoff.md. Include status; model/effort; starting/ending commit or working-tree references; changed files and behavior; inherited changes preserved; APIs, defaults, storage keys, events and URLs affected; exact validation results; known issues; rollback for this phase only; updated future documents with revision numbers; next-phase prerequisites; and all remaining phases/steps.

## Remaining phases after this phase

5 Refactor start video and games pages; 6 Refactor the music subsystem; 7 Improve presentation and performance; 8 Clean up and validate the release

**END OF PHASE 4 - Save the handoff and any revised future documents. Stop here. The user selects the next phase.**

## Revision history

Revision 1 - October 5, 2026. Split from the original guide into a standalone phase document; added permission to maintain upcoming documents and bounded soundfont storage/preparation work. All implementation remains pending.

Revision 2 - October 5, 2026. Phase 1 established `npm test`, `npm run lint`, and `tools/VALIDATION.md`; reuse these instead of creating parallel entry points. The asset resolver currently ignores `../soundfonts/...` for CDN rewriting, and local graphics/music URLs failed; verify the Phase 3 asset contract against these exact cases and query strings. Lint now checks 50 files and reports 682 inherited errors, so report new versus inherited violations rather than claiming a clean lint run. Test optional soundfont storage with both the 155,405,818-byte Arachno and 256,317,998-byte definitive-drums shared banks; a 250 MB cap may not fit the latter with overhead. Acceptance checks now include these cases. Model choice is unchanged.

Revision 3 - October 5, 2026. Phase 3 defined authoritative legacy-key settings migration, independent consent, idempotent bootstrap, initial HTML header generation, shared media/screen ownership, an explicit asset/worker contract, and the IndexedDB selected-package store. Corrected earlier soundfont-prefix concern (current rewriting works) and added Docs Three.js 0.160.0 to the compatibility inventory. Initial header delivery moves from Phase 7 to Phase 4; page extraction and live music/readiness integration remain Phases 5/6. Acceptance now references the ADR test matrix, actual version/capacity checks, and unresolved browser/CDN evidence. Model choice and separate Astra/High review are unchanged.
