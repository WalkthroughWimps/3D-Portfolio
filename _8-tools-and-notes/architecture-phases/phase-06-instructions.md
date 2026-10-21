# Phase 6 Refactor the music subsystem

Model: GPT-6 Astra | Reasoning: Extra high | Complexity: Very high

Revision 6 | October 6, 2026 | Status: Not started

## Phase launch instruction

Execute Phase 6 only: Refactor the music subsystem. Use GPT-6 Astra with Extra high reasoning. Read this entire document, current repository instructions, and the required prior handoffs. Complete the instructions and acceptance gate, write _8-tools-and-notes/architecture-phases/phase-06-handoff.md, update affected future phase documents as authorized below, then stop. Do not start Phase 7 or deploy.

## Required context

Read all available phase-01 through phase-05 handoffs, especially phase-05-handoff.md. If a prerequisite gate is incomplete, resolve or report it before dependent work. Read Phases 3 through 5 handoffs. Confirm the live music entry point again. Preserve reference recordings, timing checks, and instrument settings before extracting code.

## Instructions

### Phase 5 prerequisite and shared controls contract

Phase 5's handoff, updated October 6, is **INCOMPLETE**. Its Start mount now scopes 104 page listeners and owns controller renderer/scene, audio graph, and media cleanup; `_0-start/start/settings-flow.js`, `accessible-controls.js`, `media-calibration.js`, and `controller-scene.js` are partial Start extractions. The Videos and Games page orchestration/cleanup extractions remain undone. Do not treat their browser smoke renders as full behavioral or teardown gates. Resolve or explicitly carry this dependency before a Music change that relies on it; do not silently move Phase 5 implementation into Music.

The October 6 continuation also extracted Start's authored frame/easing math to `_0-start/start/camera-flow.js` and added mount `suspend()`/`resume()`. A local same-document dispose/remount worked during a pending prompt, and a deliberately missing GLB reached the 2D fallback and remounted. These bounded checks do not close Start's full interaction, device, or resource gate, and they do not change Music's shared contract.

Shared drawing/UI and pointer hit testing now live in `_7-shared-scripts/media/controls-view.js` and `controls-input.js`, with `shared-video-controls.js` re-exporting the old names. `createVideoControlsUI()` adds `dispose()` to release pointer-lock interaction and a pending borrowed preview `seeked` listener. Existing Music call sites in `music-piano-controls.v2.js` still import the facade and do not yet call `dispose()`. Phase 6 must integrate this UI disposal for Music-owned instances and verify its video controls, without changing the borrowed-media rule or the `[0,1]` seek clamp. The pure input factory takes state/layout/capability/viewport providers and `snapSyncMs`; CSS client coordinates map to logical canvas dimensions supplied by the view. Phase 5's controller replacement test proved old media listeners detach on `refresh()` and neither old nor new borrowed element is paused by controller disposal. Browser-level replacement, late async, and device checks remain open.

### Phase 4 interfaces and music migration details

`_7-shared-scripts/storage/soundfont-store.js` exports `createSoundfontStore({manifest,indexedDB,fetcher,resolveUrl,cryptoApi,navigatorObject,budgetBytes,channelFactory})`, returning `list`, `saveSelections(ids,{signal})`, `removeSelections(ids)`, `removePackage(id)`, `usage`, `readFile(packageId,path,version)`, `subscribe`, `dispose`. `_7-shared-scripts/storage/soundfont-management-view.js` exports `mountSoundfontManagementView({store,root,labelFor,signal})`. `data/soundfont-packages.json` v1 currently lists only the four measured SF2 banks with SHA-256/lengths and placeholder selection IDs (`arachno-bank`, `definitive-drums-bank`, `hypersound-bank`, `wappydog-bank`). Map the active v2 catalog's real instrument IDs and add its per-instrument packages before exposing Save. One bank/version must serve every selected preset; `readFile` returns raw Blob and never decodes it. The store does not intercept script URLs or synth loading. Integrate saved SF2 ArrayBuffers and soundfont JS execution/CSP explicitly, without changing ordinary fallback order or saving on play/prepare.

