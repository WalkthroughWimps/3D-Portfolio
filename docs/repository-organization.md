# Repository organization

Snapshot: October 28, 2026. The current phase adds documentation and source navigation while other chats continue editing. No existing source, asset, tool or historical record is moved, renamed or deleted. Before a phase requires a quiet window, Overall Site must notify the human and wait for their go-ahead.

## Essential housekeeping completion

The human limited this pass to essential housekeeping. The reference index, page/feature source map, folder inventory and root README navigation are complete. Final checks resolved all 147 local file links and all 12 Markdown heading links across the four documentation files; the local site returned HTTP 200. Runtime/browser behavior was not changed or accepted by these documentation checks.

Stop here for this pass. All utility archiving, existing-path reorganization, runtime/asset migrations and PDF production below remain deferred. No automatic cleanup follow-up was created, and no commit, push, publication or deployment occurred. The next implementation must reread the current files and reservations because the Docs and sticky-note owners were still working during these checks.

## Folder purposes

| Location | Purpose and handling |
| --- | --- |
| `_0-start` through `_6-docs` | Page-owned runtime code and supporting assets. Keep these familiar page groups; document feature boundaries inside them. |
| `_7-shared-scripts/core` | Shared startup, settings, interface, input and lifecycle infrastructure. |
| `_7-shared-scripts/media` | Shared media input, drawing, controller and transport modules. Root-level media wrappers also remain active or compatible entry points. |
| `_7-shared-scripts/panel-assembly` | Shared panel construction, section folding and Settings/Constructor transfer. Skills has ownership responsibilities here. |
| `_7-shared-scripts/constructor`, `sticky-notes`, `scene`, `storage` | Related shared feature families. Check public exports before merging wrappers into them. |
| `debug` | Runtime Settings/Constructor host as well as diagnostics. The name does not mean its entire contents are debug-only or removable from production. |
| `js` | Common site utilities and phone-readiness notification. These remain referenced by HTML. |
| `assets` | Shared runtime resources, vendor files/licenses, selected-work graphics, annotations and some original authoring files. Not the only legitimate asset location. |
| `Videos`, `Renders`, `music`, `midi`, `soundfonts` | Local copies of hosted media families; ignored large inputs can be required at runtime or during validation. Preserve external object keys. |
| `soundfont-staging` | Ignored staging material distinct from runtime `soundfonts`. Confirm the import/build workflow before archiving. |
| `games` | Exported playable projects plus some original board-game authoring packages. Distinct from `_4-games` cabinet and `_3-graphics/shelf` freeform tabletops. |
| `data` | Runtime manifests and catalog data, including dependencies, attribution, soundfont packages and site map. |
| `source-files` | Editable design originals and machine-readable preparation recipes. Some are consumed by maintained tools. Preserve originals. |
| `tools` | Review server, generation, import/export, packaging and validation utilities. `package.json` defines many entry points. Local admin tools can be ignored and still support authoring on this workstation. |
| `docs` | New current reference, source map and organization plan. Historical handoffs remain where they are. |
| `_8-tools-and-notes` | Existing phase instructions, workflow docs, coordination contracts, dated handoffs and assorted scripts. Separate their purposes through an index before changing their paths. |
| `labs` | Separate labs wrapper/build workflow. Do not assume it is all disposable scratch. |
| `output` | Retained per-task evidence, screenshots, generated studies and release artifacts. Many handoffs reference exact paths. |
| `outputs` | Named deliverables, including recruiter planning workbooks and visual candidates. Do not merge into `output` until every referenced deliverable is mapped. |
| `tmp` | Ignored local working data and fixtures, including active reservations. Review provenance before removing old material; never remove live coordination state. |
| `blender-cleanup` | Named Blender study/deliverables with their own README and verification. Preserve source and accepted results. |
| `about-ring-pattern-capacity` | Focused local benchmark material. Purpose/retention needs confirmation before cleanup. |
| `Combiners`, `unused` | Ad hoc/historical material needing provenance review. Names alone are not deletion approval. |
| `errors.local` | Ignored local error/diagnostic material; preserve relevant evidence. |
| `.github` | Repository automation. Moves can affect workflow paths and packaging assumptions. |
| `.venv`, `node_modules`, `.vs`, `.vscode` | Local dependencies/editor configuration. Outside this organization pass; do not move or uninstall them. |

