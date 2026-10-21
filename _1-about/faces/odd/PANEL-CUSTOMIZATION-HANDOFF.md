# Oddio panel customization handoff — October 20, 2026

Implemented in the shared local workspace; not committed/published/deployed. Entry/runtime/import revision: panel-custom-1. Preview: http://127.0.0.1:8878/_1-about/about.html?review=1&face=odd&oddio=panel-custom-1.

## Current state
- Single centered inner indicator lines on all five meters; brighter track-derived ink; assembly hover OR active sound emits, idle emission zero, muted red always. Existing main/track helix handedness unchanged pending clarification below.
- Clip gain is independent of cylinder track volume. clip.gain is unity by default, bounded0..1; lane.gain remains the track volume. Live gain-only edits don't pause. Copy/split/placement/undo preserve it; join bakes different gains once. Dry/effected exports apply clip gain. Sessions v4 store it; v1–v3 default clips to gain1 and preserve track levels.
- Both button pods have four outline orientations via two orthogonal flips. Icons stay upright/front-only. Supports enter the housing over the full rod height in all four orientations on both sides.
- Selecting either pod in Oddio placement reveals its enlarged 2D button layout. Full-slot drag swaps; used function dropdown selection exchanges actions; custom/theme colors; vector icon choices or bounded local PNG/JPEG/WebP uploads. Images resized<=128px, encoded<=32KiB, PNG/WebP signatures/dimensions validated before decode, stale callbacks cancelled. Built-in icons shared font-free vectors in both3D/2D. Repeated unchanged config/state reuses textures.
- Shared schema additions: addonTransportFlipX/Y, addonShuttleFlipX/Y, podTransportConfig/podShuttleConfig JSONstrings. All highlights/ink emission use shared contrast mapping.

## Evidence and limits
Targeted ESLint passes. 64 focused editing/audio-sync/clip-level/layout/core-settings checks pass. Additional actualThree math/geometry/source tests pass: meter lines/hover/sound/mute; input raycast drag/cancel/outside release; all pod flips/both sides/support-tip entry; configured actions; strict uploaded-image checks and actual texture decode; texture reuse; shared-store persistence and invalid-action rejection; fullrig update/disposal. Evidence: output/oddio-panel-customization/. Native Canvas orientation diagram was inspected and uses actual production geometry. It is not a live browser screenshot.

Local browser use is disabled in Work settings. No browser/native UI/GPU/upload interaction pass was possible for this request; do not claim one. Existing original user audio tabs were not reloaded. Fixture helpers under tmp/oddio-panel-customization/ use the same Three@0.159.0 module as the site for nonbrowser geometry/input checks; they do not bypass browser settings. Geometry loader: three-loader.mjs. Relevant checks: meter-checks.mjs, input-checks.mjs, pod-checks.mjs, icon-and-diagram-checks.mjs, rig-checks.mjs, settings-checks.mjs.

## Clarification still pending
Root asked via async input: should there be an INNER glowing spiral counterwound relative to the OUTER cut-through spiral window, should the OUTER window simply reverse current direction, or should the INNER mark remain the one straight centered line? User's sentence repeated "groove spiral" so this part was not guessed. Existing handedness is preserved. Apply the answer when received.

## Remaining phases / steps
1. Receive spiral clarification and implement the intended direction/inner marking.
2. Live browser review when available: actual DOM layout, all flips, button swapping/function dropdown, custom uploads, brightness/contrast, playback/clipgain/export listening. Source/geometry checks do not replace it.
3. Broader overall control layouts/flipping plates/2D-only placement and whole-panel swapping.
4. Whole-cube clearance and Cube Chat arm review; capacity decisions; real import, physical microphone and listening checks.
5. Optional Blender hardware assembly, reel/waveform refinement, continuous cloth/self-collision and fabrication/deployment audits.

Two sequential bounded GPT-6 Sol medium assignments completed geometry/panel work; root reviewed and corrected integration, support intersections, missing-font symbols, async/texture lifecycle, audio separation, tests and docs. No GPT-6.1 used. Reservation e05a9457-5f2d-401e-b77d-fc3ccfa3f43d released at handoff. Preserve inherited dirty/untracked source; do not reset/clean.
