# Docs desk and library handoff — 2026-10-28

## Completed scope

- Replaced the Docs About-cube host with the original desk, lamp, and uneven cabinet/drawers recovered from `assets/.blend/Puzzle Box Assets/.BL/Hexagon_Site_2.blend`. The source blend was not saved or changed. `tools/export-docs-desk.py` produces the self-contained derived model; provenance and tabletop bounds are in `_6-docs/assets/README-desk.md` and `desk-layout.json`. The desk is approximately 1.4 m wide; the derived GLB is 1,946,596 bytes.
- Added `_6-docs/documents.json`, physical paper meshes, a keyboard-accessible collection list, and a same-page reader. A4, Letter, widescreen, and custom proportions are supported without stretching covers.
- Added Settings → Constructor mode → Docs authoring, including file selection, metadata, cover, size/position/rotation/scale, reorder/remove, browser drafts, JSON import/export, and Save to project.
- Added bounded loopback upload and atomic manifest writes through `tools/local-admin/docs-library.mjs` and the review server. PDFs retain their original full contents; Poppler measures their first page and generates the cover. Images use their natural aspect ratio. Uploads accept PDF/PNG/JPEG/WebP, maximum 20 MB.
- Added the user-supplied Pretty Pets PowerPoint embed: 1st Grade Unit 3 Week 1, 31 slides. The live Microsoft presentation is retained rather than converted to static pages. Source: `https://1drv.ms/p/c/f747edb114afa405/IQTs_qJa-ZktSI1UUDdAu1tzAZL9weST4VV5sw633AkWFzU?wdAr=1.7777777777777777`.
- Updated the Docs summary, shortcuts, and generated sitemap entries to match the desk library.
- Connected shared sticky-note controls to all seven main pages. About/Graphics retain their existing adapters; Start/Videos/Games/Music/Docs use the generic scene adapter, with page-coordinate fallback when a safe surface cannot be resolved. Source-owned scene resources remain borrowed; note-owned resources are disposed by the adapter. Fixed hidden header-host icons, scene input stacking, cross-tab bundle refresh, source occlusion, and fallback icon drops.

## Main maintenance locations

- `_6-docs/README.md`: step-by-step owner editing workflow.
- `_6-docs/docs-3d.js`: desk camera, lighting, scene lifecycle, paper rendering, reader, sticky adapter.
- `_6-docs/library/schema.js`: collection/source validation and dimensions.
- `_6-docs/library/editor.js`: authoring UI and local upload/save requests.
- `_6-docs/docs.html` and `docs.css`: accessible list, reader, layout.
- `_7-shared-scripts/sticky-notes/scene-adapter.js`: reusable scene/page note attachment.
- `_7-shared-scripts/sticky-notes/index.js`, `data.js`, `sticky-notes.css`: shared note editing/storage/icon behavior.

## Verification and evidence

- Browser checks ran in hidden tabs to avoid stealing the user's focus.
- Original desk rendered with its cabinet and lamp; old cube and tool cards are absent. Camera framing shifts around the navbar/settings panels without changing model proportions.
- Pretty Pets opened anonymously and inline. Advancing from slide 1 to slide 2 worked through the embedded viewer; closing cleared the iframe source. This verifies the live full-deck path, not every individual animation.
- Uploaded a temporary existing résumé PDF. Source/upload SHA-256 matched. Letter dimensions were detected as 0.2159 × 0.2794 m. Save to project and reload retained the PDF and cover, and the full original opened in the reader.
- Removed that test entry and the two generated test files; final manifest contains only Pretty Pets.
- Physical note placement/selection/deletion passed on Docs, Start, and Music. Start note survived reload. Games icon drag opened the draft dialog and Cancel worked. About/Graphics icons remained available; Videos icon became visible outside its hidden header host. Deleted notes did not resurrect when another page saved.
- The final Music icon hit target is the note control, and a dropped note attached physically to the piano front rather than becoming a page fallback. Temporary notes were removed; published sticky-note JSON remains empty. The reusable browser note draft was reset to “New note”.
- Scoped ESLint and whitespace checks passed for the implementation slices. No exhaustive full-site regression suite was run. The viewport override did not change the hidden browser's reported 1280 × 720 viewport, so no phone-layout pass is claimed.
- Disposable evidence: `output/docs-desk-20261028/desk-page-final.png`, `presentation-inline.png`, `music-note-surface.png`, `desk-asset.png`.

## Remaining phases and steps

No required implementation remains for the desk/library assignment. Nothing was committed, pushed, published, or deployed.

1. Owner content: add further documents through Constructor, confirm PowerPoint anonymous viewing permissions, and review desk placement/covers.
2. Publication, only when requested: include the manifest, new local document assets, model, shared scripts, and server-independent public page changes in the normal deployment workflow. The authoring endpoint runs locally; the public static site does not accept uploads.
3. Optional broader verification: phone/tablet layouts and a full-site regression pass. Generic sticky notes do not add instanced-mesh support or new closed-book/open-book anchor mapping; those remain separate work.
4. Broader site backlog and architecture work remain outside this bounded Docs assignment; this handoff does not resume them.
