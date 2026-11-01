# Blank sticky notes and reliable numeric dragging

Originally paused at the user's request on October 29, 2026, before implementation; resumed with explicit user authorization. The code changes described below are implemented. Twelve targeted regression tests and scoped ESLint pass. Real-browser verification is pending because local browser use is disabled in Work settings. The user's existing tab has not been reloaded or edited. The previous shelf-loading repair remains in place.

## Current implementation

- `core/numeric-input.js`: numeric inputs accept dragging even when focused; capture starts on pointerdown. A 2px movement threshold activates scrubbing. Pointer lock uses relative pointermove with a deduplicated mousemove fallback, preserving continuous movement without a screen edge limit where lock is allowed. Denied lock retains captured coordinate dragging. Native selection/click-through is suppressed only for numeric gestures, with double-click selection for typing. Escape, blur, cancellation, delayed lock, release, history-owner callbacks and disposal are handled.
- `sticky-notes/data.js`: reusable blank appearance helper keeps color, size and rotation while clearing text. Saved note bodies are untouched.
- `sticky-notes/index.js`: new dialogs do not inherit previous words; successful placement resets next-note text. Empty notes may be placed, and empty read dialogs do not add visible placeholder words.
- `sticky-notes/scene-adapter.js`: empty page notes draw no placeholder words, retaining an accessible label.
- `_1-about/sticky-notes-adapter.js`: its separate dialog also permits empty notes.
- `tools/numeric-input.test.mjs` plus `tools/sticky-notes-compose.test.mjs`: 12 checks pass, including focused fields, immediate field exit, relative movement without mouse events, deduplication, denied/delayed lock, capture handoff, secondary releases, release click suppression, cancel/disposal, ordinary text input, blank defaults on all pages and accessible blank DOM notes.

The original investigation below records the pre-fix state. The reservation conflict described there was resolved before the shared renderer was edited; the latest file was reread and reserved normally.

Preview: http://127.0.0.1:8878/_3-graphics/graphics.html?review=integration26

## Requested behavior

- New sticky notes start with blank text until the user supplies it, across pages.
- LMB dragging numeric text boxes must keep ownership/focus immediately when the cursor leaves the field, and support continued movement beyond screen edges. Preserve ordinary text editing and selection in real text/textarea fields.

## Findings

`_7-shared-scripts/core/numeric-input.js` is the delegated site-wide number scrubber mounted by `core/bootstrap.js`.

- Its pointerdown handler skips an already-focused input. Subsequent drags fall back to native selection instead of scrubbing.
- It never captures the pointer, so the pending drag can leave a small input immediately.
- After activating at a 6px threshold, it requests pointer lock. Its pointermove handler then ignores locked movement, relying exclusively on mousemove. Canceling pointerdown suppresses compatibility mouse events in some browsers, causing the observed brief adjustment followed by a stall.
- Fix by capturing on press, allowing focused numeric inputs, handling relative pointermove under lock with mousemove as a deduplicated fallback, and suppressing selection/click-through during a real scrub. Handle release, Escape, blur, denied/delayed lock and disposal cleanly. Preserve owner start/end history hooks, min/max/step, Shift precision and click-to-type. Pointer lock provides unbounded relative dragging; do not attempt OS cursor warping.

Sticky-note data defaults are already blank in `sticky-notes/data.js` (`newNote`). Reuse comes from `sticky-notes/index.js`: it restores saved draft text and copies the previous draft into each new dialog. New-note dialogs also require nonempty text. The DOM renderer in `sticky-notes/scene-adapter.js` substitutes visible `Sticky note` for blank content. The read dialog substitutes `Empty sticky note`. Those visible placeholders should be removed or moved to accessible labels. Preserve existing authored note text and user data.

`_1-about/sticky-notes-adapter.js` has its own new-note dialog, already opening with blank text, but it also requires nonempty text. If blank placement is allowed, update that path consistently. Its 3D paint function already draws blank content correctly. The Graphics 3D adapter also paints blank text correctly.

Read `_8-tools-and-notes/settings-menu-gestures.md` before settings work; it was read during investigation. `_8-tools-and-notes/about-face-coordination.md` was also inspected before considering the About adapter. Do not reload the user's current tab if it contains unsaved edits; use a separate QA tab.

## Reservation state

No reservation remains held by this task. Initial atomic acquisition including `sticky-notes/scene-adapter.js` conflicted with `Docs Face contact QA adjustment` (token `e51a6aa8-5da7-4443-a279-f27d824e30f2`, acquired 07:04 UTC, then-expiry 07:19 UTC). Do not assume it is still active or recover it without checking the owner. A subsequent independent batch excluding that renderer was acquired, read, and released without edits (token `4371a709-c9b2-48ec-a57c-4aedee71eff8`). Reacquire the complete intended set and reread before editing.

## QA preparation

Disposable harness created, not yet opened or tested: `output/numeric-input-review/index.html`. It imports the real shared numeric handler and exposes numeric value, input/change counts, focus, lock state and event logs in DOM output. It includes an explicit focus button, a normal text field and a blank textarea, enabling checks without changing actual settings or notes.

Existing `tools/sticky-notes-compose.test.mjs` verifies the previous read-history startup repair. If adding a data helper export, update its synthetic import stubs accordingly. No numeric regression test file has been created yet. No tests or browser checks for the new request have run.

## Remaining phases / steps

1. After local browser access is enabled, verify in a separate browser tab using `output/numeric-input-review/index.html` and the real note UI. Check focused-field drag beyond the input, pointer lock, release/typing and new blank note creation. Preserve the user's current tab/data; remove any temporary test notes through reversible normal UI.
2. Capture the result and update this handoff. Reacquire the full intended file set before any further edits; release reservations afterward.
3. User review and any requested refinements. No additional source work is currently known to be needed, subject to the pending browser checks.

No commit, push, publication or deployment is authorized.
