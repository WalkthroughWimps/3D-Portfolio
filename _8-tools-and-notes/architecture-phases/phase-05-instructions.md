# Phase 5 Refactor start video and games pages

Model: GPT-6.1 Sol | Reasoning: High | Complexity: High

Revision 4 | October 5, 2026 | Status: Not started

## Phase launch instruction

Execute Phase 5 only: Refactor start video and games pages. Use GPT-6.1 Sol with High reasoning. Read this entire document, current repository instructions, and the required prior handoffs. Complete the instructions and acceptance gate, write _8-tools-and-notes/architecture-phases/phase-05-handoff.md, update affected future phase documents as authorized below, then stop. Do not start Phase 6 or deploy.

## Required context

Read all available phase-01 through phase-04 handoffs, especially phase-04-handoff.md. If a prerequisite gate is incomplete, resolve or report it before dependent work. Read Phase 4 handoff and Phase 3 interfaces. Use baseline screenshots and interaction cases from Phase 1. Complete one page before moving to the next.

## Instructions

### Phase 4 interfaces and prerequisites

Phase 4 added `core/settings.js` (`getSharedSettings()`; `get`, `patch`, `reset`, `subscribe`, `refresh`, `retry`, `discardPending`, `dispose`), `core/lifecycle.js` (`createScope()`), and `core/bootstrap.js` (`bootstrapPage({pageId,root,mount})`). Existing per-field keys remain authoritative; `audio.volume` defaults to 0.25 and `audio.syncMs` to -270 only without a valid saved source. The `global-sync.js`, `scene-lighting-sync.js`, `_0-start/a11y.js`, `settings-store.js`, `audio-consent.js`, `media-controller.js`, and `videos-tablet.js` facades remain. `syncOffsetChanged`, `sceneLightingChanged`, and `audioConsentChanged` still bridge callers. `getSceneLightingValue(fallback = 1)` permits Start's existing 0.5 fallback; document its actual initialization before changing appearance.

`createMediaController(options)` now also returns `subscribe`, `refresh`, and `dispose`; it borrows active media and requires `refresh()` after replacement. `media/transport.js` owns the clamp, seek freeze, sync-target and pitch primitives. `_7-shared-scripts/scene/screen-surface.js` owns the four screen helpers plus UV/mask/planar fallbacks; Videos re-exports them. Phase 4 added only thin bootstrap calls to page entries; Phase 5 must make page mounts and teardown real, and finish `media/controls-view.js`/`controls-input.js`. The generated content header is already initial HTML, checked by `npm run check:site-html`; do not add a fetcher. The single Three.js 0.159.0 pin is a local candidate under review until the complete visual/device gate in the Phase 4 handoff is resolved. Treat the remaining Phase 4 browser/CDN/IDB gates as prerequisites to verify or explicitly carry, not as passes.

Use `phase-03-architecture-decisions.md` sections 3-7 and the Phase 5 file order in `phase-03-migration-plan.md`, reconciled against Phase 4's actual APIs. Start, Videos, and Games each finish their baseline/cleanup gate before the next page. Retain compatibility facades still used by Music or alternative routes.

1. Refactor the start page into settings flow, controller scene, camera transitions, media calibration, accessible controls, and debug integration. Preserve prompt sequencing, saved preferences, and 2D fallback behavior.

2. Refactor video playback and its controls around the shared media contract. Separate drawing, pointer/keyboard input, transport commands, preview selection, and page content. Preserve seeking, pitch, rate, volume, sync, and tablet transitions.

3. Refactor games into page orchestration, video reel, game embedding/input bridge, camera behavior, and layout. Treat generated game exports as external artifacts; preserve their input and audio integration.

4. For each page, install explicit cleanup using Phase 4 lifecycle helpers. Run its baseline and shared-media regression checks before starting the next page. Avoid visual redesign or broad content changes.

5. Complete the media drawing/input extraction begun only as contracts in Phase 4; shared transport must not import page helpers or rendering. Preserve the four shared screen helpers' ownership, adapter coordinate/DPR rules, mode capabilities, phase-02 custom seek ownership (including undefined return), [0,1] ratio clamping, Games Home/End redraw/audio alignment, and the existing rate cycle. Route settings through the actual shared owner while preserving saved values, consent and Start's documented lighting fallback. Do not reimplement header delivery, disk storage, or music scheduling.

## Acceptance gate

