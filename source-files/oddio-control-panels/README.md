# Oddio control panels — Blender workshop

Open **`oddio-control-panels.blend`** in Blender 4.5 or newer. The default **Panel Workshop** scene contains two actual authored panel shells and their current control layout. The shells are separate mesh objects in **`01 CLEAN PANEL BASES - select these to model`**. Toggle **`02 CURRENT LAYOUT REFERENCE - hide for blank panels`** in the Outliner to work with the bare shells. The holes, vents, arm reliefs, and curved edges are mesh geometry, not a picture or modifier placeholder.

The parts of every control in the reference layout remain separate editable mesh objects. The **Component Gallery** scene displays the reusable control assemblies. In an Asset Browser set to **Current File**, search the marked collections for **Button**, **Knob**, **Display**, **Fader**, **Meter**, **Pod**, **Selector**, or **Mute**. Drag one onto a panel and move it to your desired location. Blender may place it as a collection instance; use **Object → Apply → Make Instances Real** to edit or separate its individual parts. You can also duplicate an existing control mesh from the reference layout with **Shift+D**. Blank button and long display variants omit their printed face art.

Use **Front View (Numpad 1)** for layout work. X points right, Z points up, and the front faces look toward negative Y. One Blender unit equals one meter. The conversion from the Three.js rig is `(x, y, z) → (x, -z, y)`; object positions and spacing are preserved. Each library component has an origin centered on its mounting plane, so it can be placed on a panel without retaining its source layout position. The clean upper shell is 0.800 × 0.630 × 0.032 m; the lower is 0.980 × 0.630 × 0.032 m, with a 0.380 m vertical gap.

Choose **Material Preview** or **Rendered** viewport shading to see the packed colors and labels; Solid shading shows only geometry.

`oddio-panels-and-layout.glb` is a geometry interchange export of both clean shells and the current layout with individual meshes. `oddio-component-library.glb` arranges component assemblies in a spaced gallery and keeps each assembly under a named parent. The GLBs use glTF's Y-up coordinates; Blender handles this on import. The `.blend` is the primary editing source and includes 76 packed authored textures. The PNGs provide quick front-view checks.

## Rebuild from the procedural source

The included `authored-geometry.json.gz` captures the exact generated mesh positions, triangle indices, normals, UVs, material slots, and canvas art used for this build. To regenerate the Blender file from that snapshot, run:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' -b --factory-startup --python source-files/oddio-control-panels/build-blender.py
```

To refresh the snapshot after changes to `_1-about/faces/odd/cloth-rig.js`, install `three@0.159.0` and `@napi-rs/canvas` in this repository (or retain the existing local runtime fallback), then run:

```powershell
node --experimental-loader ./source-files/oddio-control-panels/three-loader.mjs ./source-files/oddio-control-panels/extract-authored-rig.mjs
```

The snapshot excludes the wool tape, reels, arms, spool hardware, structural frame, and needle mechanism. It includes only the two panel shells and their panel controls. The `.blend` is for designing the panel faces; changing it does not modify the live website.
