"""Read-back acceptance check: blender -b oddio-control-panels.blend --python validate-artifacts.py"""
import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
bases = bpy.data.collections["01 CLEAN PANEL BASES - select these to model"]
reference = bpy.data.collections["02 CURRENT LAYOUT REFERENCE - hide for blank panels"]
library = bpy.data.collections["COMPONENT LIBRARY - assets are available in Current File"]
assert len(bases.all_objects) == 2, "Expected two separate panel shells"
assert len(reference.all_objects) == 353, "Reference mesh count changed"
assert len(library.children) >= 20, "Control asset library incomplete"
assert all(c.asset_data for c in library.children), "Unmarked control collection"

def bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    return low, high, [high[i]-low[i] for i in range(3)]

panel_report = {}
for obj in bases.all_objects:
    low, high, size = bounds(obj)
    key = "upper" if "UPPER" in obj.name else "lower"
    expected = (.8,.032,.63) if key == "upper" else (.98,.032,.63)
    assert all(abs(size[i]-expected[i]) < 1e-5 for i in range(3)), (key,size)
    assert all(math.isfinite(v) for vertex in obj.data.vertices for v in vertex.co)
    panel_report[key] = {"name":obj.name,"size_xyz":size,"min_xyz":low,"max_xyz":high,
                         "vertices":len(obj.data.vertices),"faces":len(obj.data.polygons)}
assert abs(panel_report["upper"]["min_xyz"][2]-panel_report["lower"]["max_xyz"][2]-.38) < 1e-5
packed = sum(bool(image.packed_file) for image in bpy.data.images)
assert packed == 76, packed

def glb(path):
    raw = path.read_bytes()
    magic, version, total = struct.unpack_from("<III", raw)
    assert magic == 0x46546C67 and version == 2 and total == len(raw)
    length, kind = struct.unpack_from("<II", raw, 12)
    assert kind == 0x4E4F534A
    data = json.loads(raw[20:20+length])
    return {"bytes":len(raw),"nodes":data.get("nodes",[]),"mesh_count":len(data.get("meshes",[]))}

main_glb = glb(HERE / "oddio-panels-and-layout.glb")
names = [node.get("name","") for node in main_glb["nodes"]]
assert any("UPPER CLEAN PANEL BASE" in name for name in names)
assert any("LOWER CLEAN PANEL BASE" in name for name in names)
assert main_glb["mesh_count"] >= 200, main_glb["mesh_count"]
assert sum("mesh" in node for node in main_glb["nodes"]) >= 300

library_glb = glb(HERE / "oddio-component-library.glb")
root_names = {c.name for c in library.children}
found_roots = [n for n in library_glb["nodes"] if n.get("name") in root_names and n.get("children")]
assert len(found_roots) == len(root_names), (len(found_roots),len(root_names))

report = {"panel_bounds":panel_report,"reference_meshes":len(reference.all_objects),
          "component_assets":len(library.children),"packed_images":packed,
          "main_glb":{"bytes":main_glb["bytes"],"nodes":len(main_glb["nodes"]),"meshes":main_glb["mesh_count"]},
          "component_glb":{"bytes":library_glb["bytes"],"nodes":len(library_glb["nodes"]),
                           "meshes":library_glb["mesh_count"],"named_assembly_roots":len(found_roots)}}
(HERE / "validation-report.json").write_text(json.dumps(report,indent=2),encoding="utf8")
print("ODDIO_VALIDATION="+json.dumps(report))
