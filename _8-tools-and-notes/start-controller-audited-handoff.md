# Start controller: audited implementation handoff

## Scope and authority

Implement the user's start-page controller requirements below. This document records a source, GLB structure/animation, and media audit; it does not claim that proposed fixes have passed browser testing. No application code was changed for this audit. Existing working-tree changes belong to ongoing work: preserve them, including unrelated pages. Do not reset files, rebuild the GLB, or deploy the site.

The latest clarification is decisive: **the pressed button selects the mode**. Knobs always changing brightness/contrast is the current bug, not the desired behavior.

| Pressed mode | Vertical physical knob | Horizontal physical knob |
|---|---|---|
| AUDIO | Volume | Audio/video sync offset |
| VISUALS | Brightness | Contrast / scene-light balance |

Retain each mode's values when switching. Labels, readouts, pressed state, and actual functions must agree. Values increase toward the right/top; darkness belongs at the left/bottom. Audio permission and selected mode are independent.

## Files and verified causes

Paths in this document are relative to `C:\Dropbox\Resume Website`. Main work is in `_0-start/start-page.js`, `_0-start/camera-transition.js`, `_0-start/start-page.css`, and `index.html`. Supporting code is in `_0-start/a11y.js` and `_7-shared-scripts/{audio-consent,local-preferences,scene-lighting-sync,shared-glb-mouse-controls,shared-video-controls}.js`.

1. **Mode changes have several owners.** `setAccessibilityView`/`setAudioView` update `activeSettingsView`, but GLB pointer handlers call `reverseVolSyncAnimation`/`toggleVolSyncAnimation`, which change animation without changing that state. Keyboard A/V bindings also disagree with their visible meaning. Setters handle endpoint transitions but do not reliably retarget midway. This explains a visually changed mode retaining visual knob functions.
2. **Appearance has competing writers.** The render-loop `manualEmissiveTargets` changes colors from both playhead and playback direction, including while paused. Its material-name classification includes SAVE/RESET, so mode changes affect unrelated buttons. Lighting controls and initialization overrides write some of the same values. `forceLuxAndContrastRight()` overrides settings at initialization.
3. **The camera still stops in the middle.** `COMFORT_HOLD_MS` is currently only 20 ms, but each approach/departure segment has its own zero-velocity easing endpoint. Removing the explicit hold alone will retain the stop/restart impression.
4. **Consent and screen rendering are split.** The shared HTML consent promise and GLB prompt handlers independently handle responses. The GLB screen is a static canvas texture; media playback is handled in a separate hidden HTML panel. One GLB choice can bypass the other prompt's completion. Startup can auto-play a counting clip and overwrite volume after permission.
5. **Audio playback needs repair before reuse.** `loadVideo` can disconnect and recreate a Web Audio media source for the same audio element. Create that source once per element/context. The native fallback changes video volume even though the requested video files have no audio; it must control the separate audio element and respect permission. Seeking must preserve signed sync offset.
6. **Readouts and knob geometry are not consistently semantic.** The horizontal readout is populated with contrast even in audio mode. Additional contrast-knob inference has no matching anchor in this asset. Local coordinate direction differs from the user's left/right and up/down convention.

## Actual GLB bindings — use explicit nodes

Audited asset: `glb/settings-controller.glb`. Node names are not a reliable statement of the visible button label.

| Element | Verified binding / constraint |
|---|---|
| Horizontal knob | `knob-sync`; parent-local **z** axis; higher z is left/low, lower z is right/high |
| Vertical knob | `knob-vol`; parent-local **x** axis; higher x is bottom/low, lower x is top/high |
| Rails / hit helpers | `gasket-sync`, `detector-sync`, `gasket-vol`, `detector-vol` |
| Screen | `control-screen`, material `controller-screen` |
| Left mode button | `btn-accessibility`, text child `txt-acc`; screenshot shows left button labeled AUDIO—verify rendered label before assigning mode |
| Right mode button | `btn-vol-sync`, text child `txt-vol`; screenshot shows right button labeled VISUALS—verify rendered label before assigning mode |
| Momentary buttons | `btn-save` / `txt-save`, `btn-reset` / `txt-reset` |
| Readouts | `txt-percent-sync`, `txt-percent-vol`; share `txt-values-glow`, so clone for independent updates |

There are only **two knobs**, no `knob-contrast`, `gasket-contrast`, or `detector-contrast`. Remove the unsupported inferred third-knob path rather than extending it. Use one normalized semantic value per active control; map it to the physical endpoint pair. Derive rail limits in the knob parent's coordinates with a knob-radius inset. Do not reverse semantic endpoints when orbiting the camera. A world axis-aligned bounding box transformed back to local space can produce oversized limits on rotated parts.

Animation inventory: ten clips, all transform tracks; no material tracks, no knob tracks, and **no SAVE/RESET tracks**. Camera has position/quaternion tracks lasting 1.25 s. The remaining clips animate the two mode buttons, `info-panel`, four mode labels, `vol-meter-flip`, and the cat (`Plane.001Action` targets `ManekinekoH`). Current `buildUiClip` combines all non-camera clips, including the cat.

