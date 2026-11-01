"""Import both generated GLBs in a fresh Blender file to catch glTF scene errors."""
import json
from pathlib import Path
import bpy

here = Path(__file__).resolve().parent
results = {}
for filename in ("oddio-panels-and-layout.glb", "oddio-component-library.glb"):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(here / filename))
    added = set(bpy.data.objects) - before
    mesh_count = sum(obj.type == "MESH" for obj in added)
    assert mesh_count >= (300 if "panels" in filename else 200), (filename, mesh_count)
    results[filename] = {"objects":len(added),"mesh_objects":mesh_count}
print("ODDIO_ROUNDTRIP=" + json.dumps(results))
