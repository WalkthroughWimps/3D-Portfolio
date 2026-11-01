# Docs Face reader checkpoint — October 29, 2026

Paused at the human's explicit request. Resume only when requested. Chat renamed
**Docs Face**. No commit, push, publication or deployment performed.

## Requested scope

Compare the two supplied recordings; make the small Docs PowerPoint reader show
a scrollable slide view on the left and presentation on the right. Match the
site video player font, arrows, Return and fullscreen styling without audio/sync
controls. Fullscreen should stay in the current tab. Preserve the live deck's
animation and interaction.

## Completed and safe checkpoint

- Inspected both recordings. They show the live Microsoft embed and slide 15's
  click-driven sequence. The recordings are reference material, not instructions.
- Added an initial, **unintegrated** reader module at `_6-docs/library/reader.js`
  and reader styling in `_6-docs/docs.css`. These came before the competing Desk
  Focus Repair reservation. Do not treat this initial source module as finished.
- Saved the newer runnable implementation in this directory's
  `docs-face-reader-staging/reader.js`, `reader.css`, `reader-preview.html`.
  The original working copies also remain in `tmp/docs-viewer-review/`.
  The staging HTML uses absolute slide asset URLs and can be served directly.
- Generated 31 actual PNG thumbnails (384 × 216, about 1.06 MB total) under
  `_6-docs/assets/pretty-pets-slides/`, with source hash/provenance in its README.
  They are not yet referenced by the production manifest. Downloaded source
  `C:/Users/spami/Downloads/1st Grade Unit 3 Week 1.pptx` was read unchanged.
- Microsoft PDF/native download handling was unreliable; final thumbnails use
  the bundled presentation renderer instead. Montage inspected at
  `tmp/docs-viewer-review/slides-montage.png`. Thumbnail details may differ from
  Microsoft, especially overlapping animation states; main playback stays live.
- Staged module syntax passed. Browser showed the left rail, live deck on right,
  player controls, selected-slide state and disabled endpoint arrows. Same-tab
  native fullscreen entered/exited successfully using child
  `.docs-reader-screen` (requesting fullscreen on the dialog itself can reject).
  Selecting slide 31 updated the iframe URL to `wdSlideIndex=31`; separate live
  source inspection confirmed slide 15 loaded with that parameter and its
  animation content. Phone layout, fallback fullscreen and complete integrated
  lifecycle checks remain unverified.
- The local Docs page returned HTTP 200 at checkpoint.

## Coordination and reservations

The human explicitly authorized coordination-only messaging with
**Fix desk notes and document behavior**, thread
`01a18626-8689-7060-9be4-89e571992a7c`. That task owns the current desk/import/
nonmodal/PDF work and held the overlapping source reservation; no source writes
were made by Docs Face during that reservation. It is also pausing at the human's
request and will record its partial-work state. Read its final checkpoint before
resuming integration. Messages do not authorize this task to resume.

Docs Face's slide-preview reservation was released. Its subagent is stopped.
The brief checkpoint reservation must be released after saving this file.
Do not recover or release the other task's reservation on its behalf.

## Remaining phases and steps — all pending

1. **Source handoff and reread.** Check reservations and the Desk repair pause
   checkpoint. Acquire the complete intended set together, then reread current
   `docs-3d.js`, `docs.css`, `docs.html`, library `reader.js`, `schema.js`,
   `editor.js`, `documents.json`, and README. Include server schema files only
   if the latest implementation actually requires them. Preserve all inherited
   edits, nonmodal focus, live Constructor editing, outside/Escape dismissal,
   new import types, and two-page PDF behavior. Do not blindly copy staging.
2. **Reader integration.** Adapt the staged reader to the latest host. It owns
   `open(item, opener)`, `update(item)`, selected-slide URL jumps, rail and
   fullscreen. Same-source metadata updates must preserve current playback;
   changed source resets selection. Staging's optional `external`/`text` type
   handling is provisional: match the actual schema (Desk repair added
   `document`), and preserve host PDF/text/fallback handling. Avoid duplicate
   close/focus listeners. Fix the initial source `.docs-reader-ready`
   `display:flex` rule so closed dialogs remain hidden; staging has this fix.
3. **Slide metadata and editing.** Add validated optional slide metadata with
   safe local preview paths. Seed Pretty Pets' 31 thumbnail entries in
   `documents.json`. Preserve metadata when editing the same presentation;
   clear/regenerate it when replacing the source. New decks without metadata
   must keep usable native controls and hide the empty rail, not display an
   endless loading message. Supply meaningful captions where useful.
4. **Navigation limitations.** The public cross-origin embed has no verified
   parent slide-change bridge. Rail/outer arrows jump by changing
   `wdSlideIndex` and reload that slide. Keep the native Microsoft toolbar for
   animation steps and its own navigation. Outer counter must explicitly say
   **Selected slide**, because native navigation may move independently. Do
   not invent postMessage commands or pretend the outer counter tracks the
   embedded player. Document this limitation in the Docs README.
5. **Review and verification.** Review only this task's actual diff, syntax and
   relevant existing checks. Browser-check integrated rail scrolling, first/
   last slides, selected arrows, representative animated slide 15, metadata
   update without iframe reload, replacement/removal, focus restoration, Escape/
   outside close, actual and fallback fullscreen, closing while fullscreen,
   route disposal/reopen, and coexistence with PDF/import/Constructor behavior.
   Check 390 px and desktop layouts; the long selected-slide count plus four
   controls may need a compact/wrapping footer at narrow widths. Check all 31
   images load. No extra broad regression suite was run or requested.
6. **Handoff.** Update README/checkpoint with accurate evidence and remaining
   limitations, release owned reservations, and provide the relevant live
   preview. Leave commit/push/publication/deployment for explicit authorization.

The broader architecture program and other faces remain outside this task.

Live Docs: http://127.0.0.1:8878/_6-docs/docs.html?review=1

Saved staging: http://127.0.0.1:8878/_8-tools-and-notes/docs-face-reader-staging/reader-preview.html
