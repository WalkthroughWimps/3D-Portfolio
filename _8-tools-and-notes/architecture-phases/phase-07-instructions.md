# Phase 7 Improve presentation and performance

Model: GPT-6.1 Sol | Reasoning: High | Complexity: Medium to high

Revision 7 | October 6, 2026 | Status: Not started

## Phase launch instruction

Execute Phase 7 only: Improve presentation and performance. Use GPT-6.1 Sol with High reasoning. Read this entire document, current repository instructions, and the required prior handoffs. Complete the instructions and acceptance gate, write _8-tools-and-notes/architecture-phases/phase-07-handoff.md, update affected future phase documents as authorized below, then stop. Do not start Phase 8 or deploy.

## Required context

Read all available phase-01 through phase-06 handoffs, especially phase-06-handoff.md. If a prerequisite gate is incomplete, resolve or report it before dependent work. Read Phases 5 and 6 handoffs and shared conventions from Phase 4. GPT-6 Luna at Medium may execute bounded markup or documentation tasks with explicit acceptance criteria; Sol verifies integration.

## Instructions

### Phase 6 partial extraction and timing prerequisite

Phase 6 is **INCOMPLETE**. Read `phase-06-handoff.md`, `phase-06-music-map.md` and the audit-only `phase-06-package-inventory.json`. Music now uses `instruments/catalog.js` for fixed definitions and `instruments/loader.js` for raw JS maps/sample metadata/SF2 headers. Shared video UI disposal is integrated at Music stop/bootstrap disposal through `ui/video-controls-lifetime.js`; RESET-DEBUG history hooks are gated and scope-owned. These changes do not constitute full Music audio/scene/page teardown.

Two pre-extraction and three post-change local runs exercised piano notes, sustain, panic, MIDI/track start-pause-seek-resume, rapid switching and bounded video position with consent restored afterward. At 48 kHz, C4 decode was 6.0-7.4 ms and the authored track lead remained 1,200 ms. These are software measurements on a local no-store server, not audible first-note latency or production-cold/saved-raw/prepared readiness. No perceptual/device timing tolerance or reference recording was obtained. Finish the Phase 6 timing-sensitive extraction gate before optimizing those paths.

Mixer/session/scheduler, scene/input/panel extraction and full resource cleanup remain Phase 6 work. Save UI, saved-byte integration and prepareForRecording are **not implemented**. Do not benchmark or style them as completed features. The fixed catalog actually uses MP3 maps, Salamander WAV drums and Hypersound for Dog; the latter has an inherited preset-name mismatch and program-0 fallback. Preserve its current behavior until resolved deliberately. The separate `music-2d.html` recorder is active and must be retained. Its start/stop smoke check is not a complete recording/transcription gate.

### Phase 5 presentation evidence to carry

Phase 5's partial Start refactor preserved the actual missing-value lighting initialization at `0.5` through `_0-start/start/settings-flow.js`; a saved `0` remains authoritative. Its October 5 local browser check showed the normal animation prompt, the subsequent controller-screen sound prompt, a denial path reaching the gallery, a Videos tablet grid, and a Games cabinet. Those were one desktop viewport and no durable screenshots; audio output, reduced motion, mobile, blocked storage, keyboard/focus, WebGL fallback, and repeated mount/dispose were not verified in that check. Start's inherited background look and debug panel were not redesigned. Complete Phase 5's structural gate before using these screenshots as a presentation baseline, then obtain durable comparable images and the missing scenarios in this phase. Shared controls view/input now live under `_7-shared-scripts/media/`; preserve their coordinate and capability behavior during styling.

An October 6 isolated browser fixture verified one Start dispose/remount while its animation prompt was pending, followed by the 3D sound prompt; a deliberately missing controller GLB showed the 2D overview and also remounted. That failure exposed a sound prompt waiting on the missing 3D screen; Start now shows the existing accessible DOM sound dialog in that case, and local denial advanced past it. The temporary fixture was removed. This narrows the remount and failed-asset gaps, but no durable baseline image, real unavailable-WebGL simulation, keyboard/focus sequence, mobile viewport, or audio-device check was obtained. `_0-start/start/camera-flow.js` now owns authored frame conversion/easing; preserve those camera timings in visual comparisons.

