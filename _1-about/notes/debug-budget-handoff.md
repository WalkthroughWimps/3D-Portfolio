# Debug budget instrumentation — October 18, 2026

## Implemented scope

The shared Debug Live performance section now adds the 60 FPS / 16.7 ms reference frame target, the fraction/count of sampled frame intervals exceeding that target by 25%, an explicit uncalibrated adaptive-limit status, and the browser-reported JavaScript heap use/limit when available. Existing FPS, average/P95 intervals, long-task count, DOM/canvas counts, and registered renderer counters remain. This component is shared across the site's main pages; About and Start were checked live.

`debug/performance-budget.js` supplies frame-interval statistics. Faster-refresh displays are valid; no estimate of spare CPU/GPU time or device object capacity is inferred from a vsync interval. The rolling window is still 180 intervals and reports twice a second. Frame target is a reference rather than a changed renderer setting. Heap limit is the browser's JS heap limit, not total device RAM or available GPU memory. Unsupported browser metrics remain unavailable.

`trackPerformanceBudget(name, sample)` in `debug/performance-stats.js` allows a page/feature to register a cheap read-only metrics snapshot and returns its unregister function. Each sampler polls providers only while its Debug drawer is open and the document visible. Removed providers lose their UI sections on the next report; sampling activation is reference-counted and cleaned up on closure/disposal. Providers should not render or mutate their workload; exceptions display Unavailable. No other face/host API was changed, and existing trackPerformanceRenderer callers remain compatible.

Notes registers one owner-scoped provider in drawing-editor.js. It reports:

- Existing fixed object and pane caps: 300 objects / 3 panes, plus logical visible-object count.
- Non-pencil anchors, nonzero curve handles, and retained pencil samples separately. These are observed geometry counts, not calibrated weighted-budget units.
- Retained shape-cache raw RGBA bytes versus its existing 8,000,000-pixel cap (30.52 MiB), composite raw RGBA bytes separately, cached shape count, and cumulative bitmap build/reuse counts. These exclude browser allocation overhead, GPU copies, tablet textures and other canvases. Warm composite reuse need not increment per-shape reuse because no bitmap lookup occurs.
- Most recently prepared clipped-art segment count versus its existing 6,000 art-segment cap. This excludes dynamic gear/selection overlays and is labeled last prepared, not a current hardware workload total.
- Undo/redo entries and the history's existing approximate geometry count, without cloning/serializing the document for diagnostics.
- Most recent editor flush CPU duration collected while Debug sampling is active. This covers editor render/panel updates, not the host renderer, GPU completion, texture uploads or forced readback.

The artwork cache exposes read-only counters/pixel totals without creating or redrawing canvases. Sampling does not flatten curves, regenerate clipped art, or build shape bitmaps. Geometry inspection occurs only at Debug's report cadence. Closing Debug stops polling and optional editor timing. Disposing the editor unregisters the provider and releases its cache as before.

## Limits and implementation boundary

No adaptive complexity budget, calibration benchmark, new creation restrictions, new UI disabling rules, animation workspace, or timeline was implemented. The current fixed caps and cache/outline budgets are the existing constraints, now visible. Weighted geometry and adaptive limit values explicitly say Not calibrated. They must not be presented as working device-specific limits during user testing.

## Verification

Targeted ESLint passes for the five changed/new JS/test files. All 156 repository tests pass, including two meaningful frame-statistic checks for faster displays, sustained slow samples, invalid inputs and alternate reference rates.

A fresh browser fixture passes 12 lifecycle/accounting checks: closed Debug avoids polling; opening starts polling; fixed/adaptive limits are distinguished; drawing changes object/anchor/history counts; optional CPU timing activates; reading diagnostics/cached composition does not rebuild artwork; invalidation releases bitmap pixels; disposal releases composite pixels; closure stops polling; provider removal removes its section; editor disposal unregisters; sampler disposal clears activation and DOM. Live About and Start show real frame/heap values; About includes its real Notes document/cache and renderer counters. Start honestly reports uninstrumented renderer counters. No page console errors were observed in those live checks. The review server returns HTTP 200 for both routes.

Evidence: output/notes-debug-budget/all-tests.txt, tests.txt, browser-checks.txt, about-values.txt, home-values.txt and notes-budget.png. Disposable browser fixture: tmp/notes-budget/index.html, using a separate drawing storage key. Source paths were reserved together under Notes Face; no shared host, HTML/CSS, model, settings, other face or drawing storage schema was edited.

## All remaining phases / steps

Required for this Debug instrumentation request: none. A bounded read-only GPT-6 Luna / low source review found no actionable issues; the coordinator reviewed that result against the source and existing evidence. The reviewer did not duplicate the completed tests.

Future adaptive-budget work: representative device/workload calibration, stable weighted geometry/render/cache/history allowances, conservative admission checks and greyed creation controls, then static/animation stress validation. These are not enabled by diagnostics alone.

Animation remains on hold: object-sharing workspace and storage; frame/pane copying; outline onion skins; interpolation and playback; performance validation; optional export. Optional Notes follow-ups remain independent grouped pie-chart slices and a continuous mechanical self-contact/fabrication audit. The previously completed bounded combined-host clearance review remains complete. No broader site architecture phase advanced. Nothing committed, pushed, published or deployed.

Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1
