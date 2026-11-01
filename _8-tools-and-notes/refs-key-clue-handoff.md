# Refs plaque key clue — 2026-10-25

The lower center plaque door carries a small chalk-colored copy of the user's
five visible key strokes. `_1-about/notes/key-clue.js` is the shared, static
extraction from `key.json`: `keyCluePaths` (204 normalized samples across five
paths) and `keyClueBounds` (`1 × .551`). Refs only reads those exports. The
source JSON and hidden gear/background objects are not loaded into this scene.

`_1-about/faces/refs/key-clue.js` converts the paths to one thin ribbon mesh.
`doors.js` attaches it as `refs.door.plaque.key-clue` under the plaque's motion
group, just ahead of the outer/front leaf. It fits the resolved plaque frame,
stays clear of the upper center knob, follows hinged or rotating motion and
resizing, and is omitted when the door type is `none`. Geometry is rebuilt only
with door geometry and disposed through the door's existing owned-mesh cleanup.
The shared `keyInk` material is disposed with door materials. Its opacity tracks
the existing `.08–2.4` Refs contrast gain in `doors.setContrast`.

Targeted ESLint passed for `doors.js`, `refs/key-clue.js`, and the imported Notes
extraction. Integrated browser acceptance passed seven checks: plaque outer
front placement, motion following, contrast gain, resize uniqueness, type
`none` hiding, and restoration. Evidence: `output/notes-key-review/refs-clue-checks.txt`.
The key art compiles from the 204-sample extraction without fetching the 9 MB
drawing. Full live cube review had no page errors; screenshots are
`output/notes-key-review/refs-key-clue.png` and `refs-live-cube.png`. No cabinet
source GLB, host, settings, inventory, lock, or insertion behavior was changed.

## Remaining phases and steps

1. Refs clue implementation and integrated browser review: complete.
2. Notes recognizer and award integration: complete; see `discovery-handoff.md`.
3. Later, if requested: decide inventory state and ownership, connect Notes
   awards to it, and design any insertion/door interaction.

No commit, push, publication, or deployment was performed.
