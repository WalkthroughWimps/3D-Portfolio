# About cube models

`blend/` contains the four current native Blender sources: the cube panel assembly and the Clock v7, v8, and v9 mechanisms. `glb/` contains the four corresponding runtime models. The Clock v9 model is the default; `?clock=v8` and `?clock=v7` select the older active versions.

Older About-only models and review exports are under the literal `blend/Old .blend/` and `glb/Old .glb/` folders. Within each, the former repository-relative path is preserved to identify the original study or revision. `assets.json` records the exact source-to-destination mapping and SHA-256 hashes for every move. The former `output/panel-rig-v17/panel-rig-v17-review.glb` is archived there because its bytes matched the former runtime `assets/panel-assembly/model.glb`.

The archived About accessibility experiment came from `output/glb-accessibility-blender/`. Its candidate preview still serves the model and Blender download through exact URL aliases in `tools/glb-preview-server.mjs`.

The panel runtime metadata remains at `assets/panel-assembly/runtime.json`. Clock manifests remain with the Clock face module. Blender files retain their existing external texture and library targets after relocation; paths to already-missing temporary bakes remain unresolved. The models and surrounding assets outside the About page, including `assets/glb/about-cube.glb` used by Docs, were outside this migration.
