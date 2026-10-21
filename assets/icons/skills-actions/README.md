# Skill corner action icons

The user-authored originals are in `assets/corner-card-icons/` (PNG) and `assets/svg/` (SVG). Runtime uses the supplied transparent PNG exports so the lettering is identical on systems without the author's font. The SVG originals remain editable and are copied alongside the PNGs.

- Top-left, clear clicked status: `icon.all_square` → `set-all-unclicked` (blue ALL).
- Top-right, set clicked status: `icon.all_squircle` → `set-all-clicked` (pink ALL).
- Bottom-left, swap icon/name baseline: `icon.swap_side` → `show-names-or-icons`.
- Bottom-right, invert clicked status: `icon.swap_mode` → `toggle-clicked`.

Runtime trims transparent source margins and fits each sticker without stretching. Replace the user originals and run the canonical sync/package scripts; they map the original filenames to the action aliases automatically. Native clock-working copy also packs these PNGs; the earlier V17 source is unchanged.
