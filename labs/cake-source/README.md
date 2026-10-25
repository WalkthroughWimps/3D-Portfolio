# Cake Labs snapshot

This directory is a generated public distribution snapshot from the Cake repository's `dist-labs` package. Refreshed 2026-10-25; contains 145 public files under `cake/`. The authoritative source remains https://github.com/WalkthroughWimps/cake.

This release adds four complete ingredient carousel slides, measured floating huddles, the four-section cake builder with neutral preview and tier controls, native quantity pickers, compact whole-order review, and shared motion settings. The public Labs adapter stores samples in the visitor's browser, allows normal date/time entry, allows ephemeral Deets test fields and discards contact/address/notes before saving, and stores only a generic allergy flag.

The spacing/form refinement uses pixel-based Poisson spacing with stable option positions, a Cake-only preview, larger evenly distributed ingredient pieces, a first-visit notice popup, and a configurable filling cap (default 2 per tier; admin range 1–4).

The Deets/review polish adds delivery and size toggles, fixed ingredient slots, aligned animated tier controls, a compact square cake summary, readable severity fields, stronger soft highlights, and a gentle conflict-only allergy treatment. Conflicting choices remain excluded, with a separate check for conflicting existing selections.

Only the public `cake/` distribution and its Cloudflare Pages `_headers`, `_redirects`, and `404.html` controls belong here. The host builder retains route-scoped headers and redirects and supplies a generic Labs 404. Regenerate from the Cake public build; never add private source, `.data`, server code, environment files, or secrets.
