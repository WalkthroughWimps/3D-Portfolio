# Skills face checkpoint and completion handoff — updated 2026-10-23

Status: **completed, then simplified at the user's request**. The current game is unlimited direct click-to-toss with a stationary view. This supersedes the finite supply, slingshot modes, game camera transitions and pose presets in the historical results below. Source is saved locally; nothing was committed, pushed, published, or deployed. Preserve unrelated and inherited dirty files.

Preview: http://127.0.0.1:8878/_1-about/about.html?review=1&skills=bean-bags&toss=1

## Basket cleanup and deployment synchronization — 2026-10-23

The user requested removal of the flat basket piece and capped supports shown in their screenshot, and asked for the basket to stay out while focused and move in step with the face. Changed only `_1-about/faces/skills/BeanBagContainer.mjs` for this slice.

Removed the flat rear wall and inner cradle, back rim, visible guides/crossbar/bearings and capped retainer arms. The curved front bowl, lip, seams, bags, click surface and conservative backing-clearance path remain. The basket now samples `1 - assembly.rig.deployment` every frame after the face assembly update, including on construction/resume. Bottom-card busy state no longer tucks the basket or blocks its click access, and the separate 1.4-second basket timer is gone. Actual face retraction still carries the basket in with it.

Evidence: `output/skills-basket-focus-sync/RESULTS.md`, exact `BeanBagContainer.BEFORE.mjs` / `BeanBagContainer.AFTER.mjs` and `BEFORE-AFTER.diff`. Native Chrome hover/click checks for Word, Excel and PowerPoint kept the basket open; basket clicks started/stopped toss mode with no page errors. The close-up and three mid-turn screenshots show the cleaned bowl below the cards. Controlled focus fixtures tested exit, partial reversal, full return, reduced motion and resume: deployment/retraction pairs included .31/.69, .53/.47 and .4/.6. These fixtures called the real motion API after releasing existing turns; they are distinct from the native pointer checks. Source syntax and targeted ESLint passed.

The old clustered rapid-toss fixture accepted twelve throws but its hit assertion failed amid eleven bag collisions. Thrower/supply code was unchanged; this slice does not claim a new aiming acceptance pass. The prior focused aiming evidence remains under `output/skills-click-aim/`. All source reservations were released. No commit, push, publication or deployment.

**Remaining required phases/steps for this basket request: none.** Broader architecture and other face programs remain separate.

## Current: simple toss, control cleanup and beam count

The user found the slingshot game too difficult and requested the old simple system, unlimited bags, no cube animation on game entry, basket start/stop, bottom-button cleanup and configurable Skills rod beam count. Two sequential GPT-6 Sol/medium assignments implemented this correction.

- Basket click starts/stops the game. LMB release tosses toward the clicked point; repeat throws do not wait for returns or run out. Four decorative basket bags remain, while throws use unique transient IDs. Old saved world exhaustion cannot block play. At extreme input, the oldest active mesh is recycled at 96 active bags to bound rendering resources; ordinary input is not ammo-limited.
- Game entry/exit does not move the cube or camera, or change zoom. Removed obsolete difficulty, placement, captured-view and slingshot controls from the visible game UI. Existing card impacts, misses, sounds, backing/energy effects remain. A visible beanbag cursor follows scene pointer movement and clears on leave/cancel; shared contrast drives its glow.
- Notes' dock appears only with Notes focused; turn mode resets on leave. Oddio launchers appear only with Oddio focused and sit together clear of Debug. Accessible controls remain available on Oddio. Skills' hint hides off Skills and has 50 px side clearance at a 390 px viewport.
- Skills → Lattice → Control-arm energy bridge now has **Total zap beams**, stored as `about.spheroid.bridgeCount`. Default: **4 total**, independent of lattice strand count. Counts are capped to available spiral origins; both families are represented when possible, with origins spread around the lattice. Existing taper, colors, rotation, contrast and reduced-motion paths remain.

Changed source in this simplification: Skills `BeanBagThrower.mjs`, `BeanBagSupply.mjs`, `BeanBagVisuals.mjs`, `BeanBagContainer.mjs`, `face.js`; panel-assembly `preview-controls.mjs`; Notes `notes-face.js`; Oddio `face-runtime.js` and `deck.css`; shared `faces/backing-controls.js`, `faces/interior-drive.js` and `core/settings-schema.js`.

