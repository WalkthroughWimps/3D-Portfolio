# About face ownership and file coordination

## Cube and face work planning

Cube and Face chats implement the user's requested work. Pressing Enter on a chat request authorizes implementation and delegation within that request. Delegate bounded work to the lowest-cost available model and reasoning effort likely to finish correctly when practical; the coordinator sequences phases and reviews diffs, results, and appropriate evidence before accepting work. For complex requests, order phases by dependency and state each phase's scope, planned model/effort, owner, expected outcome, and review check. Trivial requests do not need phase planning. Continue dependency-ready lower-model phases autonomously; do not stop after planning or between them to ask whether to proceed.

Before the next dependency-ready phase needing any GPT-6.1-family model for implementation, guidance, or review, report its scope, exact model and effort, why cheaper models are insufficient, and expected work/usage without invented prices, then wait for explicit user permission for that phase. Do not ask again for the same scope the user has already explicitly approved. General implementation or continuation authorization is not blanket GPT-6.1 approval. Continue independent approved lower-model work while waiting; do not leave it unfinished because of this gate. Existing reservations and face ownership remain in force. See "Cube and face work planning" in `AGENTS.md` for the repository-wide rule.

Implemented October 17, 2026. Applies to the About cube only; it does not advance the older Videos/site architecture phases. The local preview is http://127.0.0.1:8878/_1-about/about.html?review=1.

## Face entries

| Chat / face | Entry | Borrowed GLTF backing | Existing implementation owned by that chat |
| --- | --- | --- | --- |
| About Face | `_1-about/faces/about/face.js` | `back.about` | Add About-specific components under its face folder |
| Skills Face | `_1-about/faces/skills/face.js` | `back.skills` | `_7-shared-scripts/panel-assembly/` |
| Notes Face | `_1-about/faces/notes/face.js` | `back.art` | `_1-about/notes/` |
| Clock Face | `_1-about/faces/clock/face.js` | `back.clock` | Add Clock-specific components under its face folder |
| Refs Face | `_1-about/faces/refs/face.js` | `back.refs` | Add Refs-specific components under its face folder |
| Odd Face | `_1-about/faces/odd/face.js` | `back.odd` | Add Odd-specific components under its face folder |

The four currently static faces expose their existing model backings through the same lifecycle as the two interactive faces. No new content, animation, or geometry has been invented for those static faces. The GLTF's ` Export` source-name suffix is resolved by the registry.

`_1-about/about.js` owns the shared scene, renderer, camera, cube rotation, framing, source loading, and final model disposal. `_1-about/faces/index.js` constructs and coordinates the six entries; `model-face.js` resolves borrowed backings/components. Existing Notes and Skills components stay in place to preserve their asset URLs and other consumers. Face-specific work normally requires no change to the cube host or registry.

## Common interface

- `attach(context)` receives `cube`, `gltf`, `manifest`, `renderer`, `camera`, `canvas`, and `findNode(name)`. The backing and component references are borrowed; preserve authored parent transforms and pivots.
- `update(dt, state)` runs on the host's render loop. `state.rotating` indicates a shared cube drag. Face entries must not start another render loop.
- `suspend()` and `resume()` pause/resume the face's own activity without rebuilding it.
- `detach()` releases face-added resources and model references, retaining any reusable workspace UI; `dispose()` additionally releases the whole face owner. Repeated cleanup must be harmless.
- Optional `applySettings(snapshot)`, `afterRender({drawer})`, `endGesture()`, `gestureActive`, and `rotating` cover shared settings, overlays and exclusive pointer gestures. Added resources belong to the face; shared GLTF geometry/materials/textures belong to the host.

Notes constructs its drawing UI once and attaches it when the cube loads. The Notes implementation retains its own settings subscription. Skills owns its assembly, settings context, controls and filament inset. The existing `window.__aboutSkillsReview` inspection interface remains available with an additional `faces` registry.

## Reserve before editing

This is a cooperative write reservation, not automatic awareness of another chat's thoughts or an OS file permission. All participating chats must follow `AGENTS.md`. Ordinary inspection can read reserved files; reserve and reread before preparing an edit to them.

From `C:\Dropbox\Resume Website`:

```text
node tools/face-file-reservations.mjs status
node tools/face-file-reservations.mjs acquire --owner "Skills Face" --files _1-about/faces/skills/ _7-shared-scripts/panel-assembly/
```

