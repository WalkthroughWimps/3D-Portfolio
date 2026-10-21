# Phase 7 validation evidence

October 6, 2026. Bounded presentation/performance evidence; **not a passed Phase 7 acceptance gate**. Read `phase-07-handoff.md` for ownership, rollback and every remaining step.

## Environment and reproducibility

Windows, installed Chrome **154.0.8037.98**, Playwright driving disposable headless contexts, software WebGL (`--enable-unsafe-swiftshader`). Effective viewports were **1280 x 720** and **390 x 844** CSS pixels with DPR **1**. The narrow case is emulation, not physical mobile hardware. No CPU/network throttling. Local origin `http://127.0.0.1:8878`, default local asset base; external pinned Three.js/fonts/plugins still require network. `tools/review-server.mjs` supplies no-store responses and injects its existing local diagnostic/filter UI. Service workers were blocked. Each context explicitly denied audio or, for keyboard consent tests, denied it through the real prompt. No regular browser profile, existing preferences or saved packages were cleared or modified.

Baseline capture preceded implementation. Final capture followed the shared navigation, accessibility, storage guards and Graphics rendering changes. The final Videos-only recapture resolves the Skip/navigation overlap found during visual QA. Screenshots and JSON are under **`output/phase-07/`**; scratch contact sheets/backups are under `tmp/phase-07/`.

Exact local commands (run separately so browser profiling is not competing with another browser audit):

```powershell
npm run review
$env:NODE_PATH = 'C:/Users/spami/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
node tools/phase-07-browser-audit.mjs after
node tools/phase-07-browser-scenarios.mjs
node tools/phase-07-graphics-performance.mjs after
node tools/phase-07-browser-audit.mjs after _2-videos/videos.html
node tmp/phase-07/supplemental-checks.cjs
npm test
npm run check:site-html
npm run lint -- --format json --output-file tmp/phase-07/lint-final.json
git diff --check
```

The browser tools use optional Playwright via an existing install or `NODE_PATH` and installed Chrome; no dependency/lockfile was changed. They do not exit nonzero for all audit findings: inspect the JSON, especially error arrays and coverage. `--nojs-only` and `--storage-only` on the scenario tool replace just those results in an existing report. The route argument on the audit tool similarly refreshes a selected route. Do not overwrite the historical `before` results with current source. The original baseline commands were `node tmp/phase-07/browser-audit.cjs before` and `node tmp/phase-07/graphics-performance.cjs before`; their original JSON remains in scratch, with durable copies in output.

## Accessibility, navigation and fallback matrix

| Scenario | Evidence and result | Limit |
| --- | --- | --- |
| Seven normal direct entries, desktop/narrow | `after/audit.json`, 14 screenshots: one main landmark per page, descriptions/titles, no uncaught page errors | Scene shells; not complete interaction/audio acceptance |
| JavaScript disabled | `scenarios/results.json`: **14/14** bounded navigation/layout/landmark checks passed; six named routes on Start, seven named icon links on content pages; **12/12** content-page skip targets focused | Physical screen-reader output not tested; Start retains its distinct landing layout |
| Generated navigation with fetch/XHR aborted | `supplemental/results.json`, Videos: seven links retained, all centers unobstructed at 390px | One route; no hosted CDN/subpath conclusion |
| Narrow navigation | All content routes show seven 44 x 44px targets inside 390px; Videos center-hit check passes after relocating Skip below header | 320px, browser/text zoom and physical touch are pending |
| Start motion/sound keyboard choice | Normal GLB and aborted GLB: initial `permAllow`; Shift+Tab wraps to `permDeny`, Tab wraps back; Escape denies motion; Tab/Enter denies sound; dialog closes, cookie/key false | Bounded two-button onboarding; other dialogs and full control parity remain pending |
| Shared audio dialog | Linked heading/description, Shift+Tab wraps to Deny, Escape denies, resulting consent false | One fresh context/service; not a cross-tab persistence gate |
| localStorage/sessionStorage unavailable | Seven final direct entries: **zero uncaught errors** after guarded diagnostic reads and Start worker-clear read | Getter failures injected; blocked cookies/IDB, quota and cross-tab retry/removal are separate pending gates |
| Unavailable WebGL | Graphics: no uncaught error, static content/links remain. Other **six routes fail** renderer initialization; Music additionally has `instrumentPickerEl` TDZ | HTML alternatives remain reachable; full fallback gate FAILS |
| Failed GLB requests | Seven routes: no uncaught page errors during bounded probe; Start missing-model keyboard onboarding passes | Does not prove usable scene playback or complete fallback on every route |
| Reduced-motion preference | Seven routes: shared reduced-motion class set and no uncaught errors; shared nav/header transitions suppressed; Graphics automatic camera settles immediately | Does not prove every decorative/scene animation honors the setting |
| Lighting | Start keyboard reports missing-value **0.5**; supplemental saved-zero reports stored `0`, effective `0`; prior focused tests keep generic/shared fallback **1** | Actual Start/shared difference is preserved deliberately, not retuned |
| HTML alternative destinations | Six visual video previews, five direct game entries and existing 2D Music route: **12/12 local HEAD 200** | Video sound is separate; production CDN availability and accessibility of linked games/recorder remain open |
| Videos intro shortcut | S hides Skip, `data-intro-done=true`; intro media paused/muted after skip; tablet-grid screenshot captured | No audible active transport/sync claim |
| Graphics active interaction | Enter on Move left updates camera and produces six draw submissions in each measured run; pointer rotation/zoom visibly change the card; resize gives 1280 x 720 drawing buffer | Camera-info text is only refreshed by existing camera/manual paths, so pointer screenshots are the pointer evidence |