## Naming and placement rules

1. Put new page-only behavior beside its page or feature. Put shared behavior in an existing shared feature family, with a clear owner and small public interface.
2. Put new maintained prose in `docs`, linking dated implementation evidence rather than copying it. Keep coordination contracts and existing cited handoffs at their current paths until a coordinated documentation migration.
3. Put maintained command-line utilities under `tools`, with their invocation and input/output paths documented. Distinguish generators that write source from read-only audits.
4. Put new retained validation evidence under `output/<descriptive-task>/`; use `tmp` for disposable intermediates. Keep existing `outputs` deliverables stable until mapped.
5. Keep page/feature assets local when they have one owner; use shared `assets` for shared resources. A repeated `images` or `assets` folder inside a named feature is acceptable.
6. Distinguish original artwork, generated runtime exports, manifests and attribution. Avoid new `final2`, `(1)` or unlabelled backup copies beside active modules; use version history or an explicitly documented archive.
7. Preserve live URLs and saved identifiers. Filesystem neatness alone does not justify a breaking URL, content, anchor or storage migration.

## Cleanup candidates

| Candidate | Current evidence | Required next step |
| --- | --- | --- |
| `_5-music/music-piano-controls.js` and `music-piano-controls.v2(1).js` | Main Music HTML loads `music-piano-controls.v2.js`; earlier architecture audit also identified alternatives. | Trace separate routes, transcription, tests, external consumers and owner intent. No archival/deletion approved. |
| `_0-start/stupid.html` and `stupid.js` | Separate alternative route; an existing artifact contract explicitly preserves it. | Decide route support with the human and update packaging/reference expectations before any move. |
| `_8-tools-and-notes/encode.py`, `encode2.py`, `fix_snippets.py`, `fixSnippet.py`, `change_css2.py`, `insert_debug.py` | Similar or task-specific utility names mixed with documentation. | Inspect inputs, output writes, invocation references and ongoing workflows; propose exact destinations and forwarding notes. |
| `Combiners`, `unused`, benchmark and staging folders | Bounded searches did not establish current consumers for all contents. | Inventory original files and dependencies; obtain ownership/retention decisions rather than treating absent imports as proof. |
| `output`, `outputs` and `tmp` | Contains cited evidence, user deliverables and active working data. | Build a retention map; preserve originals and referenced records. No bulk cleanup. |
| Root README and old handoffs | Recorded test counts and some feature descriptions belong to older checkpoints. | Link current source reference; retain historical results with dates, and use fresh check output for current acceptance. |
| Legacy/shared wrapper modules | Shared functionality spans `core`, root shared modules, `debug` and `js`. | Trace runtime imports, compatibility API and lifecycle ownership before consolidation; this is code refactoring, not a folder-only move. |

## What needs a quiet window

Adding this isolated documentation and tracing dependencies can run alongside page work. Moving a page/face directory, shared runtime module, generated-header source, external media family or an asset used by an active author/exporter requires a coordinated window. A reservation prevents participating agents editing the same paths; it cannot make a planned edit based on an old path safe.

Before requesting the window, prepare a concrete move list with old/new paths, all known callers/generators/manifests, external URL strategy, saved-data compatibility, acceptance checks and a file-specific rollback. Ask affected active owners about unpublished work and current commands. Then notify the human, wait for explicit go-ahead, recheck chat status and acquire the complete old/new/dependency file set atomically. Do not infer permission from silence or an elapsed reservation.