Keep the returned `reservation.token`. Replace `TOKEN_FROM_ACQUIRE` below with that value:

```text
node tools/face-file-reservations.mjs renew --token TOKEN_FROM_ACQUIRE
node tools/face-file-reservations.mjs release --token TOKEN_FROM_ACQUIRE
```

Acquire every needed path in one batch. Directory reservations conflict with descendants; Windows case aliases resolve to the same key. Acquisition is atomic: if one requested path is held, none of the batch is reserved. Do not hold one batch while waiting for another, which could deadlock. Release it and acquire the complete set together.

On a conflict, work on unrelated files or retry the same acquisition with `--wait-ms 30000`. A bounded wait returns success or a JSON conflict list (exit code 2). Other errors exit 1. Reread the files after waiting. Do not automatically queue a delayed overwrite from an earlier snapshot.

Reservations last 15 minutes by default. Renew at least every 10 minutes during an active edit/verification slice. Release in a cleanup/finally step on completion or failure. Expiry is shown in status but never silently transfers ownership. Only after inspecting the owning chat and confirming it stopped editing may a coordinator use:

```text
node tools/face-file-reservations.mjs recover --token EXPIRED_TOKEN --reason "Owner has completed/failed; describe the observed evidence"
```

Renew/release/recovery require the exact token. Recovery additionally requires expiry and a reason. All table operations use an exclusive transaction guard and atomic JSON replacement; transient Windows indexing/sync file holds are retried while retaining the guard. Local state lives in ignored `tmp/face-file-reservations/` and is not a deployment input. If a process crashes while holding `transaction.lock`, inspect its PID and timestamp, confirm that PID has exited and nobody else is recovering, then remove only that guard file before retrying. Never remove the reservation table to bypass a conflict.

## Shared changes and handoffs

Reserve shared `_1-about/about.js`, `about.html`, `about.css`, `faces/index.js`, `faces/model-face.js`, global settings/shortcuts/debug files, and the combined model whenever changing them. For model replacement, reserve both `assets/panel-assembly/model.glb` and `runtime.json`, plus the actual source asset being edited. Stage face asset experiments in a face-owned folder, then integrate them through a brief coordinated shared-model edit.

Notify affected Face chats when a shared API or ownership boundary changes. Include changed paths, the reservation protocol, current preview, verification, and remaining work. Never ask another chat to perform the same extraction simultaneously. Remain in the shared Local checkout for one combined preview; separate worktrees do not automatically synchronize source files.

## Completion and remaining work

Required work in this bounded change: reservation helper and instructions, six face entry modules and registry, extraction of Skills/Notes integration, combined browser/lifecycle checks, and Face-chat notification. Validation evidence is retained under `output/about-face-modules/`.

Optional later work: split per-face GLBs and relocate the legacy Skills component directory after checking every consumer. Neither is necessary for face-owned entry modules or shared reservations. Existing per-face feature work and the broader architecture acceptance phases remain owned by their existing chats/handoffs; this change does not claim to complete them. No commit, push, publication or deployment is authorized by this handoff.

Verified for this change: targeted source/helper ESLint and generated HTML checks pass; six backings and 37 cards load at 1440px and 390px; Notes focus, suspend/resume, disposal/reload and unavailable-WebGL/failed-model fallbacks pass without page errors. The existing click/hold and settings persistence regression passes after extraction. Reservation validation covers separate-process contention, ancestor/child conflicts, atomic batches, waiting, ownership tokens, renewals, explicit expired-owner recovery, and outside-workspace rejection. See `browser-validation.json`, `reservation-validation.json`, and `process-contention.json` under the evidence folder.

## Odd Sound speaker response — October 17, 2026

`faces/index.js` now owns `faces/speaker-response.js`, driven after face updates by the Odd engine’s post-volume RMS signal. Only `about` and `refs` opt in, and only while their declared component lists are empty. Clock, Notes, Skills and Odd are excluded because of their attachments. Review this explicit allowlist before adding attachments to About or Refs. The helper borrows source meshes, installs its own geometry clones, leaves shared materials and node transforms unchanged, restores original geometry before face detach/disposal, and disposes only its clones. Reduced motion and suspension reset immediately; silence settles. No host, source GLB or Clock implementation was edited. Shared files were reserved together under Odd Face using the normal reservation protocol.