Authored mode-label endpoints are **start = VISUALS, end = AUDIO**. Button tracks are opposite translations: `btn-accessibility` goes pressed to released, `btn-vol-sync` released to pressed. Their local pressed y is approximately -0.08364 and released y -0.03530. This conflicts with apparent visible-button naming/layout: verify and explicitly bind button poses to selected visible labels, instead of assuming every authored track agrees. Mode-label translations last 0.625 s, button translations 0.83333 s, and panel/meter rotations about 1.20833 s. Preserve authored timing where useful, and sample exact endpoint poses. Replace `AUDIO_FRAME = 45` against a frame mapper clamped to 30 with explicit normalized endpoints/clip times.

Materials also need node-specific ownership:

- On-button body materials have red base color plus blue emission. On-button text is dark green with no authored emission. Off-button text has blue emission. Scaling intensity alone cannot produce all requested states.
- `txt-vol` shares `txt-btn-off` with instruction text; broad material-name edits can recolor unrelated content.
- `slider-glow` and `meter-glow` are shared by multiple structural/control parts. Do not apply button colors to these groups indiscriminately.
- Structural materials such as `Black matte metal` also emit light. Their emission contributes to the dark-end floor and must be considered separately from intentional illuminated lettering/highlights.
- Clone materials only where independent control is needed; preserve maps and material properties. Keep screen, button, label, structural, and highlight policies separate.

## Implementation framework

Use a small explicit controller state, not a broad application rewrite. Suggested state: stage (`sound`, `motion`, `intro`, `gallery`, `playing`), mode (`audio`, `visuals`), sound permission, animation permission, volume/mute, sync milliseconds, brightness, contrast, and selected media. Keep transition progress separate from logical state. Runtime state remains authoritative when persistence fails.

All GLB clicks, keyboard shortcuts, accessible DOM controls, and debug controls should dispatch the same actions. `selectMode()` is idempotent and retargets a transition from its current pose when changed midway. A selected mode determines functions immediately; suppress gestures during any brief label transition if necessary to avoid misleading users.

Give each output one owner: knob positioning from state; mode transforms from a bounded mode animator; button colors from selected state plus press feedback; scene appearance from one lighting function; screen from one compositor; playback from one media controller. Remove obsolete writers instead of layering overrides over them. Debug UI observes or dispatches actions and does not reset normal state on every frame.

## Remaining implementation phases and acceptance gates

### 1. Unify mode and knob behavior

- Bind the visible AUDIO button and A key to audio; VISUALS and V to visuals. Verify mesh hit targets against visible labels.
- Apply the two-knob table above to dragging, arrows, keyboard adjustments, readouts, and saved values. Volume/brightness/contrast display percent; sync displays signed milliseconds. Preserve existing sync range of -3000 to +3000 ms unless a concrete reason requires changing it.
- Keep the physical endpoints low-left/low-bottom in both modes. A positive sync offset means audio delayed; negative means audio ahead. Keep this convention consistent through playback and seeking.
- Make pointer capture/drag ownership prevent OrbitControls from moving the camera during knob use. Audit `FORCE_CAMERA_UNLOCKED` and the user-controls enable path.
- Gate: switch modes via every input, including rapidly midway through a transition; only the appropriate pair of values changes and switching back restores its positions.

### 2. Make mode and button visuals deterministic

| State | Button body | Text |
|---|---|---|
| Selected AUDIO/VISUALS | Bright blue glow, pressed | Green |
| Unselected AUDIO/VISUALS | Red, released | Blue |
| SAVE resting | Bright blue glow | Green |
| RESET resting | Red | Blue |

- Whitelist mode-related transform tracks. Animate the cat separately according to animation permission; do not treat it as mode state.
- Compute material transitions from current appearance to target appearance, independent of playback direction. Explicitly set base/emissive colors and intensity. Mode transitions must never alter SAVE/RESET.
- SAVE/RESET have no authored clips: give them independent, short press/release feedback only on activation, returning to their specified resting colors and transforms. If using a color pulse, interpolate to a defined press state and back. Do not redesign their existing save/reset behavior in this pass.
- When animation is disabled, apply endpoint poses and colors immediately; manual control changes still work.
- Gate: both directions and interrupted transitions end with the same correct colors/poses. SAVE/RESET remain stationary during startup and mode changes.

### 3. Unify consent and simplify camera movement

- Ask sound permission first, then animation permission, before any optional GLB motion. Sound permission does not auto-start a sample. Both responses advance the same flow, whether activated on the GLB or its accessible DOM equivalent.
- Yes to animation enables intended camera/model/mode/button motion; No applies useful final poses immediately and disables those automatic transitions. This does not prevent user-requested video playback or direct knob manipulation.
- Respect reduced-motion preference before an explicit choice; an explicit animation answer is authoritative. Preserve consent decisions in memory even when cookies/localStorage are unavailable. Reuse existing consent/persistence services without leaving a second unresolved prompt/listener path.
- Replace approach/hold/departure camera timing with one continuous path progression and global ease-in/ease-out, with nonzero motion through the middle. Retain elapsed-time sampling, smooth position/orientation, and seamless final OrbitControls target/radius/orientation. Keep the initial duration near the existing six seconds and tune visually. No headline pause or endpoint snap.
- Update `tools/camera-transition.test.html`: its headline-hold expectations are obsolete. Verify continuity through the middle and around handoff, including the first controls update and 30/60/144 Hz sampling.
- Gate: all four sound/motion response combinations reach a usable gallery, with no unwanted audio or GLB movement and no hanging consent promise.

