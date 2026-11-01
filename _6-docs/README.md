# Docs desk and library

The Docs page is a Three.js desk scene in `docs-3d.js`. Its constructor editor is in `library/editor.js`, and `documents.json` is the project manifest. Covers, PDFs, and uploaded images live in `documents/`; the desk model and the supplied Pretty Pets cover live in `assets/`.

## Editing the collection

1. Open the local Docs preview, then **Settings → Constructor mode → Docs**.
2. Choose **New document**, enter its title and description, and select its type.
3. For a PDF, image, or other document, choose the file. Supported imports are PDF, PNG/JPEG/WebP, DOCX/PPTX/XLSX, ODT/ODP/ODS, RTF, TXT, and MD (up to 20 MB). For a live PowerPoint presentation, use **File → Share → Embed** in PowerPoint Web and paste the complete embed code or its source URL. Use a 16:9 size for widescreen presentations. Add an optional cover image.
4. Adjust paper size, desk position, rotation, or uniform scale if needed. Choose **Save document** to preview the browser draft.
5. Choose **Save to project** to write the collection into this local website. Publish the changed manifest and uploaded assets through the normal site deployment workflow when ready.

An uploaded PPTX remains available in its original format; use a hosted PowerPoint embed when visitors need to play slides and animations inline. The hosted deck's viewing permissions must allow your intended visitors to open it. Test the published presentation signed out. The embed's width and height do not fix the reader to 1920 × 1080: the website sizes the viewer to the available screen.

Use the page's Constructor panel to add, remove, reorder, or edit documents. Click a desk document to focus it for reading, then use **Edit in Constructor** to change its title, description, cover, and placement while it remains open. File uploads are handled by `tools/local-admin/docs-library.mjs` through the loopback review server. The endpoint assigns UUID filenames and preserves complete originals. PDFs get a first-page cover and up to 120 page JPEGs when Poppler is available. Two-page view, page arrows, and an optional single cover page use those JPEGs; longer PDFs retain a full-original link for later pages. Other document formats use an original-file link, while TXT and MD also show plain text in the focused reader. The manifest is validated and written atomically to `documents.json`.

Browser changes are kept as a local browser draft until **Save to project** is used on the local review site. Import and export operate on the JSON manifest. Uploaded files are project-local; presentation links remain external HTTPS Microsoft links.

Pretty Pets is a 31-slide PowerPoint deck hosted in the supplied OneDrive presentation. Keep its source link in `documents.json`; do not replace it with a cover-only upload, because the hosted presentation provides the full deck and its animations.

PDF and image dimensions are stored in metres for the physical paper meshes. The original desk layout and tabletop bounds are documented in `assets/README-desk.md` and `assets/desk-layout.json`. For PDF uploads, the review server reads the first-page dimensions from `pdfinfo`; images are measured by their natural pixel ratio in the editor. The preview uses a contain fit when its ratio differs from the paper.

## Review checks

The hosted Pretty Pets presentation opens inline in the Docs reader and contains all 31 slides. Advancing to the next slide works, and closing the reader clears the iframe source. Keep the external OneDrive presentation URL as the source; the browser does not upload or convert the full PowerPoint deck.

The local review flow was checked with a PDF upload: the saved original matched the source file's SHA-256, and its Letter page size was read as `0.2159 × 0.2794 m`. Saving the collection to the project and reloading the page retained both the PDF and its cover image.

The temporary PDF entry, uploaded test files, and sticky notes used for validation were removed afterward. The shipped collection contains Pretty Pets only. Additional evidence and limitations are recorded in `_8-tools-and-notes/docs-desk-library-20261028.md`.

## Desk focus and imports repair — 2026-10-29

Desk documents and placed sticky notes now open readable nonmodal focus views. Each has Previous/Next item controls, a clear Close control, Escape and outside-click dismissal, and an **Edit in Constructor** action. Constructor interactions leave the reader open and saved edits refresh the focused content. At narrow widths, the reader keeps valid viewport bounds and temporarily hides the mouse-control dock while focused, restoring it when closed. Shared sticky attachments use root-relative URLs, so they work from every page; the unplaced note draft does not accept files.