The application cap remains decimal 250,000,000 bytes with `max(1 MiB,5%)` charge: Arachno is 155,405,818 payload bytes and fits alone; definitive-drums is 256,317,998 payload bytes and fails before download. Browser IndexedDB, quota/eviction, large-file peak memory and package transaction behavior remain unverified gates from Phase 4. The current verification path stages a full Blob ArrayBuffer for SHA-256; measure and replace it with bounded hashing if this fails representative devices before offering large-bank saves. `getSharedSettings().get().audio` and `patch({audio:{...}})` own global volume/mute/sync/pitch; `audio-settings.js` provides thin `getSavedAudioSettings`, `getEffectiveAudioSettings`, `patchAudioSettings`. Cookie/local audio consent remains independent through `audio-consent.js`. `audioLeadTrimMs`, mixer keys and the 128 MiB preparation budget are still this phase's separate work. The active entry is still `music-piano-controls.v2.js?v=2026-01-05-2`.

Follow `phase-03-architecture-decisions.md` sections 3-5 and 8-9 and the Phase 6 file order in `phase-03-migration-plan.md`, reconciled with Phases 4/5 handoffs. Phase 4 owns disk infrastructure; this phase connects catalog IDs, saved-byte loading, visible selection/usage/removal, and preparation. Preserve the active v2 entry and uncertain legacy files.

1. Map state ownership and clock domains for audio playback, MIDI scheduling, recording/transcription, visual animation, and video sync. Document timing tolerances from the baseline before changing implementation.

2. Extract instrument catalog/loading, synthesis/audio graph, mixer settings, and MIDI scheduling in separate steps. Preserve sustain, note release, overlapping notes, instrument switching, loading failures, and browser audio-unlock behavior.

3. Extract scene/rendering, hit testing, keyboard input, and panel UI. Use shared media contracts where applicable while preserving music-specific semantics. Retain the existing transcription module boundary unless evidence justifies a change.

4. Move history instrumentation and diagnostics behind the debug entry point. Add explicit disposal for scheduled audio, timers, listeners, buffers where appropriate, and GPU resources. Remove a legacy music implementation only after references and runtime use have been verified.

5. After each extraction, verify audio start/pause/seek, MIDI playback, sustain, rapid switching, recording/transcription, and video synchronization. Retain a rollback point for every completed extraction.

6. Integrate explicit Save in this browser selections with Phase 4 storage and the ADR prepareForRecording API, including version/dedup/quota/eviction/removal, progress, cancellation, invalidation and memory leases. Ordinary play/preparation never opts into saving. Validate the provisional 128 MiB preparation budget separately from the proposed 250,000,000-byte disk cap; preserve existing single-instrument playback. Never eagerly decode all saved packages or report unsupported multibank sets ready. New recording or AudioWorklet work needs separate scope/evidence.

## Acceptance gate

The documented music behavior and timing tolerances pass browser checks. No stuck notes, duplicate scheduling, unexpected consent changes, or material sync drift occur in the tested scenarios. Each subsystem has explicit state ownership and cleanup. Missing audio-device/browser coverage is disclosed.

Measure timing tolerances before extraction; compare network-cold, saved-raw and memory-prepared readiness/first-note timings. Verify mixer migration, separate audioLeadTrimMs semantics, saved-byte CSP/backend loading, large banks, leases/cancellation and quota/eviction while playing. Partial preparation is not ready; missing timing/device evidence remains an open gate.

Use the primary model for this phase.


---


## Phase 6 handoff and update instructions

## Working rules

Work in C:\Dropbox\Resume Website. Inspect git status and preserve existing user changes. Record starting commit and dirty files, and separate inherited changes from this phase. Keep public URLs, stored preferences, playback behavior, 3D appearance, consent, and accessibility intact unless the approved phase scope explicitly changes them.

Use small reviewable changes and meaningful checks. Record exact commands, outcomes, and manual coverage. Do not label untested behavior as passing. Do not publish, discard unrelated work, or delete uncertain legacy files. If blocked, report INCOMPLETE with the precise remaining steps.

