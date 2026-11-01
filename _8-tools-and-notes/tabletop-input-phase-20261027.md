# Tabletop basic input and slot follow-up — October 27, 2026

## Completed implementation

Printed draw guides retain their colour; discard guides use monochrome artwork, with the same subdued 24% opacity. The vehicle draw/discard column, landmark draw guide and three landmark face-up guides now share one grid in the bottom-left corner. Matching guide bounds touch. Left and bottom margins are both .08 board units; guides remain .92 units wide versus .84-unit physical cards. This only changes the printed board texture. It does not move or snap physical cards/decks or change game rules. The native AI is preserved; `tools/build-world-map-board.py` regenerates the combined JPEG and its sizing report under `output/tabletop-input-20261027/`.

The basic mouse owner is now `_3-graphics/shelf/tabletop-input.mjs`:

- LMB tap on a packet draws to the table; hold/drag moves a piece or overlapping hand. A fanned card tap still slides it clear, and a dropped single card still joins a fanned hand.
- RMB tap flips; RMB double-tap shuffles. Cut and random insert/stack click actions have been removed from the active controller and visible controls. The old model methods/helper remain untouched for later proven cleanup.
- RMB starting over a card owns that gesture and blocks camera rotation, including while the card is animating. RMB starting on empty table rotates the camera and cannot acquire a card by crossing over it later.
- Hold RMB on a card and tap LMB to fan/stack. Holding both buttons for 650 ms instead gathers loose matching single cards, once per hold, in either button order. Moving the two-button hold, releasing its original owner first, Escape, blur, suspension and disposal cancel pending work. No single-button hold gathers cards.
- Gathering excludes fanned hands, other stacks, supply roles, held/animating cards and locked/owned metadata. A supply packet can be the target, but a hand or locked slot cannot. Current player UI hands are separate from table bodies; controlled mode and actual locked zones have not been implemented in this slice.
- Wheel over a card flips in the wheel direction. A busy flip consumes further wheel events rather than queueing actions or leaking through to camera zoom. Wheel over empty table zooms; wheel while holding another type of piece retains rotation.
- First-button pointerdown stops propagation without cancelling compatibility mouse events. This is necessary for the second mouse button in a chord to remain observable. Pointer and compatibility mouse releases share one state owner, avoiding duplicate actions.

Eight local SVG mouse diagrams now use the same neutral body, proportions and stroke. Button colours denote tap, double-tap, hold/drag or scroll, with a text legend above the instructions. Tiny baked-in text is absent. Existing shared site mouse assets are not overwritten.

## Acceptance evidence and limits

Scoped ESLint and module syntax checks passed for the tabletop and new input owner; edited source passed diff whitespace checks. The local preview server returned HTTP 200. The live board and mouse guide were visually reviewed in a hidden browser.

Disposable browser acceptance drives the actual live runtime through its DOM controls and synthetic pointer/mouse/wheel sequences, then reads its existing diagnostic JSON. The harness temporarily tolerates native capture calls for synthetic pointer IDs; therefore it verifies event ownership/action semantics and conservation, not OS mouse capture or hardware behavior. It is validation output rather than an added repository test suite. Initial preparation raced a still-running draw animation, so its hand-protection setup was corrected to wait for a rendered settled state before gathering; production hand-protection code did not need a change for that preparation error.

The checked cases are rapid LMB drawing without Cut; RMB hold without gather/flip; card-versus-background camera ownership; down/up wheel bursts with no queued flips or zoom; input while a card is animating; RMB single/double actions; fan chord; gathering in both button orders while preserving a fanned hand and another supply; moving/releasing/cancelling a chord; blur cancellation. All card identities must remain conserved. Final per-case results, board dimensions and screenshots are retained under `output/tabletop-input-20261027/`.

The final gesture run passed 14 cases (`gesture-acceptance.json`), and the follow-up Escape case passed cancellation of both a pending gather and a delayed RMB tap (`escape-acceptance.json`). Rapid consecutive LMB taps also have a separate retained result. Every case conserved all 77 unique card identities. Mouse selection focuses the tabletop for its existing keyboard actions. The normal live page reported no console errors; its renderer remained at the existing six-texture base count. Hidden acceptance and preview tabs were closed after recording the final screenshot.

Physical mouse chords/capture, touch devices, screen readers and resource-counted navigation/BFCache/device performance remain broader acceptance gates. No automated game mechanics, hand limit, landmark locking/highlighting, stick geometry/colour or collision changes were included. No commit, push, publication or deployment occurred.

## Every remaining phase and step

1. **Controlled/full-tabletop modes:** retain one card owner and remembered hands between modes; show the controlled UI or the tabletop shortcuts; current-player selection, five-card draw limit and final deck quantities; keyboard equivalents and focus return.
2. **Placement and landmarks:** physical draw/discard alignment and snapping to the printed guides; supply/face-up areas; one landmark card per zone, occupied-slot rejection and drag-only removal; highlights for the three corresponding landmarks.
3. **Pieces:** red/green vehicle sticks with graphic bulb ends and no collisions; keep Manor character standees separate. Optional Music screen/tablet enlargement remains separate.
4. **Tabletop acceptance:** physical mouse/capture, alternate button-release orders and cancellation; keyboard/touch/accessibility; retained hands and card conservation after mode changes; repeated navigation, late async, BFCache and measured performance/resource cleanup.
5. **Start entry:** remaining setup, overlays and fallback interactions, slow-load/device acceptance and supplied welcome video/calibration.
6. **Reliability:** consent/settings/storage Save/Reset, conflicts, failures and revocation; counted mount/dispose/remount/BFCache/late-async ownership; browser, screen-reader and physical-device coverage.
7. **Media:** complete shared controls, audible 2×/sync/pitch/fullscreen/key isolation; proofread/time the six Videos caption drafts.
8. **Sticky notes:** mappings, cross-tab state, narrative adapters, occlusion and final content.
9. **Project content:** replace boilerplate using the factual workbook entries and complete project adapters/results where supported.
10. **Navigation:** sitemap/hierarchy refinement and implementation, visitor flow and accessibility acceptance.
11. **Settings/input:** motion ownership, timing and easing audit; complete canvas/piano/card keyboard parity; Music prerequisites and controller extraction.
12. **Maintenance/architecture:** copy and attribution; proven asset cleanup and editable manual; architecture phases 4–8, Music soundfont/cache/leases/RAM/first-note work, performance/CI/artifact gates.
13. **Release:** mobile/physical-device evidence, coherent release preparation and explicit model/release permission gates. No release action is authorized by this work.

Expanded dependency gates remain in [Every remaining phase and step](recruiter-entry-phase2-2026-10-26.md#every-remaining-phase-and-step). Earlier completed artwork/loading fixes are recorded in [card artwork](world-map-card-rework-20261027.md) and [Start loading](start-board-loading-20261027.md).