### Phase 4 presentation baseline

Initial navigation is now generated into the six content HTML files from `_7-shared-scripts/header.html`; Start retains its landing scene plus `<noscript>` links. `npm run prepare:site-html` writes marked header/import-map regions and `sw-asset-config.js`; `npm run check:site-html` verifies drift. Phase 4 added accessible names for the seven icon links and local browser checks of all seven page shells, but did not prove JavaScript-disabled navigation in a browser, true narrow viewport, durable screenshots, keyboard/focus, reduced motion, blocked storage, failed assets or WebGL fallback. Verify those here without rebuilding header delivery. Local visual comparison of Start 0.158 to 0.159 and Docs 0.160 to 0.159 is limited to one viewport; compare GLB color/lighting and the Start 0.5 versus shared 1 lighting fallback before styling work. Full music readiness timings and disk/RAM/eviction checks remain Phase 6/7 obligations.

Use the actual Phase 4-6 contracts plus `phase-03-architecture-decisions.md` sections 6, 8 and 9 and `phase-03-migration-plan.md`. Phase 4 now owns initial header delivery and HTML preparation; validate that implementation here rather than introducing another header system.

1. Complete accessible names for icon links, correct page landmarks and titles, and add meaningful descriptions. Verify the initial HTML navigation delivered by Phase 4 with JavaScript/fetch unavailable and preserve Start's distinct landing layout, public routes and visual identity.

2. Verify keyboard operation, focus visibility/order, dialogs, reduced-motion behavior, and HTML alternatives for 3D interactions. Test narrow layouts, direct page entry, unavailable WebGL, denied audio, and failed asset loading.

3. Consolidate CSS tokens and reusable component rules without changing appearance unintentionally. Remove inline/runtime styles only where a clear shared style owner exists. Compare baseline screenshots.

4. Measure load, long tasks, frame activity, media startup, and resource use before optimizing. Prioritize demonstrated costs: unnecessary redraws, offscreen scene work, eager media loading, and excessive textures. Preserve audio timing and active interaction responsiveness.

5. Run mobile/desktop and keyboard checks after changes. Report before-and-after measurements with the browser, device, scenario, and cache state so results are comparable.

6. Compare network-cold, disk-cached, and memory-prepared instrument startup and first-note timing. Test storage removal/eviction and shared SF2 packages. Verify the selected disk limit does not become the decoded-memory budget.

Record actual effective viewport, browser/device, origin/cache/consent state and durable screenshots. Validate the proposed decimal 250 MB disk cap and independent provisional 128 MiB preparation policy using Phase 6 measurements, including definitive-drums oversize handling and backend memory overhead. Check visible usage/removal, recovery after browser eviction and prepared-lease behavior. Preserve saved settings and explicitly evaluate the Start/shared lighting fallback before intentional visual changes.

## Acceptance gate

Accessibility and fallback scenarios pass; visual differences are intentional and recorded; route/navigation behavior is preserved; performance claims have comparable measurements; music and playback checks remain green.

Luna at Medium may handle explicitly scoped markup/documentation edits; Sol owns integration.


---


## Phase 7 handoff and update instructions

## Working rules

Work in C:\Dropbox\Resume Website. Inspect git status and preserve existing user changes. Record starting commit and dirty files, and separate inherited changes from this phase. Keep public URLs, stored preferences, playback behavior, 3D appearance, consent, and accessibility intact unless the approved phase scope explicitly changes them.

Use small reviewable changes and meaningful checks. Record exact commands, outcomes, and manual coverage. Do not label untested behavior as passing. Do not publish, discard unrelated work, or delete uncertain legacy files. If blocked, report INCOMPLETE with the precise remaining steps.

## Permission to update upcoming documents

