# Phase 1 Establish the baseline and checks

Model: GPT-6.1 Sol | Reasoning: High | Complexity: Medium

Revision 1 | October 5, 2026 | Status: Not started

## Phase launch instruction

Execute Phase 1 only: Establish the baseline and checks. Use GPT-6.1 Sol with High reasoning. Read this entire document, current repository instructions, and the required prior handoffs. Complete the instructions and acceptance gate, write _8-tools-and-notes/architecture-phases/phase-01-handoff.md, update affected future phase documents as authorized below, then stop. Do not start Phase 2 or deploy.

## Required context

No earlier handoff is required. There is no previous implementation handoff. Recheck the current working tree and AGENTS.md. The initial source review found two passing storage tests, ineffective lint coverage on sampled nested files, and no browser baseline. These observations must be revalidated.

## Instructions

1. Inventory the seven main routes, their entry scripts, shared modules, external libraries, asset origins, and legacy alternatives. Confirm which piano implementation is actually loaded. Capture current user changes before editing tooling.

2. Correct ESLint coverage for nested source files and separate browser, Node, and service-worker environments. Exclude generated games, vendor code, and confirmed archives deliberately. Record existing violations; avoid mass auto-fixes or blanket rule suppression.

3. Wire the existing storage tests into a real test command. Add a documented validation entry point and a browser smoke checklist or harness for all main pages. Keep test artifacts and fixtures separate from runtime source.

4. Capture screenshots and console/network failures for normal loading, direct entry, navigation, playback, saved preferences, and keyboard controls. Include narrow/mobile layout, reduced motion, blocked storage, and failed asset loading. Record unavailable coverage explicitly.

5. Measure representative cold and warm instrument loads and first-note preparation. Record package sizes and distinguish per-instrument sample packages from shared SF2 banks; these measurements inform Phases 3, 4, 6, and 7.

## Acceptance gate

Canonical routes and modules are documented; lint actually checks nested application code; existing storage tests pass through the standard command; browser baseline and known failures are recorded. Existing failures may remain only if individually identified and carried forward.

Use the primary model for this phase.


---


## Phase 1 handoff and update instructions

## Working rules

Work in C:\Dropbox\Resume Website. Inspect git status and preserve existing user changes. Record starting commit and dirty files, and separate inherited changes from this phase. Keep public URLs, stored preferences, playback behavior, 3D appearance, consent, and accessibility intact unless the approved phase scope explicitly changes them.

Use small reviewable changes and meaningful checks. Record exact commands, outcomes, and manual coverage. Do not label untested behavior as passing. Do not publish, discard unrelated work, or delete uncertain legacy files. If blocked, report INCOMPLETE with the precise remaining steps.

## Permission to update upcoming documents

The user authorizes Phase 1 to revise instructions for any later phase when findings, actual interfaces, file paths, dependencies, or completed work require it. Make those documentation updates before the handoff. This permission does not authorize implementing later phases, silently dropping requirements, or expanding into a new feature.

Editable source documents in _8-tools-and-notes/architecture-phases/phase-NN-instructions.md are authoritative. Update their revision/date and append what changed, why, which phase found it, and any effect on acceptance checks or model choice. Preserve phase numbers and stop points. Record moved or completed work explicitly so it is not repeated or lost.

Regenerate changed PDFs under output/pdf/phases/ from the latest Markdown and visually verify them. If a PDF cannot be regenerated, mark it superseded in the handoff and give the next model the current Markdown. Never rely on an older PDF attachment over a revised repository source. Preserve completed-phase instructions as history.

## Required pass off

Pass Phase 2 the exact reproduction steps for suspected defects, the new validation commands, baseline evidence, and lint debt. Pass later phases the route/dependency map, active entry points, existing user-change inventory, and baseline screenshots.

Write _8-tools-and-notes/architecture-phases/phase-01-handoff.md. Include status; model/effort; starting/ending commit or working-tree references; changed files and behavior; inherited changes preserved; APIs, defaults, storage keys, events and URLs affected; exact validation results; known issues; rollback for this phase only; updated future documents with revision numbers; next-phase prerequisites; and all remaining phases/steps.

## Remaining phases after this phase

2 Fix isolated correctness defects; 3 Design shared architecture boundaries; 4 Consolidate shared infrastructure; 5 Refactor start video and games pages; 6 Refactor the music subsystem; 7 Improve presentation and performance; 8 Clean up and validate the release

**END OF PHASE 1 - Save the handoff and any revised future documents. Stop here. The user selects the next phase.**

## Revision history

Revision 1 - October 5, 2026. Split from the original guide into a standalone phase document; added permission to maintain upcoming documents and bounded soundfont storage/preparation work. All implementation remains pending.
