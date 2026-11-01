# Local desktop reliability pass — October 26, 2026

The human requested priority 1: broken interactions, media exits, consent, keyboard access and accessibility. This pass is finished for the concrete local desktop repairs and checks below. It is not full screen-reader/device/audio/performance or release acceptance. The local review server had stopped and was restarted hidden at `http://127.0.0.1:8878/`; final HEAD returned 200. No commit, push, publication or deployment.

## Repairs

1. **Remembered sound denial.** Shared consent recognises an existing session, cookie or local-storage decision. Automatic requests reuse Deny. Explicit user unmute/volume actions can request again through `requestAfterDeny`, without programmatic audio patches reopening consent. Start keeps motion-before-sound and reuses a known sound choice. The ten touched owners/facades cover Start, generic route entry, Videos, Games/iframe audio, Graphics easel and Music. Consent remains separate from saved volume/mute.
2. **Reliable visible media exits.** Persistent keyboard-operable Back to videos, Back to games and Back to piano controls call the existing owner return paths. Buttons use white-on-dark text, visible focus treatment and at least 44 px height. Videos Back remains available in alternate player view, and its canvas keeps owned keyboard focusability until grid disposal. Games Back covers both reels and game frames; its same-origin child Escape listener detaches on replacement/disposal. Music Back is limited to the focused Sunil video and uses the Escape return path; it does not add a forced exit control to ordinary song playback.
3. **Keyboard ownership.** Videos/Graphics S skip ignores typing, native controls, handled/composing/modifier/repeat events and open modals. Games Escape consumes actual exits rather than menu keystrokes. Graphics does not put an item away while Settings or another dialog owns Escape. Settings/Debug Escape closes its drawer and restores an opener, while nested dialogs/transfer popups dismiss first.
4. **Accessible entry and content.** Start has a visible-on-focus skip link to its active main, replacing reliance on a skip link buried in hidden legacy support DOM. Games and Docs canvases have useful accessible names and keyboard focus. Docs exposes all four existing biography panels, transcribed from the rendered scene, followed by the 21 tool names from its actual card order. The decorative mouse guide hides while a text alternative is open and returns on close.
5. **Generated HTML consistency.** Only Music's generated header/import-map blocks needed byte/line-ending alignment. Their normalized semantic content already matched the generator. Other Music markup was preserved; the all-route HTML/config check now passes.

Sequential bounded implementation workers: GPT-6 Sol low for shared UI/keyboard/Docs; the reused GPT-6 Sol medium worker for coupled consent and Music ownership. Root reviewed source and performed live checks. No GPT-6.1-family phase was initiated. Every edit slice used file reservations, reread current source and released its token. The inherited dirty shared checkout was preserved.

## Live evidence

Default desktop viewport was 1280×720. Only temporary IAB review tabs were operated. No user tab was reloaded, no storage was cleared, and Notes drawings/content were not edited.

| Check | Observed result |
| --- | --- |
| Start normal entry | Tab wraps Yes/No; Enter proceeds from motion to sound; Escape chooses silent entry. After Deny, later normal entry asks only motion and proceeds without another sound prompt. |
| Remembered Deny | Videos reload and navigation to Graphics, Games, Music, Docs and About all show no sound prompt. Start also reuses Deny after motion choice. |
| Explicit request | Changing Start volume 25→26 opens Allow sound despite remembered Deny; Enter Allow succeeds. Volume restored to 25; final consent restored to the review's Deny choice. |
| Blocked persistence | Disposable browser fixture imports the real consent module with throwing storage and blocked cookie writes. Deny is retained for the session without another automatic prompt; explicit Allow works, reports session persistence/failed keys, wraps Tab and returns focus. This is an isolated module/UI fixture, not browser permission/blocked-storage coverage on every route. |
| Videos | Normal intro Play completed and enabled the grid; scene S still skips. S in an Audio sync input and in Help did not skip. A-List, Random Vids and Online Classes launched. Escape returned; persistent Back returned from the alternate F view. Final Back restored focus to the named tablet canvas. |
| Games | Go Plunky initially trapped Escape inside its focused iframe; after repair, the loaded child canvas Escape removes the frame and focuses the cabinet canvas. Ships, Train Mania, Pick a Square and Waiter launchers each created the expected iframe and keyboard Back removed it, including during loading. This is launch/exit coverage, not full gameplay. Both Game Reel and Christmas opened and returned; Help Escape left the reel active. |
| Graphics | The Great Race opened at the easel and played with DOM video `muted=true` under Deny. Escape from Settings closed Settings and left the video at the easel; the next Escape returned to shelf. Existing Pause/mute/speed/seek/Shelf controls remain accessible. |
| Music | Sunil launched; Escape returned. New Back stayed visible with the header hidden. Settings Escape left the video active; Back returned focus to the named piano canvas. Selecting Baby did not show the standalone Back control. Custom rates and other appearance controls were not changed. |
| Shared drawers | Settings Escape from Audio sync input and Debug Escape close only that drawer and return to the opener. A section transfer popup's first Escape closes the popup while Settings stays open; the next closes Settings. No import/export was performed. |
| Keyboard/text | About skip link focuses its main and Help closes to its trigger. Docs skip focuses its main; the named canvas accepts keyboard focus. Start's new skip focuses `uiCenterColumn`. Docs text view exposes four biography paragraphs and all 21 tool names. Mouse guide visibility is false while open and true on close. |
| Consent revocation | The separate local consent UI changed actual shared consent to Deny while a Games reel remained active. Source handlers and final shared Deny were checked, but the reel's detached audio elements and physical audio output were not instrumented; do not call this a complete audible revocation test. |

