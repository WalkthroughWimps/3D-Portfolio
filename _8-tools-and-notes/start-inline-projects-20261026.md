# Start inline projects and controller entrance

October 26, 2026. **Implemented in source; live interaction/audio acceptance remains open.** The human supplied a 45.7-second recording, clarified that the Start settings controller appeared sideways after Yes, and requested that project shortcuts open their content over Start with a media Back control. No commit, push, publication or deployment occurred.

## Controller entrance repair

`_0-start/start-page.js` previously added a 0.7π yaw and a 0.16-radian roll to the model during its 850ms reveal. Those explicit entrance rotations are removed. The model retains its authored home rotation while appearing. The camera transition now uses the canonical pre-reveal center rather than measuring bounds while the model is partway through its entrance scale/position animation. Authored camera paths and manual rotation remain available; no board-game camera repair was made because the human clarified that the reported object was the settings controller.

The scene's suspend/resume path preserves entrance/focus start times and shifts the camera transition clock by the pause duration. It discards the paused animation-clock interval and prevents late scene callbacks from restarting rendering while a project overlay is active. `_0-start/camera-transition.js` exposes a narrow `shiftStartTime` operation for this purpose. Closing an overlay resumes the existing Start scene state rather than initializing Start again or replaying setup.

## Same-page project launchers

Both sets of Start project shortcuts have `data-start-project` hooks. Normal unmodified activation opens a native modal dialog over the existing document; the URL and selected Start view remain unchanged. Original hrefs remain for no-JS/import-failure and modified-click navigation. Résumé/download/contact and the general six-section navigation remain native actions.

`_0-start/start/project-overlays.js` owns dialog content, child frames, paired media, per-open generation checks and cleanup. Its CSS supplies a bounded full-viewport content area and a visible Back to Start button. Native modality prevents clicks through to the controller. The host pauses its own scene, calibration video/audio, welcome jingle and sync exercise while the project is open. Back restores the invoking shortcut's focus without resetting the page or automatically resuming audio.

- **Just Speak:** embeds the existing Graphics browser, hides duplicate site chrome, and uses the existing enabled Grade 1 button to enter the first book. A MutationObserver waits for that native control to become ready and is disconnected on entry or close. Normal book/table controls remain child-owned.
- **Global Conquest:** embeds the existing freeform tabletop directly, with duplicate child header/footer/back navigation hidden or routed to close the parent overlay. This does not implement automated game rules or change its default camera controls.
- **NeoTube Studios:** presents the actual HQ WebM with its paired Opus soundtrack and poster, using saved volume, mute, consent, sync and pitch preferences. Play is explicit. Controls include play/pause, seek, cycling speed, sound and volume; the basic keyboard paths are isolated from editable fields/buttons. Initial/seek/settings alignment is exact, positive offset waits for its boundary, frame callbacks maintain alignment, and failed/late play attempts are fenced. A sound-permission prompt lives inside the native dialog and is aborted on close, so it remains operable and cannot outlive its overlay.
- **Go Plunky, Go!:** shows the existing token art, native game title, a short team/token/score description and How to Play text. Construct runs behind an inert, unfocusable covered frame. The cover remains until actual runtime-ready, an explicit Play action and a source/origin/generation-checked playing acknowledgement. Loading/start failures retain the custom cover and offer Retry; elapsed time is never reported as readiness.

## Plunky embed bridge and cleanup

`games/plinko/start-embed.js` is enabled only by `embed=1`. `games/plinko/index.html` loads it before the generated runtime. The bridge wraps this export's RuntimeInterface readiness and audio interfaces without modifying generated engine bundles. It silences pre-Play audio, queues startup play requests, suspends the runtime through its existing visibility path until Play, applies parent consent/volume, then acknowledges after presentation opportunities. Message handling verifies the parent window, origin and generation. The parent keeps the iframe inert until acknowledgement.

Closing invalidates the generation first, removes listeners/subscriptions/observers/timers/frame callbacks, aborts pending permission, stops/removes media sources, blanks/removes child frames, removes the dialog and restores focus. Page hide/disposal closes the overlay; lifetime guards also reject work after scope abort, including while other deferred cleanup is awaiting completion. The bridge uses interfaces specific to this Construct export and must be checked when that game is re-exported.

## Evidence and limitations

- Root inspected nine sampled frames from the supplied recording. The overview and metadata are in `output/start-inline-media-20261026/`; the recording remains unchanged.
- GPT-6 Sol medium implemented the bounded overlay/Plunky bridge slice under file reservations. Root integrated the launchers, fixed the entrance rotation/center, reviewed the source, and completed targeted checks. Reservations were renewed/released; inherited shared-checkout changes were preserved.
- Module syntax and scoped ESLint pass for Start, the camera transition, overlay module and the owned Plunky bridge. The bridge was linted explicitly with `--no-ignore` because exported game directories are normally ignored. Generated site HTML/config and scoped whitespace checks pass. No repository tests were added or run.
- `source-http-inspection.json` records both hooks for each of four projects, a mounted overlay module/stylesheet, removed entrance turn/roll, stable reveal center, and HTTP 200 for the root, new resources, child routes and paired media/poster/art assets.
- The fresh hidden-browser attempt again returned “Local browser use is disabled in Work settings.” No review tab was created and no alternate browser automation bypass was used. Source checks and frame inspection do not prove the repaired orientation, interaction, audible output or resource counts at runtime.
- The existing project-entry workbook is unchanged in this slice. Its navigation-specific draft sentence about choosing NeoTube on the tablet predates the direct overlay; final factual copy remains deferred to the human's later workbook completion. Previous page-route inspection records are historical, not current overlay acceptance.

