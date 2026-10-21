# Archived Notes scroll armatures

The October 2026 2D panel transition removed the moving Notes UI scrolls. These files are retained for a possible deliberate Blender redesign; none are imported by the current Notes runtime.

- `mechanical-scrolls.js` built the scroll screens, linkages, rods, spindles, frame and moving glass support. It imported `scroll-tablet-model.js` and consumed raster textures from `tablet-screen.js`.
- `scroll-tablet-model.js` defined the former rig dimensions, motion, inverse projection, and tablet viewport geometry.
- `tablet-screen.js` rasterized the live DOM editors into two canvas textures and translated screen pointer events back into editor events.
- `notes-scroll-tablets.test.mjs` is the retired mechanism test. Run directly with `node --test _1-about/notes/archive/scroll-armatures/notes-scroll-tablets.test.mjs` if restoring the mechanism.
- `notes.before-2d.css.txt` is the pre-transition Notes stylesheet, including projected-screen and raster styles.

The former entry point was `createNotesWorkspace` in `../notes-face.js`: it constructed `createMechanicalScrolls(group, carrier)`, passed the tablet screen textures to the mesh, projected the screen matrices after rendering, and advanced the scroll mechanism during `update`. The source of that host integration was an untracked file at transition time, so no exact pre-change host snapshot was available. Its removed calls and settings controls are described here rather than reconstructed from memory. The shared drawing editor, glass carrier, canvas artwork, rear layers, backing and projector remain in production. `about.notes.armSpeed`, `foldSpeed`, and `separateSpeeds` settings keys remain in storage for potential restoration but have no current controls or runtime effect.

The old handoff notes remain in `_1-about/notes/scroll-tablets-handoff.md`, `scroll-tablets-followup.md`, `scroll-rail-assemblies-handoff.md`, and `tablet-pixel-screens-handoff.md`; they are historical, not the current implementation. The `notes-glass-reference.blend` and rail concept assets were intentionally left in place. To restore the mechanical version, rebuild the host integration against the current `notes-face.js`, reintroduce the archived imports and projection/input bindings, and review the shared admin-panel interlock before enabling its screens.