Migrate one bounded group, update its references together, and validate before reopening that area to other work. Do not mix unrelated behavior fixes with a move. Commit/push/publication/deployment require separate explicit requests.

## First proposed move group

The first bounded cleanup proposal is to preserve six historical utilities under `tools/archive/legacy-page-patches/`, retaining their names and contents. This is a proposal, not a completed or approved relocation.

| Current path under `_8-tools-and-notes/` | Proposed path under `tools/archive/legacy-page-patches/` | Behavior |
| --- | --- | --- |
| `encode.py` | `encode.py` | Prints a Base64-encoded historical debug snippet. |
| `encode2.py` | `encode2.py` | Prints the same snippet using a different variable name. |
| `fixSnippet.py` | `fixSnippet.py` | Replaces a historical snippet in root `index.html`; derives the root from its file location. |
| `fix_snippets.py` | `fix_snippets.py` | Rewrites matching snippets across several HTML routes; derives the root from its file location. |
| `change_css2.py` | `change_css2.py` | Removes a historical Music CSS block; derives the root from its file location. |
| `insert_debug.py` | `insert_debug.py` | Inserts a historical debug-loader snippet into several HTML routes; derives the root from its file location. |

A bounded search of package commands, workflows, tools and existing project notes found no invocations by these names. This does not establish that nobody runs them manually. Four scripts use `Path(__file__).resolve().parents[1]`; moving them unchanged would change their target root. They should therefore be archived explicitly as historical records with a README saying they are not supported editing commands, or retained in place if still needed. Do not run these patch scripts to verify a move: they write active HTML/CSS and some snippets contain historical malformed markup.

Before this group proceeds, confirm that the human does not need these scripts as runnable commands, arrange the short quiet window for existing-path changes, obtain complete reservations for old/new paths and the archive README, record original bytes, and preserve a reverse mapping. Verify that runtime entries, maintained commands and release policy remain unchanged; restore the original paths if a consumer is discovered. Runtime/asset folder consolidation remains a later, separately planned window.

## Remaining phases and steps

1. **Inventory and additive navigation:** folder classification and active entry-point map are recorded. The reference index and root README link provide current navigation. Deeper per-file asset/consumer inventories remain prerequisites for specific moves.
2. **Verified cleanup:** investigate the candidates above and decide support/retention. Nothing is currently approved for deletion. Isolated documentation can continue; actual moves require their own conflict/quiet-window assessment.
3. **Documentation and utility organization:** propose exact destinations for current guides, historical handoffs and maintained scripts. Preserve existing inbound links and command invocations; do not move coordination contracts during active work.
4. **Selective runtime and asset migrations:** only after human-approved quiet coordination where required. Preserve public URL and saved-data compatibility, update generators/release rules, and perform focused acceptance with rollback evidence.
5. **Reference guide:** finish per-feature controls/settings/asset indexes, illustrated editing recipes and storage recovery; check rendered UI; build and review the searchable PDF from editable source after relevant paths settle.
6. **Separate program work remains:** live browser/accessibility/media acceptance; sticky-note adapters/content and anchor gaps; recruiter Phases 2–7 acceptance and remaining entry/context/discoverability/hierarchy work; settings binders/animation/easing/reduced motion and keyboard parity; Music Piano/Interface ownership prerequisites; shared-player/Music/Start extraction; visitor copy, asset attribution and proven unused-file cleanup; architecture Phases 4–8 acceptance and release evidence, including caption proofreading; deferred full mobile readiness and standard/keyboard-labelled model variants. Current details remain in [recruiter-improvement-plan.md](../_8-tools-and-notes/recruiter-improvement-plan.md), [settings-architecture-progress.md](../_8-tools-and-notes/settings-architecture-progress.md) and [videos-intro-repair-handoff.md](../_8-tools-and-notes/videos-intro-repair-handoff.md). This inventory closes none of those acceptance gates.