### 4. Render thumbnails and selected media on the GLB screen

- Use `Videos/start-page/alphabet-lq.webm` and `counting-lq.webm`, paired with `alphabet.opus` and `counting.opus`. Audit confirmed both LQ WebMs are **video-only**: alphabet 640×480/about 94 s; counting 960×720/about 36 s. Do not assume unmuting the WebM produces sound.
- Show representative still thumbnails side by side after onboarding. Crop their facing edges into the requested stepped diagonal separation. Make the gap slightly narrower than the outer screen margins; keep the shape/margins configurable for visual tuning. Preserve image proportions. Clicking the visible thumbnail polygon selects and plays that clip; the gap is not clickable.
- Reuse one video/audio pair and one screen compositor/CanvasTexture for prompts, thumbnails, and playing media. Provide a discoverable pause/return-to-gallery action and operable DOM equivalents. Avoid a second hidden player continuing independently.
- Normalize screen UVs once for both rendering and raycast hit testing: this asset's u range is approximately 0.001953125–1.001953125 and v range 0.125–0.875. Existing fitting/flipping and modulo logic must not mirror or wrap hit targets. Test corners and both diagonally cropped edges.
- Give the screen a neutral, independently owned material; the existing purple emissive tint must not contaminate video. Exclude it from generic emission passes. Update texture when content/video frames change rather than regenerating it unnecessarily.
- Create the Web Audio media source once, reuse it across clip changes, and handle a suspended/unavailable AudioContext. Native fallback must apply mute/volume to the audio element. Denied sound remains silent even after moving volume or switching modes.
- Preserve sync on play, pause/resume, seeking, replay, and source switch, including negative offsets. Pause both streams when leaving playback; handle delayed audio at end without unintended trailing playback. Surface recoverable media failures without misleading permanent initialization messages.
- Gate: both clips visibly play on the GLB, paired audio follows permission/volume/sync, and repeated source changes produce no duplicate-source errors or overlapping sound.

### 5. Calibrate brightness, contrast, and legibility

- Contrast left: very low scene illumination, lower than the current minimum, with brighter intentional highlights. Contrast right: brighter scene illumination, dimmer/darker highlights. Green lettering should remain dense green, like unlit panel lettering, at the bright end.
- Use one appearance calculation combining brightness, contrast, material category, and button state. Contrast must actually change scene lights as well as emission; avoid alternating render-loop writes. Account for structural emission so the panel can become dark without extinguishing useful highlighted controls.
- Brightness remains independent, increasing bottom-to-top. Proposed implementation choice: control overall perceived brightness with a readable floor and deliberate screen response; the current background-overlay-only behavior is insufficient as an unquestioned assumption. Tune with the user screenshots rather than inventing a precise requested lux/RGB curve.
- Preserve the button color table throughout the range. Do not turn the entire model into a uniformly emissive surface or wash out text. Remove startup/debug overrides that force knobs or lighting back to an endpoint.
- Keep start-page calibration local; avoid changing the lighting curve for every other site page.
- Gate: inspect both modes at minimum/middle/maximum brightness and contrast, especially dark-left highlights, bright-right green text, and video color neutrality.

### 6. Integrated regression check and delivery

- Test the same served `index.html` in an external browser and VS Code preview at comparable viewport sizes; compare camera pose and initialization. Use a local HTTP server, not `file://`.
- Check fresh and saved preferences, storage quota/blocked persistence, OS reduced motion, all consent combinations, repeated mode switches, interrupted transitions, knob endpoints, keyboard input, pointer capture, source changes, seeking, and returning to gallery. Preserve `tools/local-preferences.test.mjs` coverage.
- Preserve debug hidden by default and a working SHOW/HIDE button. `/errors.local/` is already explicitly ignored; the `.local` suffix alone has no automatic Git meaning. Read current diagnostics if useful, and verify the path remains ignored.
- Check console/network failures. The mouse helper's direct Three r159 import differs from the start page's r158 import map; consolidate compatible imports if responsible for the duplicate-instance warning, while checking callers on other pages.
- Review the final diff for accidental unrelated changes. Report what was verified automatically versus visually, any remaining limitations, and **all remaining phases/steps**. Do not claim completion from syntax checks alone.

## Suggested execution instruction

“Implement this audited handoff in order, preserving existing working-tree changes. Begin with mode/knob state and explicit GLB bindings, then proceed through all six phases and their acceptance gates. Use small focused modules only where they clarify ownership; avoid a broad rewrite. Keep user-facing progress concise. Do not deploy. Finish with verification evidence and all remaining steps.”
