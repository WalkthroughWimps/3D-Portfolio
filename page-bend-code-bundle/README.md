# Page-bending code bundle

Copies of the Graphics page's current book-related source files, preserving their project-relative paths. The originals remain in `_3-graphics/shelf/`.

- `page-geometry.mjs`: builds and poses the page mesh vertices.
- `binding-model.mjs`: computes page, cover, and spine profiles and their connections.
- `source-book-rig.mjs` and `closed-shape.mjs`: construct and update the rendered book, including its closed proxy.
- `page-turn-input.mjs`, `page-controls.mjs`: page-turn state, interaction and picking controls.
- `book-layout.mjs`, `book-presentation.mjs`, `book-action-model.mjs`, `focus-contact-*`, `marker-player-model.mjs`: book arrangement, animation and selection context.
- `felt-material.mjs`: page and cover surface appearance.
- `graphics-preview.mjs`: the production scene integration and event wiring; it also contains unrelated shelf and game code.
- `presentation.test.mjs`, `integration.test.mjs`, and the shelf README: relevant checks and broader context.

This is a source reference bundle, not a standalone runnable application. It does not include Three.js, the rest of the site, book artwork, Blender source files, or animation data. The scene integration and tests reference additional files in the original project. To run the actual experience, use the project's Graphics page.
