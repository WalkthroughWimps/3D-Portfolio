# Start controls, lighting and projection repair — October 26, 2026

Scope: the human's Start-page reports and supplied screenshots/video. Preserve other chats' work. No commit, push, publication or deployment. Work is local desktop only.

## Implemented

- Drawer framing now uses proportional renderer sizing and horizontal projection offset only. The render crop preserves the current authored camera aspect and clears after rendering; panels do not change the model transform, camera pose, Y framing or scale. Rendering and raycasting use the same projection, including open-drawer offsets.
- Emissive capture retains the model root, isolates controllable shared materials once, honours zero strength and saved exclusions (including Select None), and advertises only supported live material targets. Runtime replaced switch/readout materials no longer appear as ineffective controls.
- Removed the obsolete Start controls form from Settings/Debug presentation, the visible legacy-header toggle and the raw contrast-knob tracker. Hidden support DOM remains where runtime bindings need it. Fixed the confirmed `Let’s` mojibake; a scoped Start/debug/index scan found no remaining matching corruption.
- Controller speed updates active playback; MMB focus uses Focus move duration; Replay camera move uses Camera move duration. Removed disconnected Focus Shift Start and dead camera-animation state. Retained sliders have associated labels and clearer names.
- Added a stronger rear directional fill and a weaker underside fill to the existing brightness-controlled lighting rig. Existing underside tuning and temporary power blackout include them.
- Replaced the flat rocker slab with a 240-degree extruded cylinder: the missing 120-degree wedge exposes the two real angled radial faces carrying I/O. The cat has a fixed body beside the switch, faces it and uses its native paw joint to press I. Its body is placed once; only the paw joint moves during contact.

## Evidence and limits

Evidence: `output/start-controls-repair-2026-10-26/`. The supplied video was inspected at the human's 1908×962 viewport: opening right Settings widened the original model, and closing left it wide. Final no-drawer/Settings/Debug/both/closed screenshots and `drawer-camera.json` record identical camera position, rotation and distance across these states. This is bounded desktop evidence, not an all-route/device matrix.

`glow-zero.png` versus `glow-two.png` changes 336 scene pixels in the selected arrow (maximum channel change 163/255), excluding the control panel. Select None survived review-tab reload with zero checked; original 21 selections and arrow strength 1 were restored. Brightness was restored to 0.5 after rear/underside full- and zero-brightness comparisons. Rear surfaces and port details are readable; the underside remains deliberately dimmer. The obsolete form/tracker are absent from normal Settings/Debug UI.

Camera replay at 1000 ms visibly moved through intermediate camera positions and returned to the settled pose; its original 6000 ms was restored. The actual UI diagnostic changed from playing at 0.10x toward frame 1 to completed after switching to 2x; original speed 1 was restored. Focus duration 520 ms was restored. Off-center middle-clicks moved the camera from (-4.223,5.535,9.785) to (-3.427,5.661,10.145) without drawers, then (-4.776,5.992,9.138) with Settings open. An intentionally centered hit can have no visible translation.

Final cat samples capture appearing → reaching → pressing while power is off, then power on/disappearing. `final-cat-6.png` and `final-cat-10.png` show the same fixed back-facing torso/base and different paw poses; the paw meets the I face. Asset normals/UVs independently establish native forward +Z; the body has no animation track. The rocker ridge is at plate-local Z=-.075, ahead of the plate front near zero; its curved back remains seated inside the plate. The final exposed axle was removed; `power-rocker-final.png` and `power-rocker-detail.png` show the joined cut faces without a bar. Power returned to on and captured console errors were empty. Some early screenshots contain superseded cat facing/axle geometry; the explicitly final files take precedence.

No repository tests were added/run. Final module syntax, scoped ESLint across all four changed runtime modules and tracked whitespace checks passed; local preview HEAD returned HTTP 200. Original user tabs and Notes/Music content were preserved. Test-changed glow, strength and brightness values were restored; timing defaults restored; the viewport override was reset and only the temporary tab closed. Windows native browser input can take foreground focus; the human explicitly authorized resuming after reporting a typing conflict.

## Every remaining phase and step

1. This bounded Start repair has no remaining implementation/desktop-review steps. External-browser, full viewport/device and all-route acceptance below remain separate. No release action is authorized.
2. Complete remaining desktop acceptance: remaining route destinations, fallback/no-WebGL, shortcuts/popups, OS reduced motion, all-owner timing, focused-media independent UI flags/returns/disposal, held transforms/resize/picking, About Notes fit and resource counts. Complete the new shared-video rollout controls/keys/seeks/soundtrack acceptance without changing Music preferences.
3. Sticky notes: closed-book proxy/open-detail mapping, cross-tab draft sync, moving/deforming/occluded surfaces, focus/cancellation and multi-note/disposal coverage; reviewed published content is still empty.
4. Recruiter Phase 2: introduction, Selected Work, Résumé and Contact with approved facts; sound-off first visit.
5. Recruiter Phase 3: optional setup after entry, remembered sound denial and media exits; allowed/denied/revoked paths.
6. Recruiter Phase 4: purpose/audience/contribution/outcomes for three examples, remaining page adapters and text alternatives; written content before voiceovers.
7. Recruiter Phases 5–7: labels/discoverability, Docs alternative, readable Music labels and utilities; chosen hierarchy; fresh-visitor desktop/keyboard/screen-reader/media acceptance and separate review/handoff.
8. Settings: remaining owner-safe binders/density; numeric pointer-lock/text-selection/fine/bounds/Notes undo/cancel acceptance; first-paint/help/game/book/easing/phone/resource coverage; animation linking/timing/backing/bounce and compatible curve/effects picker. Hover/custom curves/axis flips remain lower priority; audit face reduced motion.
9. Keyboard/controllers: remaining parity/keytips and six absent Graphics targets. Resolve Music live-note handles, live/recorded visuals, pedal/lost-keyup ownership, polyphony/SF2/mono/instrument/backboard prerequisites before Piano/Interface mode. Continue shared-player/Music/Start extraction in dependency order.
10. Content/assets: visitor copy, editable maintainer PDF, proven unused-asset cleanup and attribution; retain uncertain variants. Model presentation variants remain deferred.
11. Older architecture Phases 4–8: storage/consent/BFCache/counting; Start/Videos/Games ownership; Music audio/MIDI/storage/cache/preparation/leases/disk/RAM; presentation/accessibility/fallback/performance; candidate inputs/licenses/clean-checkout CI/reproducible artifact/full release acceptance; final rollback/manual/evidence and six caption drafts. Consult `videos-intro-repair-handoff.md` before continuing.
12. Full mobile/device/deployment readiness remains deferred. GPT-6.1-family phases require exact scope/model/effort preflight and permission; release actions require explicit requests. Full earlier acceptance detail remains in `local-browser-acceptance-2026-10-26.md`; no broader gate is closed by this bounded repair.