Verification: `output/skills-simple-toss/` contains the bounded diff and native Chrome results, including stored exhaustion 1024, basket entry/exit, card hit and miss, 12 repeated releases, stationary cube/camera/zoom, visible cursor and zero page errors. `output/skills-ui-beams/` records desktop/390 px cleanup, Notes dock enabled with actual Notes focus, Oddio accessible dialog opening, hint clearance/off-face hiding, and beam counts 4 initially, 1 after selection, 7 after selection and 7 after reload. The final reused basket fixture passed entry/cursor/12 releases/exit/RMB cancellation with no page errors; its separate targeted-hit assertion was inconclusive in that run amid 11 bag collisions. It does not replace the earlier isolated hit/miss evidence. Targeted lint and diff checks passed.

### Click aiming and center hits

The next human correction reported that throws landed only at the bottom and requested center impacts to change clicked state. Fixed only `faces/skills/BeanBagThrower.mjs`: the click ray now targets the cards' depth (about 0.957 local units) instead of the deploy-node z=0 plane behind them. Previously the arc met the real cards 79–95 screen pixels below the clicked point. Constant-gravity arcs, direct targeting, unlimited throws, the stationary view and basket toggle remain.

An actual center impact now toggles clicked state once, then calls the existing physical alignment to reach the side required by that state. It uses hit feedback and kicks the bag laterally. Edge impacts retain compass-directed 360-degree motion without changing clicked state. State changes occur at impact, not when launching. Ordinary pointer clicks outside the game retain their separate pin/current-face behavior.

Evidence: `output/skills-click-aim/RESULTS.md`, `before-after.json` and `browser-results.json`. Native Chrome checks on final source cover center false→true→false only on arrival, physical half turns, old artwork retained during the turn and correct settled sides, hit sound, four compass edge full turns, six independent targets within 4.91 screen pixels of the pointer, and three rapid actual center contacts producing three toggles. Basket entry/exit and stationary view passed with no page errors. Source syntax, targeted ESLint and diff checks passed. The earlier simplification's inconclusive targeting assertion is superseded by these focused aiming checks.

### Floor returns and lightweight softness

The next human request replaced the quick recovery zoom with a straight drop to a floor and distance-based hops back to the basket, and asked for less rigid bags. Changed only `faces/skills/BeanBagThrower.mjs` in this slice. After a brief card deflection, bags fall vertically until actual floor contact, pause with a squash, and hop toward the basket. Hop count is `ceil(horizontal floor distance / 0.36)`, bounded to 1–8, including the final basket entry. The floor uses the cube shell's world minimum Y minus 0.06 so it stays below the tilted cube rather than cutting through it at the basket's local floor anchor. The existing basket-based launch position remains unchanged.

Softness uses phase-local group scaling for impact/landing compression and settling, with shared geometry and materials. Floor/hop orientation keeps the thin cloth mesh visible. No extra meshes, geometry clones, solver or per-frame vertex uploads were introduced. Reduced motion uses smaller deformation and shorter, lower hops. The hint was moved down to keep the landing visible while retaining side-tab clearance. Center-hit toggles and edge full turns preserve their previous semantics; the energy burn branch still destroys immediately and never starts a return.

Evidence: `output/skills-floor-hops/RESULTS.md`, `browser-results.json`, landing/hop screenshots, and `launch-smoke.json`. Native Chrome checks show a near center impact followed by one hop, a far directional impact followed by two hops, physical floor contact below the cube, five simultaneous bags returning with no active/in-flight IDs left, reduced motion, and no page errors. Geometry count remained 909; sampled transient draw calls were 1212–1214, with no added bag draw calls for softness. This is resource evidence, not an FPS benchmark. A final first-shot smoke check confirmed the original basket-based launch Y to within 0.000001 and a completed return. Syntax and targeted ESLint passed. The unchanged energy-destruction branch was inspected in source, not exercised in this focused browser pass.

The bounded source diff is `output/skills-floor-hops/bounded-source.diff`. Its pre-slice source was reconstructed from the exact old recovery statements; unrelated pre-existing dirty changes are identical on both sides. Source reservations were released after verification.

**Remaining required phases/steps for this simplification, click aiming and floor-return request: none.** No broader architecture work was started. The optional future queued-card check described below still applies if the model's independence certificate changes.

## Historical resume results (gameplay superseded above)

Three sequential GPT-6 Sol/medium assignments completed the remaining checks. The resumed source edits are limited to `_1-about/faces/skills/BeanBagThrower.mjs` and `_1-about/about.js`:

