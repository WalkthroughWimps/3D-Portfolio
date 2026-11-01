# Music tablet and piano refinements

## 2026-10-31

- Added configurable, debounced tablet track titles with an idle return, fade/gap/fade transitions, selected-track priority, and reduced-motion support.
- Added shared settings for tablet title timing, accidental label width, and instrument panel animation duration.
- Removed redundant instrument heading rows, enlarged category and instrument controls, widened black-note indicators independently of their label glyphs, and kept the higher panel clear of the center divider.
- Returned track icons to their normal layout after playback ends.
- Added focused controller, settings, canvas layout, divider, and animation regression tests.

Setting keys and defaults:

- `music.tabletTitleIdleTimeout`: 1200 ms (0–3000, step 50)
- `music.trackNameHoverDelay`: 100 ms (0–500, step 25)
- `music.tabletTitleFadeDuration`: 180 ms (0–600, step 20)
- `music.tabletTitleTransitionGap`: 80 ms (0–400, step 20)
- `music.accidentalWidth`: 1.45× (1–2.4, step 0.05)
- `music.instrumentPanelAnimationDuration`: 480 ms (0–1200, step 20)

Validation: the focused refinement suite passes 10/10. Targeted ESLint and module syntax checks pass. The existing Music-related test batch has 11 failures in older tests/fixtures that rely on stale source assumptions or missing fixture bindings; the new focused tests pass. Live browser verification was unavailable because Windows Computer Use could not enforce URL policy for the active browser.
