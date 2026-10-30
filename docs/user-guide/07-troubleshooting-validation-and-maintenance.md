# Chapter 7 - Troubleshooting validation and maintenance

## Begin with evidence rather than resets

Record the route, browser, viewport, expected action, actual result and first relevant console/network error. Preserve the edited tab and export unsaved work. Reproduce in a separate review context. Avoid clearing storage, resetting the whole Git tree or changing several systems at once.

Search the active entry and its imports. A script named v2 or an old copy beside it is not proof of which file the current HTML loads. Main Music uses a dynamic import; the About fallback has an independent classic script so it can work if the 3D module fails.

## A scene does not load

1. Check the first module error. A bare `three` specifier usually means the active import map did not resolve the dependency or a module loaded in the wrong context. Inspect the actual HTML served, not only the source you expected.
2. Check the requested GLB/data URL and response type. An HTML error page returned with status 200 is not a valid model or JavaScript file.
3. Confirm ignored external inputs are hydrated locally and inspect asset-host/CORS behavior separately from local paths.
4. Distinguish WebGL/driver failure from a network/module failure. Keep the native/text fallback usable in either case.
5. Reopen after a bounded fix and check errors, fallback navigation and input. Do not hide the error by permanently removing the fallback.

## Sound is silent or out of sync

Check consent, site mute, zero volume, actual audio source and AudioContext/media readiness. A fetched MIDI file is not proof that a recorded soundtrack is playing. A loaded instrument is not proof that every scheduled note has an active source handle.

For paired media, inspect both clocks and the saved sync offset. Check beginning, middle, ending, pause/resume, seek and rate changes. Timing fixes should belong to the transport owner, not an unrelated UI loop that continually overwrites time or volume.

If a browser rejects audible play, preserve the site's real permission/user-gesture path. Do not turn a query parameter into permission. Device microphone and speaker/listening checks cannot be replaced by a successful fetch or muted headless run.

## A setting seems ignored

1. Find the `data-setting` path and schema definition.
2. Check the current saved value and whether a legacy key wins normalization.
3. Verify the feature subscribes to that setting and has not captured a stale value once at startup.
4. Check whether Reduced motion overrides the effective animation while retaining its saved preference.
5. Use a field-specific reset or disposable context to compare defaults. Do not erase drawings/content to reset one preference.

## A click acts on the wrong object

Check visual and hit bounds, nearest-hit occlusion, parent-space transforms and camera projection offsets. Ensure a pan/rotate/drag cannot leave a stale click candidate. Sticky-note editing, modals and private tool gestures should own input until they finish, including the trailing click after a drop.

Native keyboard controls should remain available for canvas-only actions where implemented. Page shortcuts must leave typing fields, IME composition, browser modifier chords and open dialogs alone.

## Maintained commands and their effects

Use root `package.json` as the command inventory and `tools/VALIDATION.md` for prerequisites. Historical pass/failure counts in documents are not current results.

- `npm run review`: starts the loopback authoring/diagnostic preview.
- `npm run check:site-html`: checks generated regions/configuration without intentionally regenerating them.
- `npm run prepare:site-html`: writes generated header/import-map regions and worker config; coordinate all destinations first.
- `npm run lint`: source lint check.
- `npm test`: repository tests; use current required real fixtures and explicit scope rather than replacing them to obtain a pass.
- `npm run check:artifact` / `build:artifact`: inventory/build a new local package under the policy. Package creation is not release approval or deployment.
- `npm run preview:artifact`: static preview of a candidate. Local admin upload behavior is not available merely because static pages load.

Some check/build utilities write reports under output. Read a tool before assuming its name means it is read-only. Do not overwrite a retained release/evidence directory to rerun a check.

## Review before publication

1. Confirm the exact candidate and the human's release authorization.
2. Include generated files, local source updates and required external inputs as one coherent version. A clean Git checkout alone may lack ignored media.
3. Check all affected direct routes and embedded projects, root/subpath URLs, real media decode, browser errors, fallback content and accessibility.
4. Check persistence/import/export, permission revocation, repeated navigation and resource cleanup.
5. Check asset licensing, fonts/vendor notices, hosting object keys and service-worker/cache behavior.
6. Keep a rollback and a known version of the previous coherent candidate. Do not publish an unrelated dirty working tree merely because one page looks correct.

Full mobile readiness remains a separate deferred gate. The mobile warning is not a substitute for touch/device testing. Automated/headless/source checks do not establish screen-reader, physical speaker, microphone or device GPU quality.

## Keep this guide useful

Editable chapter sources are `docs/user-guide/`. The generator is `tools/build-user-guide.py`; PDFs are under `output/pdf/site-guide/`.

To regenerate one chapter with the bundled Python runtime:
```
python tools/build-user-guide.py docs/user-guide/03-about-cube-and-faces.md
```
Use the actual installed/bundled Python executable if the system python alias is unavailable. The script requires ReportLab and pypdf; visual review uses Poppler rendering. Check the generated pages before sharing the replacement.

When a control moves, update its UI path and source owner together. When an asset/format changes, document the source, export recipe, saved-ID compatibility and check routine. Keep historical evidence dated; link it instead of presenting it as fresh acceptance.

Remaining: browser-verify recipes, expand field-level indexes/screenshots, consolidate the detailed chapters if desired, and maintain them alongside future changes. The separate site program still includes architecture acceptance, settings/animation/keyboard work, controller extraction, content/asset cleanup and deferred mobile/model/release gates.