Initial probes exposed an offscreen Settings link, ~31px mobile icons, duplicate Start mains, a focusable decorative Games SVG object before the skip link, an inaccessible canvas-only sound choice, unguarded storage reads and the Skip overlap. Those bounded findings are resolved. Initial failed setup/probe results are not counted as final passes. The diagnostic unit fixture initially rejected a newly imported adapter; it now injects the real guarded adapter and retains the original disabled/late-import assertions.

Durable primary references: `before/index-1280.png` / `after/index-1280.png` and corresponding `_1-about` through `_6-docs` files, at both `1280` and `390`. The normal Start image is intentionally the initial animation prompt, not a loaded controller baseline. `scenarios/start-keyboard-normal.png` and `start-keyboard-failed.png` record completed denial; `supplemental/videos-mobile-skipped.png` records the tablet grid. Rendered Three.js scenes and authored large mobile crops were preserved, rather than reframed without an interaction baseline.

## Comparable Graphics measurements

Three before and three final-after runs per viewport. Each run waits for the authored endpoint (`tgt -3.89,-0.47,6.41`), allows another two seconds to settle, then measures an approximately two-second idle window. `WebGLRenderingContext`/`WebGL2RenderingContext` drawArrays/drawElements and RAF callbacks are counted by init-script wrappers; PerformanceObserver records long tasks. Raw values and actual durations are in `before/graphics-performance.json` and `after/graphics-performance.json`. All contexts are fresh; local no-store is not a production cold/cache scenario.

| Median metric | Desktop before | Desktop after | Narrow before | Narrow after |
| --- | --- | --- | --- | --- |
| Idle WebGL draw submissions | **336** | **0** | **339** | **0** |
| Idle total-page RAF callbacks | 236 | 136 | 248 | 134 |
| Navigation load-event end (ms) | 362.6 | 315.5 | 348.8 | 315.0 |
| First contentful paint (ms) | 56 | 60 | 60 | 56 |
| Resource transfer bytes | 7,002,764 | 7,009,614 | 7,002,764 | 7,009,614 |
| Reported JS heap snapshot bytes | 17,072,506 | 15,275,929 | 14,252,108 | 7,372,954 |

**Supported claim:** static Graphics GPU draw submissions fell to zero in all six after windows, with keyboard/pointer/resize responsiveness retained. Total-page RAF counts include the unrelated header morph/local diagnostic activity. These results do not establish a CPU/battery percentage, whole-site frame improvement, stable memory reduction or loading speedup. FCP changes were mixed; median transfers grew by **6,850 bytes**. Heap snapshots lack controlled GC and exclude GPU/decoded/backend memory. Load timings have only three local runs; differences are descriptive, not a significant production claim. One desktop after run reported 7,009,923 transfer bytes; the other five reported 7,009,614.

Long tasks persist. Before desktop windows recorded `[207]`, `[]`, `[159]` ms; after `[196]`, `[85]`, `[142]`. Before narrow `[86]`, `[181]`, `[159]`; after `[58]`, `[180]`, `[174]`. No blanket long-task improvement is claimed. Do not optimize Music scheduling or broad offscreen scenes on these Graphics measurements.

The static desktop GLB crop **(360,160)-(930,560)** compares identically, with mean absolute RGB difference **[0,0,0]**. This excludes the intentionally random header morph and the added alternative affordance; it is one local crop, not complete Three-version/material/device approval. Four before/after desktop/narrow contact sheets and full supplemental images were visually reviewed. Intentional differences are the mobile navigation row, visible text/link alternative affordances, accessible sound dialog and narrow Skip position. The small shared consent panel retains its prior colors/padding with a CSS owner.

## Music/media/resource limits

Music audio/session/scheduler, its primary entry, catalog and raw sample loader were not optimized. The earlier 29 contracts remain passing with three new render-loop cases. Phase 6's local 1,200ms track lead and 6.0-7.4ms C4 decode remain historical evidence, not new performance results. No new audible first-note, all-bank, recording/transcription or long-run playback measurement was obtained. Render screenshots are not an audio regression pass.

Save UI, saved-byte integration and `prepareForRecording` remain **unimplemented**. Network-cold/disk-cached/prepared timing, visible usage/removal, storage eviction, shared SF2, independent decimal 250MB disk and provisional 128MiB preparation accounting, oversize handling and backend peak memory cannot pass before the Phase 6 prerequisites exist. No saved selection or decoded lease was created by this phase. Retained resource-counted lifecycle/GPU/audio/BFCache measurements remain open in Phases 4-6.

Observed environmental/legacy issues include the Videos `fonts.capis.com` DNS failure and a KUTE SVG plugin response blocked by ORB. Several aborted media/GLB requests in raw audit logs occur at context teardown; do not classify every `ERR_ABORTED` as a load regression. The review injection/asset origin/consent/cache conditions must be preserved when reproducing the numbers.

## Command and artifact gates

- `npm test`: **32 passed**, zero failed/skipped/cancelled (29 earlier + 3 render-loop tests).
- `npm run check:site-html`: passed; generated headers/import maps/worker config current. No dependency version or worker-policy change.
- Full lint command above: exit **1**, **642 errors, 0 warnings**, same inherited 642 baseline. New Phase 7 modules/tools/tests have zero errors. Lint remains FAILING.
- `git diff --check`: passed, only inherited LF/CRLF notices. No commit/deployment.
- Phase 8 Markdown/PDF: **Revision 8**, four pages. Bundled Python ran `tmp/phase-07/render-pdfs.py`; Poppler rendered all four final pages, which were visually reviewed. Text/revision/end marker confirmed. Optional Symbol/ArialUnicode font warnings did not cause visible missing glyphs. Markdown is authoritative.

Full accessibility, fallback, lifecycle, device and Music/storage acceptance remain **INCOMPLETE**. No Phase 8 cleanup/CI/final review has been started.
