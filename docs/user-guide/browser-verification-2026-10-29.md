# Guide browser verification - 29 October 2026

Scope: inspect current local UI routes and labels for the guide, without changing source/runtime code, uploading content, saving documents or altering preference values. This is documentation evidence, not full feature acceptance.

Environment: Codex in-app browser, local review server at `http://127.0.0.1:8878/`, 1280 x 720 screenshots. The server was restarted because it was unavailable at the start of this pass. Existing browser content/preferences were preserved.

## Checked

- Docs loaded the 3D desk. Gear opened Settings; General showed Audio, Scene appearance, Header, Focused media, Accessibility, Transform resets and Points of interest.
- General's Focused media exposed Hide site UI, Animate UI, the four left/right hide choices, movement/return timing and Link return speed. Their effects were not changed/tested in this pass.
- Constructor mode exposed General's Sticky notes interface. The observed draft was left intact; no note was placed, edited, exported or deleted.
- Constructor -> Docs showed static Document library introduction, then independent Document, Source and cover, and Paper format and placement groups.
- Docs' type menu included Presentation, Pdf, Image and Document. The editor exposed title/description/source/cover, paper dimensions/scale/Desk X/Z/rotation, Save document, Save to project and Export/Import metadata JSON. New content and full save round trips were not tested.
- About Page summary listed Fish, Skills, Refs, Clock, Oddio and Notes. Clicking Oddio focused that face and exposed its accessible launcher.
- About Settings contained General, Fish, Refs, Skill, Cube, Clock, Oddio and Notes tabs. Constructor -> Oddio exposed Cylinder assembly sizes, Tape timing threads and Side-panel placement.
- Oddio placement exposed the diagram and Add-on, Main panel, Side, Edge gap, Vertical center and drag snap-step controls. Keyboard focus moved to an existing field for screenshot positioning; no layout value was changed.
- Music loaded its scene and Settings -> Music exposed Center on viewport, Master gain, Piano highlights, Music screen, and Track icons. The current icon controls read Icon size, Horizontal distribution and Vertical distribution.
- Graphics loaded its shelf. Page summary listed Grades 1-6, both board games, The Great Race and Letter tiles. Choosing Grade 1 reached a reader with Back to spread, Grid, Close and Put away controls. Put away started the return animation. Skip animation was observed transiently, but its attempted click occurred after it disappeared; skipping was not certified.
- Games Page summary listed all five playable games plus Game Reel and Christmas. Their individual game/video launch paths were not exercised.
- Videos Page summary listed the six collections. Before the intro gate had been played, the full collection actions were disabled and corresponding visual-only preview actions were available. No sound permission was granted and neither path was played in this pass.
- Start exposed four selected-work links, Proceed to site and Sound & visual controls. Opening the native disclosure revealed audio/visual/power controls, Volume, Audio sync, Brightness, Contrast and Start audio sync comparison. Values were inspected without being changed.

## Screenshot files

- `screenshots/general-settings.jpg`: ordinary General panel in context.
- `screenshots/docs-constructor.jpg`: Docs authoring introduction and first groups.
- `screenshots/oddio-constructor.jpg`: initial Oddio Constructor view.
- `screenshots/oddio-placement.jpg`: placement diagram/fields after focusing a lower field.
- `screenshots/music-settings.jpg`: current Music settings labels.
- `screenshots/games-summary.jpg`: five game shortcuts and the two video reels.
- `screenshots/start-native-controls.jpg`: accessible Start controls in context.

## Still required

- Verify the rest of the 36 recipes through real interaction, including all six face-specific authoring workflows.
- Content save/import/export/reload round trips using disposable files and drawings, with original user content protected.
- Music/other media listening, permission, seek/sustain and device tests; this inspection did not certify sound.
- Remaining page-summary destination actions and player focus/Back/Escape on Start, Videos, Graphics and Games; only the Graphics Grade 1 route and About Oddio focus were exercised here.
- Reduced motion, contrast propagation, keyboard-only operation and external-browser acceptance after actual implementation changes.
- Cross-file PDF actions are structurally validated against real destination files/pages; behavior in each desktop/browser PDF reader still depends on its support and security policy.

No commit, push, publication or desk continuation was performed.

## Additional face-settings inspection

A later pass opened the ordinary Fish, Refs, Skill, Clock and Notes tabs in a separate agent-created About tab. The route-check JSON and screenshots under `screenshots/about-*-settings.jpg` record the visible section headings. No preference values, private layouts, images, sessions or drawings were changed.

Fish showed Singing fish and Hover rings; Refs showed Portrait plates, Cabinet appearance, Sketch appearance, Iris door, Glass display, Cupboard doors and Butterfly. Skill showed Visibility, Body colors, Square card depth, Card arrangement and Card artwork. Clock showed Clock time, Gear motion and finish, Seconds groove and individual hand sections. Notes showed Drawing surface and Projector. These observations verify entry points, not the effect of every control or any content export/import round trip.

The next attempt to inspect the face Constructor tabs was blocked because local browser control had become disabled in Work settings. No Constructor checks were completed by that attempt and no data changed. They remain pending; source-based owner documentation is not presented as a live Constructor acceptance result.