## Permission to update upcoming documents

The user authorizes Phase 6 to revise instructions for any later phase when findings, actual interfaces, file paths, dependencies, or completed work require it. Make those documentation updates before the handoff. This permission does not authorize implementing later phases, silently dropping requirements, or expanding into a new feature.

Editable source documents in _8-tools-and-notes/architecture-phases/phase-NN-instructions.md are authoritative. Update their revision/date and append what changed, why, which phase found it, and any effect on acceptance checks or model choice. Preserve phase numbers and stop points. Record moved or completed work explicitly so it is not repeated or lost.

Regenerate changed PDFs under output/pdf/phases/ from the latest Markdown and visually verify them. If a PDF cannot be regenerated, mark it superseded in the handoff and give the next model the current Markdown. Never rely on an older PDF attachment over a revised repository source. Preserve completed-phase instructions as history.

## Required pass off

Pass Phase 7 the music module map, timing model, regression scenarios, known browser/device limitations, resource ownership, and performance baseline. Identify which legacy files are now proven unused for Phase 8 cleanup.

Write _8-tools-and-notes/architecture-phases/phase-06-handoff.md. Include status; model/effort; starting/ending commit or working-tree references; changed files and behavior; inherited changes preserved; APIs, defaults, storage keys, events and URLs affected; exact validation results; known issues; rollback for this phase only; updated future documents with revision numbers; next-phase prerequisites; and all remaining phases/steps.

## Remaining phases after this phase

7 Improve presentation and performance; 8 Clean up and validate the release

**END OF PHASE 6 - Save the handoff and any revised future documents. Stop here. The user selects the next phase.**

## Revision history

Revision 1 - October 5, 2026. Split from the original guide into a standalone phase document; added permission to maintain upcoming documents and bounded soundfont storage/preparation work. All implementation remains pending.

Revision 2 - October 5, 2026. Phase 1 confirmed `_5-music/music.html` loads `music-piano-controls.v2.js?v=2026-01-05-2`; other piano copies are not main-route entry points. The active file has 298 inherited lint errors. Local `/glb/toy-piano.glb` returned 404 while `/assets/glb/toy-piano.glb` returned 200; verify the Phase 2 fix before timing or extracting audio code. Per-instrument OGG-JS packages are about 2.7-4.6 MB; SF2 banks are shared, up to 256,317,998 bytes. Capture cold/warm and first-note timings in a browser after the model loads; Phase 1 could only measure file bytes. The acceptance gate requires this timing baseline or an explicit coverage gap. Model choice is unchanged.

Revision 3 - October 5, 2026. Phase 3 chose IndexedDB for explicit saved soundfont selections and assigned this phase the catalog/loader/UI integration plus prepareForRecording, cancellation and memory leases. Disk budget remains a proposed 250,000,000 bytes; provisional background preparation is independently 128 MiB and requires backend/peak-memory validation. Added version/dedup/eviction/readiness/mixer and timing checks without adding recording or AudioWorklet implementation. Model choice and stop point are unchanged.

Revision 4 - October 5, 2026. Phase 4 added the concrete optional store, management view, four-bank digest manifest, settings facades and budget result above. This phase must map real v2 catalog IDs, wire saved bytes/UI and preparation, and close the still-unverified IDB/quota/peak-memory gates before calling persistence ready. Acceptance checks and stop point remain; model choice is unchanged.

Revision 5 - October 5, 2026. Phase 5 found the shared controls facade still used by Music and extracted controls view/input behind it, adding UI disposal. Phase 5 remained incomplete after Start, so Videos/Games completion is a prerequisite rather than presumed done. Music acceptance now checks disposal of its own controls UI and preserves borrowed media; model choice and stop point are unchanged.

Revision 6 - October 6, 2026. Phase 5 continuation added Start camera timeline helpers and bounded 3D/fallback remount checks, but left the Start, Videos, and Games acceptance gate incomplete. Music's facade/disposal dependency and acceptance checks remain; model choice and stop point are unchanged.

