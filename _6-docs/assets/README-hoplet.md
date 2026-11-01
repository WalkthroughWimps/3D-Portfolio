# Hoplet drawer prop

`hoplet.glb` is exported from `Hoplet.blend` in `assets/.blend/Puzzle Box Assets/.BL/Face_Games/` using Blender 4.5, without modifying the source file. The shell, logo surface, and evaluated button geometry are taken from frame 1, with no separate press-pose adjustment. The Docs scene loads the prop as a child of `Drawer_TR`, places its base on the tray floor by raycasting the drawer's own mesh, and scales it to stay within the tray's measured bounds with clearance. The parent relationship makes it travel with the drawer animation. Clicking the device opens `games/hoplet-prototype/index.html`.

The logo surface uses the original bake in `SimpleBake_Bakes/Sphere.002_Bake1_PBR_Diffuse.png` under `Face_Games`, together with its baked alpha mask. The scratches and other marks are preserved in the export.