Start, videos, and games each pass their interaction baseline. Shared controls retain consistent semantics. Reinitialization/teardown does not duplicate listeners or leave page-owned resources active. Extracted modules have clear ownership and no new dependency cycles.

Recover affected Phase 1 browser/screenshot gaps before comparisons. Include active media replacement, late async completion after teardown, consent denial, keyboard/focus and fallback scenarios; test borrowed versus owned media/audio/GPU cleanup. Keep Phase 2 tests and report lint deltas. Initial navigation comes from Phase 4; presentation changes remain Phase 7.

Use the primary model for this phase.


---


## Phase 5 handoff and update instructions

## Working rules

Work in C:\Dropbox\Resume Website. Inspect git status and preserve existing user changes. Record starting commit and dirty files, and separate inherited changes from this phase. Keep public URLs, stored preferences, playback behavior, 3D appearance, consent, and accessibility intact unless the approved phase scope explicitly changes them.

Use small reviewable changes and meaningful checks. Record exact commands, outcomes, and manual coverage. Do not label untested behavior as passing. Do not publish, discard unrelated work, or delete uncertain legacy files. If blocked, report INCOMPLETE with the precise remaining steps.

## Permission to update upcoming documents

The user authorizes Phase 5 to revise instructions for any later phase when findings, actual interfaces, file paths, dependencies, or completed work require it. Make those documentation updates before the handoff. This permission does not authorize implementing later phases, silently dropping requirements, or expanding into a new feature.

Editable source documents in _8-tools-and-notes/architecture-phases/phase-NN-instructions.md are authoritative. Update their revision/date and append what changed, why, which phase found it, and any effect on acceptance checks or model choice. Preserve phase numbers and stop points. Record moved or completed work explicitly so it is not repeated or lost.

Regenerate changed PDFs under output/pdf/phases/ from the latest Markdown and visually verify them. If a PDF cannot be regenerated, mark it superseded in the handoff and give the next model the current Markdown. Never rely on an older PDF attachment over a revised repository source. Preserve completed-phase instructions as history.

## Required pass off

Pass Phase 6 stable media/scene contracts, proven adapter examples, any corrected interface assumptions, and compatibility wrappers still in use. Pass Phase 7 visual/accessibility/performance observations without changing them opportunistically. Preserve all remaining phase steps in the handoff.

Write _8-tools-and-notes/architecture-phases/phase-05-handoff.md. Include status; model/effort; starting/ending commit or working-tree references; changed files and behavior; inherited changes preserved; APIs, defaults, storage keys, events and URLs affected; exact validation results; known issues; rollback for this phase only; updated future documents with revision numbers; next-phase prerequisites; and all remaining phases/steps.

## Remaining phases after this phase

6 Refactor the music subsystem; 7 Improve presentation and performance; 8 Clean up and validate the release

**END OF PHASE 5 - Save the handoff and any revised future documents. Stop here. The user selects the next phase.**

## Revision history

Revision 1 - October 5, 2026. Split from the original guide into a standalone phase document; added permission to maintain upcoming documents and bounded soundfont storage/preparation work. All implementation remains pending.

Revision 2 - October 5, 2026. Phase 1's route map and manual checklist are in `phase-01-baseline.md` and `tools/VALIDATION.md`. The browser baseline had page shells and one successful Docs-to-About navigation, but intro playback, active games keyboard seeking, saved preferences, and narrow/reduced-motion behavior were not verified. Re-establish those scenarios after Phase 2 asset fixes before using visual comparisons or claiming preserved behavior. Treat the 88 start, 60 games, 29 shared-video-control, and 153 video-player ESLint findings as inherited lint debt; track only corrections made in this phase. Acceptance gate remains behavioral, with unavailable checks disclosed. Model choice is unchanged.

Revision 3 - October 5, 2026. Phase 3 supplied the file-by-file Start/Videos/Games extraction order, actual legacy settings mapping, media/render contracts and lifecycle ownership. Added explicit custom-seek, mode-capability, Home/End and borrowed-resource checks; keep Phase 4 infrastructure and Phase 6 music out of scope. Missing baseline evidence remains an acceptance obligation. Model choice and stop point are unchanged.

Revision 4 - October 5, 2026. Phase 4 supplied the concrete settings, lifecycle, bootstrap, media-controller, transport and screen-surface paths above and checked-in generated navigation. It left page-owned mount cleanup for this phase and retained facades for Music/alternatives. Candidate Three.js and unavailable browser/device gates must be read from the Phase 4 handoff before extraction. Acceptance checks and stop point remain; model choice is unchanged.