- Fast toss now waits for LMB release instead of firing on pointerdown.
- The game hint refreshes when its view transition completes.
- The cube host keeps right-button pointerdown away from OrbitControls, preventing the observed `setPointerCapture` InvalidStateError during rapid right clicks. Native right-drag and double-RMB face alignment still pass.

Evidence and exact bounded before/after copies:
- `output/skills-resume-shots/RESULTS.md`: actual weak miss, medium/near hit, far/yawed thunk, maximum-pull flub; useful near/far flight; return/re-arm; Normal/Easy one active bag; Fast four concurrent and blocked fifth; empty-tray exit. The 1,024 lifetime cap was exercised as an isolated supply-state check, not by 1,024 browser throws.
- `output/skills-resume-camera/RESULTS.md`: named view save/reload and About→home→About persistence, applied zoom/offset, settled desktop/narrow views, bag loading/rise, auto-focus restoration, canvas/UI cursor isolation, hidden initial endpoint reticles, shared contrast and reduced-motion updates. Viewport screenshots are not a basket geometry-clearance audit.
- `output/skills-resume-integration/RESULTS.md`: queued-card admission/fallback coverage, native tray/Esc/RMB/Clock exits, canvas-focused arrow navigation, right-drag and double-RMB alignment. Eight native energy impacts exhausted the supply; leaving through Clock kept it empty, returning through canvas keyboard rotation refilled four, reset batch destroyed count, preserved lifetime 8, and showed `I guess you can have more`. Only the eighth burn showed the exhaustion Tut message. Final page errors were empty.

Changed-source lint and syntax checks, generated site HTML/config check, and preview HTTP 200 passed. Source reservations were released after each slice. Other chats may hold unrelated reservations; do not clear them.

## Completed and reviewed

### Spiral lattice and projection

The actual spheroid lattice now continues to the Skills frame. The bridge originates at the Skills control-arm terminal, follows each spiral family's palette and motion, and tapers to the nub. Both palette colors have exposed glowing feed wires. Rear pull has independent enable, strength, and influence controls. Influence defaults to 0.22 m, with a 0.10–0.85 m range. Shared contrast, saved settings, and reduced motion use the established paths.

Changed files:
- `_1-about/faces/interior-drive.js`
- `_1-about/faces/backing-controls.js`
- `_7-shared-scripts/core/settings-schema.js`

Evidence: `output/skills-spiral-projection-v2/`. The verification JSON reports all 15 checks passing; `after.png` shows the lattice reaching the frame and `nub-closeup-after.png` shows both exposed feed colors. Targeted lint and module syntax checks passed. No required lattice steps remain.

### Card click and corner state

Individual hover clicks now change clicked/mass state without adding a redundant turn or swapping visible artwork. Corner actions reconcile the desired logical side through forward physical rotation, including cards already moving. Half-turn artwork preparation covers subsequent boundaries. The corner lock waits for both morphing and commanded card turns.

Changed files:
- `_7-shared-scripts/panel-assembly/preview-motion.mjs`
- `_7-shared-scripts/panel-assembly/PanelGraphicOrientation.mjs`
- `_7-shared-scripts/panel-assembly/PanelAssembly.mjs`

Evidence: `output/skills-card-pin-v3/` and its `phase2b/` directory. Directed checks cover all 33 square cards, rapid click parity, corner changes during motion, full-cycle impacts/surprise artwork, and corner locking. A native mouse click was verified after waiting for camera/carrier settling and reprojecting the card. Targeted lint and syntax checks passed. The initial phase's before copies were reconstructed by reversing only that agent's exact patches; phase2b has fresh exact before/after copies.

**Queued-card gate closed with a coverage qualification:** the loaded manifest certifies all 37 panels as independent (minimum separating gap 0.003714 m), so normal scheduling admits distinct visible turns concurrently rather than creating the alleged blocker/queue. An isolated browser fixture disabled that certificate only for the check: a visible perimeter blocker remained active and a square stayed genuinely queued through 12 real assembly/name-frame updates while its Clicked morph advanced. The visible map identity stayed stable. No production card edit was justified. Repeat this check if a later model narrows/removes the certificate. See `output/skills-resume-integration/queued-card.json`.

## Card behavior contract

The human clarified that cards must always rotate to their actual required side after a corner action; changing artwork in place is unacceptable, even during an existing turn.

