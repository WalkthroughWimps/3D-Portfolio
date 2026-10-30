# Site maintenance guide

Start with the complete condensed guide, then open the chapter that matches your task. These are maintenance instructions for the person updating the site, including UI paths, source owners, saving behavior and bounded change recipes.

Originally drafted 28 October 2026; the linked edition was updated 29 October 2026. This guide describes the current working tree, including local changes that may not be published. All PDFs are searchable and have bookmarked contents.

The task-to-script supplement was source-checked on 29 October 2026. Use it when you know what you want to change but need the exact script, function or configuration anchor. Its 36 recipes contain 105 checked source references, with snapshot line numbers, UI routes and verification steps. Browser acceptance of those routes remains a separate check.

## Read the PDFs

| Guide | Use it for |
| --- | --- |
| [Complete condensed guide](../../output/pdf/site-guide/00-complete-condensed-guide.pdf) | Entire site at a practical overview level; start here. |
| [1. Everyday updates and saving](../../output/pdf/site-guide/01-everyday-updates-and-saving.pdf) | Finding the active source, choosing UI versus code, exporting and saving safely. |
| [2. Settings, Constructor and shared interface](../../output/pdf/site-guide/02-settings-constructor-and-shared-interface.pdf) | Shared settings, sections, motion, header, summaries and control ownership. |
| [3. About cube and faces](../../output/pdf/site-guide/03-about-cube-and-faces.pdf) | Host and all six faces; Oddio button layout and connecting controls. |
| [4. Page content and document library](../../output/pdf/site-guide/04-page-content-and-document-library.pdf) | Start, Graphics, Games, Docs; books, boards, document sources and placement. |
| [5. Video, Music and instruments](../../output/pdf/site-guide/05-video-music-and-instruments.pdf) | Media ownership, player changes, instruments, recorded tracks, MIDI and sync. |
| [6. Assets, layout and web performance](../../output/pdf/site-guide/06-assets-layout-and-web-performance.pdf) | Originals versus exports, model/material replacement, layout and performance checks. |
| [7. Troubleshooting, validation and maintenance](../../output/pdf/site-guide/07-troubleshooting-validation-and-maintenance.pdf) | Diagnosing failures, validation, release review and maintaining this guide. |
| [8. Where to change things](../../output/pdf/site-guide/08-task-to-script-reference.pdf) | Task-to-script/function lookup across every page and all six About faces. |
| [9. Script and function index](../../output/pdf/site-guide/09-script-function-index.pdf) | Alphabetical lookup for 61 scripts and 105 anchors; task links open the matching page in Chapter 8. |
| [10. Settings field reference](../../output/pdf/site-guide/10-settings-field-reference.pdf) | All 187 central schema fields: defaults, storage keys, ranges/options, UI routes and control owners. |
| [11. Asset and source reference](../../output/pdf/site-guide/11-asset-source-reference.pdf) | Runtime assets, confirmed authoring sources/exporters and unresolved provenance across the site. |

The original linked PDFs have relative footer navigation to the quick guide, task lookup and script index. The updated index also opens Chapters 10-11; their footers link to neighboring chapters. Keep the twelve PDFs together when moving or sharing them. Reader support/security restrictions can affect cross-file navigation; each PDF's internal contents and bookmarks remain independently usable.

[Download the complete PDF set](../../output/pdf/site-guide/site-maintenance-guide.zip). Extract it before opening the PDFs so relative links can resolve to neighboring files. The bundle includes the twelve PDFs, START-HERE instructions and the settings CSV/JSON.

## Update the guide

The numbered Markdown files in this directory are the editable source. The generator is `tools/build-user-guide.py`; outputs are in `output/pdf/site-guide/`.

Run from the repository root with a Python environment containing ReportLab and pypdf:

```powershell
python tools/build-user-guide.py docs/user-guide/03-about-cube-and-faces.md
```

If Windows resolves `python` to the Store alias, use the installed or bundled Python executable. Render generated pages with Poppler and inspect them before sharing. Update the source date, UI path, owning module, save/export behavior and verification recipe together when behavior changes.

The supplement's editable task records are [08-task-to-script-reference.json](08-task-to-script-reference.json). Rebuild it with `python tools/build-user-guide.py docs/user-guide/08-task-to-script-reference.json`. The builder verifies that every referenced file and literal anchor exists, then recalculates snapshot line numbers. It fails on missing anchors rather than silently printing a stale location. It cannot prove an existing function remains the active code path; recheck imports and behavior when a feature changes.

For the complete linked edition, run `python tools/build-user-guide.py --all`. This rebuilds all twelve PDFs, derives Chapter 9 from Chapter 8's current records and bookmarks, extracts the central schema for Chapter 10, validates every remote PDF destination and refreshes the ZIP bundle. Use the full rebuild after a chapter gains pages; do not hand-maintain index page numbers. `--index` regenerates only the alphabetical index after Chapter 8 is built; `--settings` regenerates Chapter 10 and its JSON/CSV metadata.

The settings metadata is available as [searchable CSV](10-settings-field-reference.csv) and [JSON](10-settings-field-reference.json). These are generated from the pure schema, not current browser values. Private face/content settings are outside that schema and are explicitly identified as separate owners. UI routes are starting points, not proof every field has a visible control. The additional [face settings route checks](face-settings-route-checks-2026-10-29.json) record visible headings for Fish, Refs, Skill, Clock and Notes; no setting values or content were changed during that inspection.

Screenshots are under `screenshots/` and embedded in Chapters 2-5. The [browser verification record](browser-verification-2026-10-29.md) records the checked routes and remaining acceptance work. These are selected navigation/label checks, not a full feature test run.

The original linked edition contained 79 reviewed pages, 542 validated cross-PDF links and 36 checked task destinations. The expanded edition adds the 23-page settings catalog and seven-page asset/source map, for 109 pages total. The settings catalog also explains eight private control/content owners that sit outside the central schema. The script index contains 61 scripts and 105 named source anchors. This does not establish compatibility with every PDF viewer or full feature acceptance.

For each new recipe, include the visible task, UI route, exact source path and named declaration/configuration anchor, change boundaries and verification steps. Keep existing recipes current instead of duplicating their implementation details across multiple guides.

## Remaining work and boundaries

- Extend browser acceptance beyond the selected checked routes, including content save/export/import round trips and device audio/microphone tests.
- Add further targeted screenshots as high-value recipes are verified; capture them again when the UI changes.
- Extend the private face-control/property inventories beyond the central 187-field catalog; confirm unresolved asset export relationships and original-file dependencies.
- Keep maintaining the chapter affected by each future change. A combined detailed volume is optional; the independent chapters are already usable.
- Folder moves, obsolete-file removal and the broader architecture/animation program are separate work. Quiet-window phases still require advance notice and approval.
- Desk work was stopped at the user's request. No release is implied by generating these manuals; mobile readiness remains a separate gate.

Files already generated remain on disk if chat usage ends. Unfinished work does not continue while execution is unavailable.
