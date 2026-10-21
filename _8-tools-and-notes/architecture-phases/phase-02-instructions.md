# Phase 2 Fix isolated correctness defects

Model: GPT-6.1 Sol | Reasoning: Medium | Complexity: Low to medium

Revision 2 | October 5, 2026 | Status: Not started

## Phase launch instruction

Execute Phase 2 only: Fix isolated correctness defects. Use GPT-6.1 Sol with Medium reasoning. Read this entire document, current repository instructions, and the required prior handoffs. Complete the instructions and acceptance gate, write _8-tools-and-notes/architecture-phases/phase-02-handoff.md, update affected future phase documents as authorized below, then stop. Do not start Phase 3 or deploy.

## Required context

Read all available phase-01 through phase-01 handoffs, especially phase-01-handoff.md. If a prerequisite gate is incomplete, resolve or report it before dependent work. Read Phase 1 handoff and use its commands and baseline. Do not start structural refactoring while fixing these defects.

## Instructions

1. Reproduce the games Home/End failure in the active keyboard path. Move or restructure the seek helper so it exists before use; retain bounds, synchronization, and default-key handling. Add a regression check for both shortcuts.

2. Test service-worker matching under the production CDN origin and local configuration. Compare normalized URLs consistently. Verify the intended asset is intercepted and cached, including network failure behavior. Handle worker-version/cache lifecycle only as needed for this fix.

3. Specify the custom seek callback contract. Ensure an installed callback returning undefined does not also run the default seek. Test a missing callback, a callback returning undefined, and clamped seek ratios.

4. Run focused checks and the relevant page baseline. Keep each fix independently reviewable; log additional discoveries for later phases rather than expanding scope silently.

## Acceptance gate

Each confirmed defect has a regression check and passes. Any unreproduced finding has evidence explaining why it is deferred or dismissed. Relevant playback, keyboard, and service-worker checks show no new regression.

Use the primary model for this phase.


---


## Phase 2 handoff and update instructions

## Working rules

Work in C:\Dropbox\Resume Website. Inspect git status and preserve existing user changes. Record starting commit and dirty files, and separate inherited changes from this phase. Keep public URLs, stored preferences, playback behavior, 3D appearance, consent, and accessibility intact unless the approved phase scope explicitly changes them.

Use small reviewable changes and meaningful checks. Record exact commands, outcomes, and manual coverage. Do not label untested behavior as passing. Do not publish, discard unrelated work, or delete uncertain legacy files. If blocked, report INCOMPLETE with the precise remaining steps.

## Permission to update upcoming documents

The user authorizes Phase 2 to revise instructions for any later phase when findings, actual interfaces, file paths, dependencies, or completed work require it. Make those documentation updates before the handoff. This permission does not authorize implementing later phases, silently dropping requirements, or expanding into a new feature.

Editable source documents in _8-tools-and-notes/architecture-phases/phase-NN-instructions.md are authoritative. Update their revision/date and append what changed, why, which phase found it, and any effect on acceptance checks or model choice. Preserve phase numbers and stop points. Record moved or completed work explicitly so it is not repeated or lost.

Regenerate changed PDFs under output/pdf/phases/ from the latest Markdown and visually verify them. If a PDF cannot be regenerated, mark it superseded in the handoff and give the next model the current Markdown. Never rely on an older PDF attachment over a revised repository source. Preserve completed-phase instructions as history.

## Required pass off

Pass Phase 3 the corrected behavior contracts, regression tests, and unresolved findings. Identify any custom seek callers or asset URL assumptions discovered. Keep the architecture inventory from Phase 1 attached.

Write _8-tools-and-notes/architecture-phases/phase-02-handoff.md. Include status; model/effort; starting/ending commit or working-tree references; changed files and behavior; inherited changes preserved; APIs, defaults, storage keys, events and URLs affected; exact validation results; known issues; rollback for this phase only; updated future documents with revision numbers; next-phase prerequisites; and all remaining phases/steps.

## Remaining phases after this phase

3 Design shared architecture boundaries; 4 Consolidate shared infrastructure; 5 Refactor start video and games pages; 6 Refactor the music subsystem; 7 Improve presentation and performance; 8 Clean up and validate the release

**END OF PHASE 2 - Save the handoff and any revised future documents. Stop here. The user selects the next phase.**

## Revision history

Revision 1 - October 5, 2026. Split from the original guide into a standalone phase document; added permission to maintain upcoming documents and bounded soundfont storage/preparation work. All implementation remains pending.

Revision 2 - October 5, 2026. Phase 1 confirmed two additional isolated local asset URL failures and the three source-level defect locations. Reproduce and fix `/_3-graphics/assets/glb/card-test.glb` (404; file is `/assets/glb/card-test.glb`) and `/glb/toy-piano.glb?v20251115a` (404; file is `/assets/glb/toy-piano.glb`) within this correctness phase. Add focused URL regression checks and rerun graphics/music direct-entry browser checks. Browser playback and first-note baseline remain unavailable until those assets load. The existing acceptance gate also requires these confirmed URL defects to be resolved or individually dispositioned. Model choice is unchanged.