Verified: actual-backing profile clearance, bounded audio-driven displacement, playing PCM and mute signals, reduced motion, suspension, silence settling, repeated detach, original shared geometry restoration, and exclusion of attached faces. Odd’s four strips now touch and its reels/control covers sit 0.24 units deeper in the existing bowl. Local preview: http://127.0.0.1:8878/_1-about/about.html?review=1&face=odd&odd=recessed. Remaining: user microphone check; optional session save/export, splice/additional effects, loose cloth collisions, and moving deployment clearance. No commit, push, publish or deploy.

## About Cube interior and fast-pass artwork — October 17, 2026

`faces/interior-drive.js` owns the nested X/Z/Y gimbals, upright gyroscope, cube-fixed armature, retracted contactless pickups, clock magnetic generator and the Odd harness. The harness hangs from the armature, clamps to measured `cube.main` geometry, and climbs the inner corner to the Odd rim. Its clamps attach to the chassis, never a speaker membrane. Source backings, Clock assets and Odd face modules were not edited. Settings tabs wrap into two rows while the About backing controls are attached.

Skills is now an explicit exception to the speaker helper's attachment exclusion. Its bounded membrane motion clears the card carrier; the lattice copies the same spatial weights and current-frame displacement through `getSpeakerSurface(backing)`. The shader uniform is sampled before drawing, after the shared speaker update, avoiding a one-frame delay or a separate vibration oscillator. Skills motion continues with its skin hidden; the lattice is then visible from either side. Global and Skills-local reduced motion reset the field. Other attached faces remain excluded. The helper still restores original geometry and disposes only its clones.

`preview-input.mjs` adds an optional `onFastPass(id, {speed, duration})` callback for mouse-only hover exits. `FastPassSurprise.mjs` admits square-card passes of at least 900 CSS px/s lasting at most 220 ms, with an 18% chance and 1.8-second global cooldown. `CardNameFrame` draws one of six procedural placeholders temporarily, restoring the app art on ordinary contact or after five seconds. These overrides are excluded from artwork persistence and exports. Reset and suspension also clear them. User-supplied surprise images can replace the procedural pool later. REAPER was verified and saved with its original icon/name modes and no portrait uploads in the review browser.

All changed source paths were reserved together under About Cube and reread after acquisition; reservations were released after verification. Evidence is under `output/about-cube/`: 85 repository tests, 52 focused browser checks, successful shader rendering, two-row navigation at 390/720 px, 125 sampled cube orientations, minimum orb clearance 0.05944 m after allowing the full 0.006 m speaker excursion, and sampled wire clearance 0.02924 m before that excursion. The browser checks also cover exact speaker/lattice field matching, hidden-skin behavior, placeholder restoration and persistence isolation, and idempotent cleanup. Remaining for this request: no implementation steps; optional replacement images when supplied. The broader site architecture and other Face-chat feature work remain under their existing handoffs. Nothing committed, pushed, published or deployed.

Follow-up: gyroscope compensation now follows its upright target with a 0.32-second exponential time constant. Quaternion interpolation preserves the shortest rotational path and consistent settling across frame rates; attachment and reduced motion snap upright. Cube-fixed arms and wires remain immediate. Odd's power feed now goes directly to the adjacent +Y corner, then follows the outer trench to the upper control panel. A second pair links the two control panels below the cloth tracks. The panel loom borrows Odd's existing upright carrier; flexible trench leads follow its turn without modifying any Odd face source or speaker geometry. This helper owns and removes the borrowed-carrier additions during detach. Updated browser evidence covers delayed settling, suspension, reduced motion, reattachment, rotating cable endpoints and sampled backing clearance at 30-degree carrier intervals. Remaining steps for these follow-ups: none after verification; broader face and site programs stay under their existing handoffs.

## Shared diagnostics, face switches and optical/magnetic drive — October 17, 2026

The shared Debug drawer is available on all seven main pages. `debug/performance-stats.js` samples browser frame timing (including the 95th percentile), long tasks where supported, heap where available, DOM and canvas counts, and registered renderer counters. Sampling runs only while the drawer is open and the document visible. About registers its renderer and resets draw counters once per host frame so inset passes are included. Other pages still provide the browser/DOM counters; renderer-only rows explicitly report their availability. Debug uses Settings' primary and secondary hues in reverse. The common settings transfer menu now has a red Cancel action, an Import-button-height pointer exit margin, capture-phase outside dismissal, and keyboard dismissal.