## Remaining slice checks

1. Live-check both Yes/No motion paths, the initial and settled controller orientation, rapid prompt choices, reduced motion, text/controller switching, manual camera resets and overlay entry during an active camera move.
2. Verify all eight shortcuts keep Start's URL/view/scroll/camera, show the correct project, and return through Back/Escape to the invoking control. Verify modified clicks and no-JS fallback separately.
3. Verify direct first-book entry and table interactions, child settings/dialog Escape ownership, errors/slow loading, and absence of duplicate chrome or inaccessible controls.
4. Verify Plunky's real ready/Play/first-frame acknowledgement, no Construct loader exposure, inert cover, sourced instructions, failed load/Retry, consent/volume/revocation and silence on Back, page hide and repeated reopen. Check the exported engine bridge against actual runtime behavior.
5. Verify NeoTube audible sync at negative/zero/positive offsets, seek/pause/end/rate, sound permission allow/deny/cancel, volume/mute changes, buffering/failures, policy rejection and no late audio on Back/reopen. Full shared-player keyboard/help/caption parity remains part of the media backlog.
6. Review narrow/short-height/zoomed layouts, focus trapping/return, screen-reader announcements and counted media/RAF/listener/iframe/GPU disposal. The native dialog is source implemented, not accessibility acceptance.

All other remaining recruiter/reliability/media/sticky-note/settings/keyboard/content/manual/architecture/device/release steps remain listed in [the canonical checklist](recruiter-entry-phase2-2026-10-26.md#every-remaining-phase-and-step). No broader gate is closed by this source repair.

## Shared player and cross-page follow-up

The Start video overlay now mounts the actual shared controls UI and media controller through `start/featured-video-player.js`, with the Start/About red-and-blue theme. Its video stage requests browser fullscreen, retains focusable canvas and accessible DOM controls plus sound permission inside that stage, and exits its owned fullscreen before Back. The larger video has a centered heading, header spacing, saved explainer copy beneath it, and a short cyclic list of related clips at the right; all six clips are reachable without leaving the overlay. A prominent native link still leads to the interactive Videos tablet. The user explicitly limited the explainer/related layout to this overlay; the main Videos page was not changed by that request.

The selected playback rate is explicitly applied to both video and separate Opus audio during loading, playback, settings alignment and rate changes. The later 2× sound report led to a bounded source repair: alignment does not seek during a pending soundtrack `play()` promise, transient AbortError gets bounded retry/cooldown, and drift correction uses a 250ms media-time threshold. A seek interrupting a pending play was a plausible failure path; the exact observed cause and audible 2× result remain unproven. Real errors stay visible. Applicable frame, seek, volume, speed, fullscreen and help keys match the shared guide. Captions/tablet mode are not advertised as overlay capabilities.

The same overlay host now accepts a return label and is reused from Selected work on six content pages. The original Start host remains its sole owner. A lazy shared adapter suspends page lifecycle owners where exposed, pauses page HTML media, uses existing focused-media UI behavior, and fences late imports/disposal/hidden-page returns. Child embeds suppress duplicate work strips and do not mount a recursive host. Graphics exposes no bootstrap suspend/resume hook, so its scene may animate behind the modal; Music audio outside its existing lifecycle contract still requires owner-level acceptance.

Module syntax, scoped ESLint, generated HTML/config and local HTTP delivery checks pass. No repository tests were added/run. Local browser tooling reported disabled; there is no new rendered browser, audible-output, focus or fullscreen acceptance claim. The remaining slice checks above now also include repeated 2× playback, all related choices, real fullscreen permission/control focus, every content-page opener/Back, native fallbacks, visibility/BFCache, dock clearance and repeated cleanup. All twelve program groups remain in the canonical checklist.

## October 28: bounded 2× playback verification

The current Start preview already contains the prior paired-rate repair. A hidden browser run of NeoTube Studios measured 20.960 seconds of wall time against 41.9863 seconds of video advancement and 42.172724 seconds of soundtrack advancement. Both media reported rate 2, readyState 4 and active playback; the soundtrack was unmuted. Three rapid seeks and pause/resume recovered with both media still at 2×. Switching to Music Videos retained rate 2 on both media and started its unmuted soundtrack. No warning/error logs were recorded, and Back removed all preview video/audio elements. Evidence: `output/video-2x-check-20261028/clock-check.json` and `player-2x.png`.

No current 2× regression was reproduced, so no speculative runtime change was made. This confirms browser clock advancement and recovery, not a physical listening/speaker test. Remaining for this bounded check: user listening confirmation if the reported audible symptom persists, including which player and browser. The other media, device, fullscreen and architecture gates above remain separate. No commit, push, publication or deployment occurred.
