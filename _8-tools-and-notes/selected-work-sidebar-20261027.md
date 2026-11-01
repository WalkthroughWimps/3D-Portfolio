# Selected-work sidebar — October 27, 2026

## Completed scope

Start now uses the preview sidebar's full-height purple rail, horizontal thumbnail/name rows and bottom résumé/email links. Sitemap remains in that footer. The rail is visible in the 3D welcome, text introduction and initial HTML/fallback state. It is not added to unrelated main pages.

Start and previews share the same rail classes and sizing in `start/project-overlays.css`. A reserved introduction area precedes Selected work. Start explains comfort setup and how to explore; each preview has contextual text. The existing video explainer preferences feed that area, with the title and text updating when a related video is selected. The former paragraph below the player is hidden when the sidebar supplies its explanation; a caller without that callback keeps the original paragraph fallback. No new factual project claims were introduced.

The rail's scrollable main section is separate from its footer, so résumé and email stay available together at the bottom. The original opener retains focus after Back, even after switching between works. Preview switching still disposes the prior iframe/media owner and preserves the surrounding shell.

The Start canvas keeps its full rectangle. Its existing full-size camera projection accounts for the rail's occluded area using offsets only; model scale, geometry, animation and frustum crop dimensions are not changed. On narrow screens the rail becomes a compact top section, with explanation, horizontal work choices and contact links. The view switcher and utility chrome sit below it. An inherited generic Start `section` rule was explicitly reset for the introduction so it does not acquire a boxed panel or excessive padding. The mobile preview grid receives an explicit rail height so its scrollable main area cannot collapse to zero.

## Verification

- Edited browser modules parse and pass scoped ESLint. Generated Start navigation was refreshed from the canonical shared header; `prepare-site-html` and diff whitespace checks pass.
- At 1280×720, Start and previews use the same 179.2×720 rail at (0,0). All four links use thumbnail/name rows. The footer remains within the viewport at y=619.3 with height 88.7.
- Start's canvas remains approximately 1268.7×710 at that viewport. The text introduction begins at x=179.2, exactly after the rail; document width remains 1280. This is DOM/layout plus source-projection evidence, not a pixel-level camera-matrix/device audit.
- Coursebooks, NeoTube Studios, Global Conquest and Go Plunky, Go! show their corresponding explanations and selected link. Switching video → frame removes the video's DOM; frame previews have one iframe. Back removes the modal and returns focus to the original work link, with the Start sidebar still visible.
- Choosing Music Videos from Related work changes both the preview heading and sidebar heading to Music Videos, and shows its current “Music-driven visuals and edits.” explanation. The old below-player paragraph is hidden and contains the same source text.
- At 390×844, Start has a 390×230 top rail, a nonzero scrollable main area and visible work/contact links. The coursebook preview uses the same 230px rail after its header; its main area is 157.7px tall, all four 64px work choices fit, and document width stays 390. This is an emulated viewport check, not physical-device acceptance.
- The normal browser reported no console errors. Evidence is in `output/selected-work-sidebar-20261027/`: Start/coursebook screenshots, switching JSON, narrow sizing JSON and the disposable narrow-layout view. Temporary hidden browser tabs were closed after verification.

No settings key, game mechanics, media asset, About face, shared header source, commit, push, publication or deployment changed in this slice. Concurrent Start controller work was preserved; only the reserved layout/projection paths were edited.

## Every remaining phase and step

1. **Tabletop modes:** controlled/full-tabletop UI, one card owner and remembered hands, active player selection, five-card draw limit and final deck quantities; keyboard equivalents and focus return.
2. **Tabletop placement:** physical deck alignment/snapping to guides; supply/face-up areas; one landmark card per zone, occupied-slot rejection and drag-only removal; the three corresponding map highlights.
3. **Tabletop pieces:** red/green vehicle sticks, graphic bulb ends and collision exclusions; keep Manor standees separate. Optional Music screen/tablet enlargement remains separate.
4. **Tabletop acceptance:** physical button chords/capture, cancellation and alternate release orders; touch/keyboard/screen reader; retained hands and conservation through mode changes; navigation/BFCache/late async and measured resource/performance checks.
5. **Start/welcome:** remaining setup, overlays, fallback and slow-load/device acceptance; supplied human welcome video and calibration. This layout pass does not close all entry acceptance gates.
6. **Reliability:** consent/settings/storage Save/Reset/conflicts/failures/revocation; counted mount/dispose/remount/BFCache and late-async ownership; browser, screen-reader and physical-device cases.
7. **Media:** shared controls; audible 2×, sync/pitch/fullscreen/key isolation; proofread and time the six Videos caption drafts.
8. **Sticky notes:** mappings, cross-tab state, narrative adapters, occlusion and final content.
9. **Project content:** replace boilerplate using the factual workbook entries; complete supported contributions/results and adapters.
10. **Navigation:** sitemap/hierarchy implementation and refinement; visitor-flow, keyboard, zoom and accessibility acceptance, including further physical narrow-screen evaluation of this rail.
11. **Settings/input:** motion ownership/timing/easing audit; complete canvas/piano/card keyboard parity; Music prerequisites and remaining controller extraction.
12. **Maintenance/architecture:** copy/attribution, proven asset cleanup and editable manual; architecture phases 4–8; Music soundfont/cache/leases/RAM/first-note work; performance/CI/artifact gates.
13. **Release:** mobile/physical-device evidence, coherent release preparation and explicit model/release permission gates. No release is authorized by this layout request.

Expanded dependency gates remain in [Every remaining phase and step](recruiter-entry-phase2-2026-10-26.md#every-remaining-phase-and-step). The prior [tabletop input handoff](tabletop-input-phase-20261027.md) retains that phase's completed scope and acceptance limits.