Each face now has a persistent `about.<face>.enabled` control. Disabled entries suspend and skip updates; face-owned carriers and backings hide, while authored artwork and the separate backing preferences are retained. Skills' membrane stops vertex uploads when disabled. `about.notes` adds shared clipped-art, rear-artwork, projector, backing-projection and optional interior-fit preferences. The existing clipped-art toolbar was retained, and Notes Face has made it prominent and deepened the panel styling. Edge layout preserves manual camera zoom; fitting the open cube is opt-in and unavailable while its backing is shown. Rear glass/tint remains independent of rear artwork.

`faces/notes-projector.js` owns a hooded optical head and subtle side glow on the cube-fixed Notes arm. Its cone terminates at the glass's .885-radius boundary. With the Notes backing present, a small curved patch on its inward surface borrows the same live canvas texture and follows the glass carrier's roll; no second drawing engine or texture copy is used. Disabling projection removes the effect, and owned resources dispose before the borrowed Notes texture. The old Odd hanging/chassis/trench wires have been removed from `interior-drive.js`; only a short +Y arm ending at cube-local [0,.40,0] remains. Odd Face owns the rotary bracket/frame and its attached loom and hands.

Clock Face now supplies `runtime.magneticInput` and `runtime.magneticDriveTarget` in cube-local coordinates. The shared interior source matches the receiver's .046-radius wheel, red/blue pole positions, normal and live phase. Its shaft stops at the inner source wheel; no axle connects through either backing. The loaded Clock receiver/spindle work and evidence are under `output/clock-magnetic-input/`. Shared source/shaft sampling found .06597 minimum clearance to the two real skins.

Final acceptance — October 18, 2026: the Odd registry entry now loads `face.js?v=atelier-1`. Its connected rotating yoke/frame, stationary covered bearing seat, relieved reel covers and articulated weaving/unravelling palms are integrated. Actual clip additions, copying, import and recording drive weaving; deletion vacuums thread while the second hand uses a seam ripper. Undo restitches; long clips accelerate a bounded decorative feed without seeking or starting audio. Odd's 26 focused browser checks and seven queue tests pass. Representative static sampling leaves .01026 clearance before the .006 speaker excursion allowance; reel hubs clear the covers by .007. Intentional chassis intersections are confined to the covered bearing seat. This is a visual mechanism, not a continuous cloth/self-collision or fabrication proof; details and limitations are in `faces/odd/INTEGRATION.md`, with final views and results under `output/odd-atelier/`.

Seven-route Debug evidence is `output/about-cube/shared-debug-pages.txt`. The final integrated scene passes 53 controls/projector/magnet/lifecycle checks (`output/about-cube/shared-controls-and-projector.txt`), including face-scoped transfer sections and Notes' popup Escape handling. Notes' finished panel/rear-glass evidence is under `output/notes-face/revision-12/`. All 88 repository tests, targeted ESLint and generated HTML checks pass. The local review server returns HTTP 200 and the live Odd face was refreshed and captured in `output/about-cube/final-live-preview.png`. Source reservations were released after the integration slice. Remaining required phases/steps for these requests: none. Optional future work remains user microphone/device verification, supplied surprise artwork, session save/export, splice/effects tools, fuller cloth collisions and moving deployment/fabrication audits. The broader architecture program remains under its existing handoffs. Nothing committed, pushed, published or deployed.

## About rigid ring framing — October 19, 2026

About Face now supplies an optional `frameLayout({bounds, availableRight})` zoom proposal while its sixty-ring carrier is focused. The proposal encloses the full rigid flip sweep at the focused extension, including a narrow-screen margin, without changing ring geometry, camera position, or manual orbit distance. The shared host takes Notes' active layout first; otherwise it uses About's zoom proposal and the existing settings-drawer offset. This small host hook is limited to responsive framing after a viewport resize. About Face owns its ring geometry, plan, controls and assets under `faces/about/`; `back.about` and other faces remain untouched. Evidence and remaining steps are listed in `faces/about/README.md` and `output/about-rigid-rings/`.
