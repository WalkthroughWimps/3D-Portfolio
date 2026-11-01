# Start loading and printed board slots — October 27, 2026

## Completed scope

The board texture now uses six subdued printed guides: two vehicle slots, a landmark supply slot, and three landmark face-up slots. Each guide is .92 board units wide versus a physical card's .84 (9.5% wider, with space around a centered card). The back artwork is drawn at 24% opacity. Repeated printed stack/shadow forms are removed so the guides cannot be mistaken for actual tabletop cards. The slots have sufficient spacing to avoid overlapping one another. No cards, rules, draw behavior, snapping, hands, collisions or input assignments changed.

`tools/build-world-map-board.py` derives the texture from the PDF-compatible Illustrator source, without saving or overwriting that source. It asserts the known source image/form inventory, removes 43 flattened printed-card/shadow form calls, keeps the existing separate runtime landmark overlay, uses the light-water palette, and renders a 2048×1447 JPEG. The small blue-grey wave paths are retained from the source. The tabletop URL versions this asset to avoid a cached old board. GPU texture resolution stays within the existing budget.

Start's HTML no longer declares the text introduction to be its initial active view. Its stylesheet hides that alternate view until the view owner explicitly selects it, so delayed module imports do not expose it. The visibility helper now checks both the HTML hidden property and the active-view class, preserving renderer-failure recovery with the new initial state. The no-JavaScript style explicitly shows the text introduction and hides the unavailable controller.

The shared stylesheet also hides utilities that otherwise briefly appear in their old body positions before the modern header moves them into its dock. This applies before bootstrap, using the existing blocking head script's saved-layout selection; it does not blank the page or delay its normal content. Genuine module/runtime startup errors release that guard. Shared bootstrap failures also send the failure signal; Start then reveals its text alternative. Legacy layouts and no-JavaScript pages keep their ordinary alternatives. Existing early suppression of embedded work headers/nav remains in place. Generated Start navigation was synchronized from the canonical shared header.

## Verification and limits

- All four edited JavaScript files passed scoped ESLint; module syntax was checked using module stdin (plain `node --check file.js` initially used the repository's CommonJS package mode and was therefore not a valid check for browser modules).
- `node tools/prepare-site-html.mjs check` passed after regenerating the stale Start navigation fragment. The local preview returned HTTP 200.
- Disposable copies of all seven main HTML entries, with scene modules held back, showed the Start text view at `display:none` and the six content-page old-position utilities hidden before bootstrap. These exercise initial markup/CSS under indefinitely delayed modules, not a pixel-by-pixel recording on every browser.
- Normal Start loaded the controller, toggled to text and back, and reloaded in controller mode. No animation/sound permission choices were changed during this check.
- A deliberately missing Start module exposed the text introduction and failure flag. A sandboxed no-JavaScript iframe exposed its introduction, selected work and six direct route links in the accessibility tree.
- Normal entry checks reached the modern header on all six content routes; Music was checked again after its initially delayed import completed. An embedded Graphics pre-module copy kept header and navbar at `display:none`.
- The live tabletop rendered the six subdued guides, preserved all 77 unique card identities, and reported the existing 80 geometries/six textures with no console errors. Hidden browser review tabs were closed.
- Evidence is under `output/start-board-loading-20261027/`: board sizing/opacity report, delayed/failure/no-JS fixtures, shell acceptance JSON, board proof and live tabletop screenshot. Fixtures are disposable validation output, not public routes or new test suites.

This completes the two requested fixes and the shared startup-pattern check. A comprehensive cold-cache/network-throttled frame capture on all supported physical devices remains broader release acceptance; no universal browser/device claim or deployment is implied.

## All remaining phases and steps

1. **Tabletop input:** basic object/camera RMB ownership; wheel-direction flips without queued triggers; intentional two-button gather excluding player hands and locked zones; uniform mouse SVGs and action legend.
2. **Tabletop modes and ownership:** controlled/full-tabletop modes; shared remembered hands; five-card draw limit and final deck quantities; keyboard equivalents and focus return.
3. **Tabletop placement:** supply/face-up snapping; one landmark per face-up slot; occupied-slot rejection and drag-only removal; three corresponding landmark highlights.
4. **Tabletop pieces and acceptance:** red/green vehicle sticks with graphic bulb ends and no collisions; card conservation, keyboard/device/lifecycle/performance acceptance. Optional Music screen/tablet enlargement is separate.
5. **Start entry:** remaining setup, overlays and fallback interaction acceptance, including slow-load and device checks.
6. **Reliability:** consent/settings/storage conflicts and failure gates; counted mount/dispose/BFCache/late-async cleanup; browser and screen-reader/device cases.
7. **Media:** shared controls; audible 2×, sync and pitch behavior; real fullscreen; keyboard isolation; six Videos caption drafts need proofreading/timing.
8. **Sticky notes:** mappings, cross-tab state, narrative adapters, occlusion and final content.
9. **Welcome and project content:** supplied human welcome video/calibration; factual case-study copy from the workbook and final project adapters.
10. **Navigation:** sitemap and hierarchy implementation/refinement; visitor and accessibility acceptance.
11. **Settings and input:** motion ownership/timing/easing audit; complete canvas/piano/card keyboard parity; Music prerequisites and remaining controller extraction.
12. **Maintenance and architecture:** copy/attribution; proven asset cleanup and editable manual; architecture phases 4–8, Music cache/leases/RAM/first-note work, performance/CI/artifact/release gates.
13. **Release:** deferred mobile/physical-device evidence and authorized release preparation; explicit model/release permission gates remain. No commit, push, publication or deployment occurred.

The expanded original checklist and dependency gates remain in [Every remaining phase and step](recruiter-entry-phase2-2026-10-26.md#every-remaining-phase-and-step). The completed card artwork phase is recorded in [its handoff](world-map-card-rework-20261027.md).