PDF uploads retain the full original and, when Poppler succeeds, up to 120 page JPEGs. Both desk PDFs and PDFs attached to notes support two-page spreads, single-page mode, page arrows, and cover-first on/off. The Desk Constructor saves its default cover-first preference; later changes update an open reader immediately. TXT/MD files read as plain text in the focus view. Office and OpenDocument files remain available via their original-file links. File imports and project saves require the local review server; the public static site does not accept uploads.

The lamp is moved in world space by +0.04 m X and +0.02 m Z. Its base remains on the angled leather tabletop with at least 0.034 m measured clearance. Lamp meshes block sticky attachment hits and are excluded as note surfaces; the Constructor rejects document footprints overlapping the lamp's measured base area. The editor still uses the tabletop axis-aligned rectangle for general paper placement, so a manually entered position near an angled desk edge should be visually reviewed.

Local acceptance used an isolated review origin and disposable fixtures: a five-page PDF showed cover-first 1 → 2–3 → 4–5, cover-off 1–2 → 3–4 → 5, and single-page navigation in both Docs and sticky readers; real page images loaded. PDF originals were byte-identical to their uploads. TXT content rendered inline, including sticky attachments; image previews loaded. Office and image uploads were accepted, invalid HTML rejected, and the manifest handler validated atomic saving in a temporary root. Focused title and PDF cover-preference edits updated an open Docs reader; sticky text editing, note Previous/Next, click versus drag, 390px Close hit targets, lamp note-drop rejection, and lamp visual placement were checked. The final main-preview screenshot is `tmp/desk-focus-review/desk-final.png`; detailed disposable results are in `tmp/desk-focus-review/verification.json`. Scoped ESLint and whitespace checks passed. The main Docs preview returned HTTP 200 without browser errors. All twenty disposable uploaded files and both QA notes were removed, and the isolated library was restored. The published collection was never changed.

Changed source in this repair: `docs-3d.js`, `docs.css`, `docs.html`, `library/editor.js`, `library/schema.js`, `tools/local-admin/docs-library.mjs`, `_7-shared-scripts/sticky-notes/{index.js,data.js,scene-adapter.js,sticky-notes.css,README.md}`, and this README. The separate `library/reader.js` and Pretty Pets slide assets were preserved.

### Remaining phases and steps

1. Continue the separate staged Pretty Pets slide navigation/reader work only in its owning Docs Face task, with fresh reservations and review. This repair did not integrate or replace `library/reader.js` or slide assets.
2. Add owner content in Constructor, review covers/placement, and confirm hosted PowerPoint anonymous access before publication. A wider mobile/tablet and site-wide regression pass remains optional.
3. Commit, push, publish, or deploy only after an explicit request. Include any chosen manifest, local document originals, generated PDF page images, and shared sticky-note bundle/assets in that release.

## Desk sticky paper contact — 2026-10-29

The yellow square with a dark border and upper-left text is a sticky note painted by the shared scene adapter, not the Pretty Pets document mesh. On the Docs desk, new anchors on the actual `Desk_Leather` mesh use the raycast contact point. Existing saved leather anchors are projected back onto their source mesh triangle when displayed, so the former clearance offset does not lift the note. Other Docs surfaces retain their previous clearance. A 0.7 mm render separation prevents surface flicker. The note's rotated and scaled full footprint is checked against the lamp blocker and the real leather surface at all four corners; new placements overlapping the lamp are rejected. Saved notes are moved to the nearest supported clear position when possible. An oversized saved note is rendered smaller only if its full saved size cannot fit; its stored size, text, and anchor remain unchanged. If no position fits even at the minimum render size, the note remains visible at its original position.

The separate hosted PowerPoint reader work remains paused. Remaining steps for this contact repair: verify the live desk view and placement beside the lamp in the browser. No commit, push, publication, or deployment was requested.
