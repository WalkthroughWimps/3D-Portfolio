# Phase 3 Design shared architecture boundaries

Model: GPT-6 Astra | Reasoning: High | Complexity: High

Revision 3 | October 5, 2026 | Status: Not started

## Phase launch instruction

Execute Phase 3 only: Design shared architecture boundaries. Use GPT-6 Astra with High reasoning. Read this entire document, current repository instructions, and the required prior handoffs. Complete the instructions and acceptance gate, write _8-tools-and-notes/architecture-phases/phase-03-handoff.md, update affected future phase documents as authorized below, then stop. Do not start Phase 4 or deploy.

## Required context

Read all available phase-01 through phase-02 handoffs, especially phase-02-handoff.md. If a prerequisite gate is incomplete, resolve or report it before dependent work. Read Phases 1 and 2 handoffs. This phase produces architecture decisions and migration instructions; avoid runtime implementation changes.

## Instructions

1. Define ownership for core settings/storage/assets/consent, reusable media and scene features, page orchestration, and development tooling. Prefer plain ES modules and incremental extraction. Preserve existing public URLs.

2. Design a settings schema with validated defaults, legacy-key migration precedence, storage failure behavior, cross-tab updates, and subscriptions. Treat audio consent as a distinct decision. Resolve the conflicting volume and sync defaults explicitly.

3. Define media controller actions/state/capabilities and the rendering adapter contract. Remove the need for shared video code to import videos-page helpers. Specify initialization and disposal of events, animation frames, audio nodes, and GPU resources.

4. Design a shared page bootstrap, header delivery, dependency-version policy, and asset-resolution contract. Evaluate a small build step only if justified; record benefits and deployment costs. Add JSDoc contract examples and a file-by-file migration order for Phases 4 through 6.

   Incorporate the Phase 2 asset findings: page-relative `../assets/glb/` resolves locally, while the current production resolver maps that path to CDN `/glb/`. Include this behavior, explicit origin/path comparisons for the intro service worker, and the custom media seek rule: an installed `seek(ratio, video, audio)` callback exclusively owns the action even if it returns `undefined`; only an absent callback uses the default. Ratios clamp to `[0, 1]`.

5. Design optional Save in this browser soundfont storage: explicit selections, versioned files, shared-bank deduplication, visible usage/removal, quota failures, and separate disk/RAM budgets. Treat 250 MB as a proposed default to validate. Define a prepare-for-recording API without implementing recording.

## Acceptance gate

The architecture decision record includes concrete interface examples, dependency direction, settings migration rules, preserved behavior, testing obligations, rollback strategy, and bounded tasks for each implementation phase. Unresolved decisions that block Phase 4 are listed explicitly.

Use the primary model for this phase.


---


## Phase 3 handoff and update instructions

## Working rules

Work in C:\Dropbox\Resume Website. Inspect git status and preserve existing user changes. Record starting commit and dirty files, and separate inherited changes from this phase. Keep public URLs, stored preferences, playback behavior, 3D appearance, consent, and accessibility intact unless the approved phase scope explicitly changes them.

Use small reviewable changes and meaningful checks. Record exact commands, outcomes, and manual coverage. Do not label untested behavior as passing. Do not publish, discard unrelated work, or delete uncertain legacy files. If blocked, report INCOMPLETE with the precise remaining steps.

## Permission to update upcoming documents

The user authorizes Phase 3 to revise instructions for any later phase when findings, actual interfaces, file paths, dependencies, or completed work require it. Make those documentation updates before the handoff. This permission does not authorize implementing later phases, silently dropping requirements, or expanding into a new feature.

Editable source documents in _8-tools-and-notes/architecture-phases/phase-NN-instructions.md are authoritative. Update their revision/date and append what changed, why, which phase found it, and any effect on acceptance checks or model choice. Preserve phase numbers and stop points. Record moved or completed work explicitly so it is not repeated or lost.

Regenerate changed PDFs under output/pdf/phases/ from the latest Markdown and visually verify them. If a PDF cannot be regenerated, mark it superseded in the handoff and give the next model the current Markdown. Never rely on an older PDF attachment over a revised repository source. Preserve completed-phase instructions as history.

## Required pass off

Pass Phase 4 the architecture decision record, interface examples, legacy-to-new settings mapping, dependency compatibility checks, and migration order. Mark which work belongs to Phase 5 or 6 so infrastructure work does not absorb page rewrites.

Write _8-tools-and-notes/architecture-phases/phase-03-handoff.md. Include status; model/effort; starting/ending commit or working-tree references; changed files and behavior; inherited changes preserved; APIs, defaults, storage keys, events and URLs affected; exact validation results; known issues; rollback for this phase only; updated future documents with revision numbers; next-phase prerequisites; and all remaining phases/steps.

## Remaining phases after this phase

4 Consolidate shared infrastructure; 5 Refactor start video and games pages; 6 Refactor the music subsystem; 7 Improve presentation and performance; 8 Clean up and validate the release

**END OF PHASE 3 - Save the handoff and any revised future documents. Stop here. The user selects the next phase.**

## Revision history

Revision 1 - October 5, 2026. Split from the original guide into a standalone phase document; added permission to maintain upcoming documents and bounded soundfont storage/preparation work. All implementation remains pending.

Revision 2 - October 5, 2026. Phase 1 found mixed Three.js 0.158/0.159 imports, incorrect local model URLs, and `assetUrl('../soundfonts/...')` paths that the current prefix matcher does not rewrite for production. Define resolution behavior for page-relative, root-relative, CDN, query-string, and encoded-space paths before Phase 4 migration; require local and production-origin checks in the architecture acceptance record. The definitive-drums SF2 bank is 256,317,998 bytes, so the proposed 250 MB disk default needs an explicit unit, overhead, and large-bank policy; keep disk and decoded-memory budgets separate. Model choice is unchanged.

Revision 3 - October 5, 2026. Phase 2 fixed the active local graphics/piano URLs, service-worker intro matching, and custom seek fallback. Carry those verified behaviors into the asset and media interface examples rather than redesigning them implicitly. Include production CDN integration validation and the unresolved Phase 1 browser timing/accessibility evidence as acceptance-check obligations; model choice and stop point are unchanged.
