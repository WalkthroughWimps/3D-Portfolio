# Hoplet standalone prototype — UI and visibility update

Run via VS Code Live Server (open index.html) or `python -m http.server 8000`.

Updates:
- Starting layouts relocated to a left sidebar.
- Player roster permanently visible as a bottom/right attached panel inside the game viewport.
- Show computer personalities toggle reveals each CP's assigned strategy in the roster; enabled by default.
- Player color formerly purple has been changed to pink.
- On each turn, available buttons glow with the active player's color across their face; their center lamps remain white and the buttons are lowered.
- After a move, the mover's path is fully illuminated for adjustable Trail flash duration, before the next player's moves show.
- Default camera is framed closer.

All prior mouse controls are retained. This remains a simple-geometry prototype, not Blender GLB integration.


## Homing and layout update
- Homing computer players now follow an expanding square spiral, turning after legs of length 1, 1, 2, 2, etc. If their intended next cell is occupied, they make a local fallback move toward their own trail, favoring adjacent occupied paths. Paths remain blocked until elimination.
- The former Claustrophile is displayed as **Cat** (same behavior).
- All starting layout and personality checkboxes now live in the left sidebar.
- Removed the two prototype/explanation paragraphs under the old personality checklist.

## Starting placement update
- **Symmetrical:** choose one position in the upper-left 3×3 quadrant, then rotate it 90°, 180°, and 270° about the board center. Each player has the same position relative to their rotated quadrant, as in the annotated example.
- **Large square:** the former half-board spacing arrangement, with corners 3 steps apart (4×4 footprint).
- **Medium square:** corners 2 steps apart (3×3 footprint).
- **Small square:** the existing 2×2 setup.
- Random remains available; the redundant four-physical-corners option has been removed because it duplicates Small Square on the wrapping board. All remaining patterns can be enabled independently, and the game chooses randomly among enabled patterns.

## Balanced starting families
- The selected enabled layouts are divided into **Square** (Small, Medium, Large, or diagonal-seeded Symmetrical) and **Other** (Random or off-diagonal-seeded Symmetrical).
- Symmetrical remains a single checkbox, but its 3 diagonal seeds and 6 off-diagonal seeds are explicitly assigned to the two families. The off-diagonal patterns are rotated rotationally symmetric configurations, not necessarily axis-aligned rectangles.
- With both families available, family streaks usually end at 1–2 games. A third occurs occasionally (12% after two), and a fourth is disallowed. History persists through New Game within the current page session.
- The two families have balanced selection chances; then one enabled layout is drawn within the selected family. If just one family is available, it is always used.
- No changes to gameplay, computer personalities, or camera.


## Player colors and viewport dock
Player list is fixed to the bottom-right corner of the actual 3D viewport, not the separate hint bar. Click the colored swatch next to any player to choose a new color (applies during the current game too). Default blue is more saturated; the starting lights are steady, without breathing/pulsing.

## Latest changes
- The player palette is a full-width, always-visible strip underneath the viewport; swatches can be edited before selecting a starting stump.
- The initial four stumps flash their full surfaces (speed adjustable), but lights stay steady during play.
- Available-move stump lowering can be disabled independently of movement highlights.
- Computer personalities include Queen (keeps heading until blocked), Bishop (takes a 90-degree turn whenever possible, never voluntarily straight/reverse), and Knight (real 2+1 toroidal jumping to free destinations). Knight jumps ignore intervening cells.
- Opponent personalities are sampled independently with replacement, so duplicates are possible.

## Personality selection UI

The left panel now shows computer personalities as a two-column grid of selectable buttons. Blue buttons are enabled, subdued buttons are disabled. Reveal CP personalities sits above the grid with Select all and Select none buttons. If every personality is deselected, computer players use Wanderer (random) movement as a fallback. Starting layout options also use selection buttons, but always retain at least one selected layout.

## Wide sidebar button typography
The left panel is 380 px wide at desktop/tablet two-column breakpoints. Both starting layouts and personality buttons display a larger bold name above a short, single-line description. Selection, layout balancing and AI logic are unchanged.

## Trail speed and reverse reveal
- The previous exponential multiplier could make late path-clearing steps take many seconds each. This version uses a bounded linear progression across the entire path instead.
- **Trail speed change (both directions)** ranges from -30% (last step faster) to +30% (last step slower); default -15%. The 0% setting uses a constant interval.
- **Elimination step** sets the base interval for each lamp.
- On every move, the path illuminates **newest stump to oldest**, one full button at a time using those same controls, then holds for **Trail flash** milliseconds before the next turn.
- Eliminations continue to extinguish the path **oldest stump to newest**. Remaining opponents clear concurrently when the human loses.

### Flashing and accessibility
- **Enable flashing effects** toggles the starting-position blink and blocked-neighbor warning flashes. Off leaves starting positions steadily lit and warning squares lit once without repeatedly blinking.
- **Flash intensity** (0–100%, default 65%) adjusts the contrast between the bright/dim states of the starting stumps and the brightness of trail-sweep highlights. It is disabled when flashing is off.
- The initial setting respects `prefers-reduced-motion: reduce`; users can still change it manually. The actual elimination path still clears sequentially; it is a game-state transition rather than a repeating flash.

## Defaults (October 30, 2026)

CP thinking: 450–1150 ms; stump motion: 250 ms; elimination step: 110 ms; trail speed change: −15%; blocked warning: 650 ms; flashing: enabled at 10% intensity; starting flash interval: 580 ms; trail flash: 250 ms; ending display: 3000 ms. The starting-layout and flash-accessibility explanatory blurbs were removed.

## Fixed viewport and independent panel scrolling
- The page itself is locked to the browser viewport; neither sidebar can scroll the board off screen.
- Starting layouts/personality controls (left) and test settings (right) each scroll independently while hovered.
- The wheel zooms only over the 3D canvas; right-drag rotates, middle-drag pans, left-click plays.
- Initial board framing happens once. Resizing the scene updates the renderer without overwriting the user's current zoom, pan or rotation.
- If the window is extremely short or narrow, controls may be compact; increasing window size gives the 3D viewport more room.


### New in this version: Cat and stump shapes

- **Cat** ranks legal moves by the number of remaining immediate exits, preferring tighter spaces; reachable region size only breaks near-ties. This accounts for wraparound neighbors. It is intentionally a preference, not a guarantee of a particular move when choices have equal local openness.
- **Rounded square stumps** are enabled by default. Turn the `Rounded square stumps (off = circular)` checkbox on or off at any time, including mid-game and during the nine-letter ending. The underlying game grid, materials, raycasting, and animations are unchanged.


## Reconciliation and Human Knight update (October 31, 2026)
- Starting from the four attached site versions. The uploaded JavaScript matches the earlier Cat/rounded-square implementation byte-for-byte; the site HTML/CSS contain additional integration and layout changes, preserved here.
- Added a **Human Knight (1 in 14)** checkbox alongside Reveal CP personalities (enabled by default). The human Knight roll occurs once at color selection, independently of the enabled CP personality list. Knight moves replace ordinary movement for that game. The player panel and turn prompts identify the Knight.
- Corrected the earlier **Lower available-move stumps** behavior: only unoccupied destinations legally reachable by any active player are lowered, not all unoccupied stumps. This includes knight jumps for any active Knight.
- No Blender GLB integration yet. No browser playthrough performed.
