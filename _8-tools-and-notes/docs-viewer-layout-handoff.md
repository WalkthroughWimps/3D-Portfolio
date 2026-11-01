# Docs viewer layout and paper shape handoff — 2026-10-29

## Scope and result

The Docs and sticky-note readers use the shared floating viewport bounds, so their centers and maximum sizes account for the actual Settings and Debug panel bounds and the navigation rail. The Docs presentation iframe retains a 16:9 content box. The shared sticky reader and DOM page notes now retain the square physical note shape, including multiline notes and the animation between a note and its focused view. Long note content scrolls inside the square reader. PDF attachment pages remain contained at their own page ratios inside that reader. The existing animation in `sticky-notes/index.js` uses one scale value for both axes; no nonuniform scaling was introduced.

The desk document meshes are owned by `paperGroup` in `docs-3d.js`. The sticky visibility toggle reaches only `createSceneStickyAdapter.setNotesShown`; it does not hide, remove, or rebuild `paperGroup`. The live Pretty Pets paper remained visible and its reader opened while notes were hidden. The user-created collection still contains Pretty Pets and the local review fixture note was deleted after verification.

## Changed source in this slice

- `_7-shared-scripts/sticky-notes/sticky-notes.css` and `index.js`: square reader and page note shape, height-constrained reader width, clipped page-note text, internal reader scrolling, and a wrapping controls row outside the scrollable note body. The other Docs/layout/font code was inherited from the preceding slice and retained.

## Verification

- At 1280 × 720, the DOM page note measured 153.59 × 153.59 CSS pixels and the focused reader 454.85 × 454.85. At 390 × 844, the reader measured 243.19 × 243.19. The rendered focused font changed to `Sticky Caveat` after selecting Caveat; Matt was the initial font.
- Hiding sticky notes set the DOM note to hidden while the Docs collection retained one item; Pretty Pets opened with a 986.67 × 555 iframe, exactly 16:9. Closing the reader and restoring notes left the red Pretty Pets paper visibly on the desk. The local review page rendered successfully.
- Both panels were returned to closed state, the responsive viewport override was reset to 1280 × 720, and the temporary `Layout verification note` was deleted. The final browser had zero DOM notes and one Docs library item.
- Scoped ESLint on `docs-3d.js`, `floating-viewport.js`, `sticky-notes/index.js`, and `sticky-notes/scene-adapter.js` passed. Existing `tmp/docs-viewer-layout/layout-evidence.json` holds the prior desktop and narrow panel geometry acceptance.

## Limits and remaining phases / steps

1. **Current bounded Docs layout and paper repair:** No further source step is identified. A final human look at the physical desk and note motion on their own device remains useful, especially if a differently sized note is added later.
2. **Hosted Pretty Pets content:** Verify the external OneDrive presentation signed out before a public release. It rendered real slide 1 of 31 in the local browser, but Microsoft has also intermittently returned its own temporary error, so remote availability is outside this site fix.
3. **Paused feature:** The separate PPT thumbnail, slide navigation, player, and fullscreen redesign remains paused; resume only on an explicit request and review the staged Docs Face handoff first.
4. **Release:** Review the inherited dirty workspace as a whole, then commit, push, publish, or deploy only on an explicit user request. Include any intended document originals, generated previews, and sticky bundle/assets in that release.