- One shared assignment determines the resting side of clicked cards; unclicked cards rest on the opposite side. Initialize from the legacy majority relationship and keep it stable until explicitly swapped.
- Hover may temporarily reveal the opposite resting side. Enter turns 180 degrees away from mouse movement; exit continues forward to the appropriate half-turn boundary. An ordinary uninterrupted crossing totals 360 degrees.
- Clicking a hovered card changes clicked state/mass and pins the currently shown intended side. It must not add a redundant turn or pop the visible image. Repeated clicks resolve according to final odd/even clicked state.
- Top-left ALL makes every card unclicked, with the corresponding opposite resting assignment.
- Top-right ALL makes every card clicked, with the shared clicked resting assignment.
- Bottom-left swaps the shared clicked/unclicked side assignment and preserves clicked flags.
- Bottom-right inverts clicked flags and preserves the shared side assignment.
- If a card is already turning when a corner changes the required side, it continues rotating forward until the correct side is reached. It must not cancel, reverse abruptly, or replace visible graphics.
- Another corner press is rejected while any corner action's morph or commanded rotation is still executing. Individual rapid clicks retain their final state intent without interrupting motion.
- Fast-pass surprise artwork completes its committed cycle, including on reentry, and cannot become pinned. Edge game impacts complete 360 degrees while preserving clicked/resting intent. Center game impacts instead toggle clicked state at impact and physically align to the corresponding resting side, with lateral bag deflection.
- Idle/programmatic click-without-hover behavior was not exhaustively validated. The native default hover/click flow passed; the queued full-render gate is qualified above.

## Beanbag continuation

Read and continued the human-requested chat **Clear refs face content**. The historical pause checkpoint is [PAUSE-CHECKPOINT.md](../output/skills-beanbag-continuation-v3/PAUSE-CHECKPOINT.md). Its open gates are superseded by the resume results above.

Changed in this continuation slice:
- `_1-about/faces/skills/BeanBagThrower.mjs`
- `_1-about/faces/skills/BeanBagContainer.mjs`
- `_1-about/faces/skills/face.js`
- `_7-shared-scripts/panel-assembly/preview-controls.mjs`
- `_1-about/about.js`

Normal uses manual yaw/power ballistic physics; Easy retains target compensation; Fast supports concurrent throws. Tray hits use visible carriage coordinates. The sling has loading/rise animation, world-up gravity, a stable floor anchor, an angled full-scene view, game-canvas cursor hiding, UI isolation, saved-pose capture, restored Skills focus, and game exit on face navigation.

The Normal flight-duration change computes the flight horizon from pouch height and vertical velocity instead of an artificial 1.3-second cutoff. The resumed native checks confirmed actual near/far face impacts, distinct weak/medium/yawed/overdraw outcomes, and return/re-arm after that change.

All five original continuation files passed targeted ESLint. The three `.mjs` files passed Node syntax checking. Exact original before/after copies and `current-slice.diff` are under `output/skills-beanbag-continuation-v3/`; retained browser scripts are under `tmp/beanbag-followup/`. Resumed changes and completed acceptance evidence are recorded above.

## Phase closure and remaining steps

1. Resume preflight and reservations: complete.
2. Normal shot reach, outcome, release and recovery acceptance: complete.
3. Supply, replacement, exhaustion and real leave/return refill: complete; lifetime cap covered by isolated state check.
4. Camera, presentation and settings acceptance: complete within the viewport/interaction scope above.
5. Queued-card artwork investigation: complete; current certified model does not queue distinct cards, isolated fallback passed without a production change.
6. Combined navigation, bounded diff review, validation and reservation cleanup: complete.

**Remaining required phases/steps for this bounded Skills continuation: none.** Optional future check: repeat queued-card coverage when the model independence certificate changes. Broader Videos/site architecture and other Face-chat programs remain separate and are not advanced by this work. Commit, push, publication and deployment still require an explicit request.

## Coordination and resume constraints

All three resumed assignments have completed and released their source reservations. Release the coordinator's documentation reservation after saving this file. Reservations coordinate participating chats and do not lock out external editors.

Use one implementation agent at a time for this shared state, with an independent read-only reviewer only when useful. These slices used GPT-6 Sol at medium effort. Follow the repository's routing guidance; any new GPT-6.1-family phase needs a scoped preflight notice and explicit human permission before starting. Do not resume broader architecture work from this handoff.

Other dirty work includes Refs, Oddio, SkillsSettings, and untracked Refs assets/documents. Those changes are outside this checkpoint's ownership. Preserve them and use the saved bounded diffs to distinguish this slice.