`output/reliability-2026-10-26/` contains `review-observations.json`, `game-returns.json`, the blocked-consent result/screenshot, final consent state, source hashes, and Videos/Games/Music Back and Docs text screenshots. `docs-panel-0..3.png` retain the biography transcription sources. An early Docs text screenshot shows the superseded mouse-guide overlap; `docs-text-equivalent-final.png` is the accepted result. Offline GLB texture inspection did not find this text because the actual rendered panel prose was not in the inspected albedo images; rendered scene screenshots are the transcription authority.

Final review values: volume 25%, sync 0 ms, brightness/contrast 50%; sound Deny with `shouldPrompt=false`. The review temporarily allowed sound and restored Deny. No global reset, browser permission change or unrelated preference rewrite. No viewport override was installed. Both successful review tabs were closed; an unmarked failed-start temporary tab is disposable. The original user tab was preserved.

## Validation

- All 13 changed runtime modules parse with Node module-stdin syntax checks.
- Scoped ESLint across those modules passes with no output/errors.
- `node tools/prepare-site-html.mjs check` reports all site HTML and worker config current.
- Scoped tracked diff whitespace checks pass; Git only reports inherited LF/CRLF conversion notices.
- Captured browser error logs were empty at the recorded checkpoints, including the final Docs and Music checks. Initial model parsing occasionally exceeded the browser control's 3-second selector deadline; the page settled and the same keyboard action then worked. No startup/performance readiness claim is inferred.
- No repository tests were added/run. No release action occurred.

## Later entry-flow source change

The subsequent recruiter Phase 2 implementation moves normal Start entry ahead of setup; the motion/sound actions accepted above now belong to an explicitly selected Comfort settings path. This later source has not received live browser acceptance because browser use reported disabled in its chat. The reliability evidence is historical for the preceding candidate, not proof of the new entry flow. See [the Phase 2 handoff](recruiter-entry-phase2-2026-10-26.md) for missing résumé/contact inputs and all remaining checks.

## Every remaining phase and step

1. **Remaining reliability acceptance:** actual screen-reader/browser/device and audible output; complete consent revocation on every output, native browser policy rejection and genuinely blocked browser storage; failed-assets/WebGL/no-JS and slow/hidden-tab/interruption recovery; counted remount/BFCache/late async/media/listener/timer/audio/GPU disposal; full focused chrome flags, held transforms/resize/picking, numeric scrub/Notes undo, OS reduced motion and phone notice. This pass closes only the observed desktop cases above.
2. **Shared video rollout matrix:** all rates/cycling/trailing-click/endpoints, both shifted-key representations, paused frame/numeric seeks, volume/mute/play/seek, soundtrack sync/rate, F/C/T and input/modal/sticky isolation across Videos, both Games reels, Graphics and Music. Current Back/Help/typing cases are covered above, not the whole matrix.
3. **Sticky notes:** closed-book proxy/open-detail mapping, cross-tab draft sync, moving/deformed/occluded surfaces, appearance focus/cancel, multiple notes and counted disposal; remaining page adapters and reviewed real content.
4. **Recruiter Phase 2:** immediate introduction, Selected Work, Résumé and Contact with human-approved facts and a sound-off first visit.
5. **Recruiter Phase 3:** the Deny and exit defects above are repaired; optional setup after entry and complete allowed/denied/revoked/device acceptance remain.
6. **Recruiter Phase 4:** purpose/audience/contribution/outcomes for three examples, remaining page adapters and text alternatives, then written-content-based voiceovers.
7. **Recruiter Phases 5–7:** remaining names/labels/legibility/hierarchy, chosen conservative visual pass, fresh visitor/keyboard/screen-reader/media review and separate reviewer/handoff. Docs' known text mismatch is repaired; other content/discovery work remains.
8. **Settings architecture:** owner-safe binders/density; animation linking/timing/easing/effects/backing/bounce; face/decorative motion audit; later hover/custom curves/axis flips. Complete the acceptance substeps in settings-architecture-progress.md.
9. **Keyboard/controllers:** remaining action/keytip parity and six absent Graphics manual targets. Music Piano/Interface mode still requires live-note source handles, live versus recorded visuals, pedal/lost-keyup ownership and polyphony/SF2/mono/instrument/backboard decisions, then implementation/acceptance. Continue shared player/Music/Start extraction in dependency order.
10. **Content/assets/manual:** remaining copy, editable maintainer PDF, attribution and proven unused-asset cleanup; retain uncertain variants. Standard/keyboard-labelled model sets remain deferred.
11. **Architecture Phases 4–8:** settings/storage/consent/resource lifecycle; Start/Videos/Games/Music ownership; Music cache/preparation/leases/disk/RAM; presentation/accessibility/fallback/performance; external inputs/licenses/clean-checkout CI/reproducible coherent artifact/full release/device/backend/subpath/worker acceptance; final review/rollback/manual and six caption drafts. Read videos-intro-repair-handoff.md before continuing those gates.
12. **Deferred/gated:** full mobile/device/deployment readiness remains deferred. GPT-6.1-family work needs exact scope/model/effort preflight and explicit permission; commit, push, publication and deployment need separate explicit requests. No broader gate is silently closed here.
