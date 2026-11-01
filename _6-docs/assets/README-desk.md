# Original Docs desk asset

`desk.glb` is exported from `assets/.blend/Puzzle Box Assets/.BL/Hexagon_Site_2.blend` using `tools/export-docs-desk.py` and Blender 4.5. The source file is opened read-only and is never saved. The export selects the `Desk` hierarchy: desktop, leather top, green desk lamp, and four uneven drawer cabinets with their original hardware. It does not include the separate `Old Office Desk` empty object, which contains clock children rather than this desk.

The model is normalized to 1.4 m wide, with its base at zero. In glTF and Three.js it is Y up. `desk-layout.json` gives the complete model bounds and measured leather tabletop rectangle for placing physical-size A4 papers (0.210 × 0.297 m). The lamp occupies part of that surface.

The original packed source images are available. The exporter makes temporary web copies and leaves the `.blend` untouched. Wood and leather color maps are capped at 1024 pixels per edge; normal, scalar and small hardware maps remain at 512. Normal maps use lossless PNG; color maps use JPEG. The GLB is self-contained; no runtime texture files are needed. The source file reports missing fonts and linked libraries for unrelated scene content during load. One empty curve in the desk hierarchy has no exportable primitives; the GLB retains all 23 mesh objects.

## Material detail and web budget

The source wood and leather use a Value node feeding Mapping Scale. Blender's glTF exporter omitted that linked constant, so the large authored UV coordinates repeated the textures about 100 or 200 times too often. Mip filtering then made the wood and leather look flat. The exporter now replaces that link with the same constant in memory: approximately 0.01 for wood and 0.005 for leather. The GLB retains these values through `KHR_texture_transform`; no source UVs, original images or Blender file are saved or rewritten.

The resulting asset is 3,425,156 bytes, compared with 1,946,596 bytes before this material correction. Geometry remains 23 meshes and 23,461 exported vertices; there is no new subdivision, physical displacement, baked lighting or custom runtime shader. It contains two 1024-square images and eight 512-square images. A simple uncompressed RGBA8 plus full mip-chain estimate for those unique images is about 21.3 MiB, excluding renderer copies, geometry and other page content; this is not a measured browser GPU allocation or frame-rate result.

`desk-layout.json` records the mapping constants, source hash and texture limits. Before/after GLB re-import renders confirm restored material detail. Actual browser/device appearance and performance still need acceptance.

## Drawer interaction

The four `Drawer_TL`, `Drawer_TR`, `Drawer_BL` and `Drawer_BR` nodes retain their separate hierarchy and hardware. The exporter adds `docsDrawerOffset` to each node's glTF extras. Its value is a parent-local translation along the original drawer axis; it corresponds to about 0.279 m of travel after desk normalization. Do not replace this with a world-space translation without converting through the parent transform.

`../desk-drawers.js` owns toggling and animation, integrated by `../docs-3d.js`. A clean left click on the nearest visible drawer/hardware toggles it; document hits and solid desk surfaces prevent clicking through to a drawer. Dragging, right/middle gestures, sticky-note input, open document dialogs and suspended/disposed state do not activate drawers. The native Desk drawers disclosure provides keyboard-accessible buttons and uses shared folding behavior.

Motion reverses from its current position and follows the existing render loop; there is no additional persistent animation loop. Site or OS Reduced motion makes the movement instant, including an animation already in progress. GLB re-import verified the offset and moving hierarchy; live clicking, note-placement isolation, keyboard and reduced-motion interaction remain browser acceptance steps. No production deployment occurred.
