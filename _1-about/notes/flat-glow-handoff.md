# Flat highlight artwork and soft-edge performance — October 18, 2026

## Implemented

The art was already an unlit MeshBasicMaterial texture (toneMapped false); it did not illuminate the scene. The eliminated cost is Canvas2D shadow blur and its oversized cached bitmap padding, not an actual scene light or bloom pass.

`drawing-artwork.js` now draws the exact palette color at full stroke opacity with a sharp contrast keyline. The keyline adds only .5–1.25 logical pixels on either side, with width/opacity controlled by contrast. Ordinary browser antialiasing remains. Fill behavior, geometry, editable vectors, selection, undo, storage, clipping and the existing bounded caches are unchanged. Padding follows the real stroke/edge rather than a 3×blur margin. `drawing-gears.js` also removes the cached pattern-preview shadow blur; its faint .17 opacity remains. No material, texture resolution, light, shader, render pass or shared host was added.

## Local measured findings

Five rotated-order runs after warmup; 16 dense pencil paths / 25,600 points, 1000×1000 composite, maximum contrast and medium brightness. Cold timing includes shape-cache construction, composite and forced whole-canvas readback. Cached timing averages eight unchanged composites plus forced readback per run. Values are medians. Shape-cache MB are retained raw RGBA pixel estimates, excluding the common composite/destination canvases, browser overhead and GPU copies.

| Treatment | Cold build/readback | Cached/readback | Shape cache |
| --- | ---: | ---: | ---: |
| Previous 16px blur | 120.5 ms | 7.03 ms | 11.48 MB |
| Reduced 4px blur | 126.3 ms | 8.38 ms | 7.91 MB |
| No blur, thin contrast edge (shipped) | 95.1 ms | 8.15 ms | 6.68 MB |
| No blur or contrast edge (diagnostic) | 56.7 ms | 7.22 ms | 6.57 MB |

Removing blur while retaining the contrast edge took about 21% less cold-build time and 42% less retained shape-cache memory than the old maximum blur. Reducing blur from 16 to 4 pixels cut retained memory by 31%, but did not provide a reliable timing improvement. Eliminating the contrast edge too reduced cold-build time by another 40% versus the shipped treatment, but saved only another 1.6% in retained cache pixels and reduced palette readability. Charcoal is difficult against the dark side; light colors lose contrast against the light side. The narrow contrast edge remains the default to preserve the earlier cross-brightness readability requirement.

Cached timings showed no consistent improvement; spread/overlap and readback noise are substantial. These are local Canvas2D measurements, not WebGL frame rates, texture-upload timings, whole-scene memory totals, mobile results or an animation performance guarantee. Warm rotation/zoom already reuse the artwork, so this change primarily benefits cache rebuilds, new/edited drawings and future animation cel rendering. Gear-preview blur removal is a separate consistency change and is not included in the comparison numbers. The clipped-art outline renderer remains its existing simplified cached path, with no added softness.

## Verification and evidence

- Targeted ESLint passes for both production JS files.
- All 47 drawing/model/cache/gear tests pass, including unchanged-cache reuse and affected-shape invalidation.
- Current-source browser fixture passes 73 checks at 1280px and 73 at 390px; rendering, context controls, retained drawing, scroll lifecycle and zoom fallback remain functional.
- Compared low/medium/high contrast and brightness endpoints on split light/dark backgrounds. The sharp contrast edge preserves the palette better than plain strokes.
- Evidence: `output/notes-flat-glow/benchmark.json`, `tests.txt`, `browser-checks.txt`, `browser-checks-390.txt`, `comparison-high.png`, `comparison-low.png`. Reproducible diagnostic page: http://127.0.0.1:8878/output/notes-flat-glow/index.html . Diagnostic variants are not shipped to the editor.

## All remaining phases / steps

Required for this glow/soft-edge request: none after verification.

Animation remains proposed, not implemented or benchmarked: (1) separate animation workspace, storage and per-cel/project geometry budgets; (2) frame editing, animation tablet and cached previous/next outline onion skins; (3) bounded frame caching, playback/looping and pause-on-face-exit performance validation; (4) optional export and longer sequences. No animation controls or project limits were added by this slice.

Other optional Notes follow-ups remain pie-chart splitting into independently colored grouped slices, and a continuous self-contact/fabrication audit of the mechanical assemblies. The combined-host bounded clearance review is already complete, as recorded in context-controls-handoff.md. No broader architecture phase advanced. Nothing committed, pushed, published or deployed.

Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1