The user authorizes Phase 7 to revise instructions for any later phase when findings, actual interfaces, file paths, dependencies, or completed work require it. Make those documentation updates before the handoff. This permission does not authorize implementing later phases, silently dropping requirements, or expanding into a new feature.

Editable source documents in _8-tools-and-notes/architecture-phases/phase-NN-instructions.md are authoritative. Update their revision/date and append what changed, why, which phase found it, and any effect on acceptance checks or model choice. Preserve phase numbers and stop points. Record moved or completed work explicitly so it is not repeated or lost.

Regenerate changed PDFs under output/pdf/phases/ from the latest Markdown and visually verify them. If a PDF cannot be regenerated, mark it superseded in the handoff and give the next model the current Markdown. Never rely on an older PDF attachment over a revised repository source. Preserve completed-phase instructions as history.

## Required pass off

Pass Phase 8 final visual references, accessibility results, measured performance changes, remaining limitations, and cleanup candidates. Identify unresolved product decisions separately from technical regressions.

Write _8-tools-and-notes/architecture-phases/phase-07-handoff.md. Include status; model/effort; starting/ending commit or working-tree references; changed files and behavior; inherited changes preserved; APIs, defaults, storage keys, events and URLs affected; exact validation results; known issues; rollback for this phase only; updated future documents with revision numbers; next-phase prerequisites; and all remaining phases/steps.

## Remaining phases after this phase

8 Clean up and validate the release

**END OF PHASE 7 - Save the handoff and any revised future documents. Stop here. The user selects the next phase.**

## Revision history

Revision 1 - October 5, 2026. Split from the original guide into a standalone phase document; added permission to maintain upcoming documents and bounded soundfont storage/preparation work. All implementation remains pending.

Revision 2 - October 5, 2026. Phase 1 captured route screenshots in a browser session but could not export durable files; its requested 390x844 override still reported 849 CSS pixels. Obtain saved desktop/mobile screenshots and verified viewport dimensions before comparing appearance. Reduced motion, unavailable WebGL, and blocked browser storage were not exercised. The start animation dialog reappeared on reload and its volume slider reset from 26 to 25; determine whether persistence is a product issue or test-environment behavior. Include these gaps in the accessibility/performance acceptance evidence. Model choice is unchanged.

Revision 3 - October 5, 2026. Phase 3 moved initial shared header delivery to Phase 4 with checked-in generated HTML, so this phase verifies and improves its presentation instead of rebuilding delivery. Added distinct decimal disk/MiB preparation budget measurements, visible saved-package management, and the lighting fallback comparison. Durable viewport/browser/timing evidence remains required. Model choices and stop point are unchanged.

Revision 4 - October 5, 2026. Phase 4 delivered generated initial navigation and icon link names, and recorded the local visual pin preview. It did not close the durable/mobile/accessibility/CDN or measured music gates above. This phase validates and improves presentation without duplicating header generation. Acceptance checks, model choices and stop point remain unchanged.

Revision 5 - October 5, 2026. Phase 5 recorded the actual Start 0.5 missing-value fallback and limited desktop prompt/controller, Videos, and Games screenshots; it did not close durable/mobile/audio/teardown coverage. Added the shared controls view/input paths and explicitly retained the Phase 5 structural prerequisite. Acceptance checks, model choices and stop point are unchanged.

Revision 6 - October 6, 2026. Phase 5 continuation observed Start 3D and missing-GLB fallback remounts, fixed the missing-GLB sound dialog, and extracted camera timeline math. It narrows, but does not close, fallback/teardown evidence; durable mobile, focus, audio and timing comparisons remain acceptance checks. Model choice and stop point are unchanged.

Revision 7 - October 6, 2026. Phase 6 recorded a partial catalog/raw-loader extraction, Music UI disposal, gated history instrumentation, local software timing and the actual default-package inventory. Added the uncompleted audio/resource/storage/preparation gates, separate recorder route and inherited SF2 preset mismatch. Acceptance still requires audible/device and browser storage evidence; no scope was removed or moved into this phase. Model choice and stop point are unchanged.
