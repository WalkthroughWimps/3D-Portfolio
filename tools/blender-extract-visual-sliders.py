"""Extract Start's two visual slider assemblies into a small standalone GLB."""
import hashlib
import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/glb/settings-controller.glb"
OUT = ROOT / "output/glb-accessibility-blender/controls"
OUT.mkdir(parents=True, exist_ok=True)
source_bytes = SOURCE.read_bytes()
document = json.loads(source_bytes[20:20+struct.unpack_from("<I", source_bytes, 12)[0]])
worlds = {}
def visit(index, parent):
    node = document["nodes"][index]
    if "matrix" in node:
        local = Matrix([node["matrix"][i::4] for i in range(4)])
    else:
        q = node.get("rotation",[0,0,0,1])
        local = Matrix.LocRotScale(Vector(node.get("translation",[0,0,0])),
                   Quaternion((q[3],q[0],q[1],q[2])),Vector(node.get("scale",[1,1,1])))
    world = parent @ local
    worlds[node.get("name",str(index))] = world
    for child in node.get("children",[]):
        visit(child, world)
for node in document["scenes"][document.get("scene",0)]["nodes"]:
    visit(node, Matrix.Identity(4))
right = (worlds["arrow-sync-right"].translation-worlds["arrow-sync-left"].translation).normalized()
up = (worlds["arrow-vol-up"].translation-worlds["arrow-vol-down"].translation).normalized()
normal = right.cross(up).normalized()
up = normal.cross(right).normalized()
frame = Matrix(((*right,0),(*up,0),(*normal,0),(0,0,0,1)))
C = Matrix.Rotation(math.pi/2,4,"X")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
original_objects = list(bpy.context.scene.objects)
names = {
    "gasket-vol", "gasket-sync", "knob-vol", "knob-sync",
    "arrow-vol-up", "arrow-vol-up-plus", "arrow-vol-down", "arrow-vol-down-minus",
    "arrow-sync-left", "arrow-sync-left-minus", "arrow-sync-right", "arrow-sync-right-plus",
    "txt-brightness", "txt-contrast", "percent-vol", "percent-sync",
}
copies = []
for name in sorted(names):
    original = bpy.data.objects.get(name)
    if original is None or original.type != "MESH":
        raise RuntimeError("Missing slider part: "+name)
    obj = original.copy()
    obj.data = original.data.copy()
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = None
    obj.animation_data_clear()
    obj.matrix_world = C @ frame @ C.inverted() @ original.matrix_world
    obj["sourcePart"] = name
    obj["control"] = "brightness" if ("vol" in name or "brightness" in name) else "contrast"
    obj["part"] = "knob" if name.startswith("knob") else "rail" if name.startswith("gasket") else "display" if name.startswith("percent") else "label" if name.startswith("txt") else "arrow"
    copies.append(obj)
for obj in original_objects:
    bpy.data.objects.remove(obj, do_unlink=True)
for obj in copies:
    obj.name = obj["sourcePart"]
bpy.context.view_layer.update()
def bounds(obj):
    corners = [C.inverted() @ (obj.matrix_world @ Vector(p)) for p in obj.bound_box]
    return {"min":[min(p[i] for p in corners) for i in range(3)],
            "max":[max(p[i] for p in corners) for i in range(3)]}
all_corners = [C.inverted() @ (obj.matrix_world @ Vector(p)) for obj in copies for p in obj.bound_box]
center = Vector([(min(p[i] for p in all_corners)+max(p[i] for p in all_corners))/2 for i in range(3)])
for obj in copies:
    obj.location -= C.to_3x3() @ center
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        shader = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"),None)
        if shader:
            color, strength = shader.inputs["Emission Color"], shader.inputs["Emission Strength"]
            # Keep parts visible independently of the reviewed scene setting.
            if obj["part"] in ("label","arrow") and strength.default_value == 0:
                color.default_value = (0.05,0.32,0.85,1)
                strength.default_value = 0.8
for image in bpy.data.images:
    if image.source == "FILE" and image.has_data:
        image.pack()
# Remove the deleted controller's orphan meshes, actions, materials and images
# from the editable file too, not just from the selected GLB export.
bpy.data.orphans_purge(do_recursive=True)
bpy.context.view_layer.update()
calibration = {}
for control, suffix, axis in (("brightness","vol",1),("contrast","sync",0)):
    knob = bpy.data.objects["knob-"+suffix]
    rail = bounds(bpy.data.objects["gasket-"+suffix])
    cap = bounds(knob)
    radius = (cap["max"][axis]-cap["min"][axis])/2
    calibration[control] = {"knob":knob.name,"rail":"gasket-"+suffix,"axis":"y" if axis==1 else "x",
           "min":rail["min"][axis]+radius,"max":rail["max"][axis]-radius,
           "railBounds":rail,"knobBounds":cap,"displayBounds":bounds(bpy.data.objects["percent-"+suffix])}
notes = bpy.data.texts.new("READ ME Extracted sliders")
notes.write("Only the Start brightness/contrast rails, knobs, arrows, labels and value-display housings are included.\n"
            "Baked percentage glyphs are omitted; the browser draws live percentage displays.\n"
            "Exported XY layout: brightness vertical on the right, contrast horizontal along the bottom.\n"
            "See assembly.json for calibrated knob travel; no whole controller body or screen is exported.\n")
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/"visual-slider-assembly.blend"))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=str(OUT/"visual-slider-assembly.glb"),export_format="GLB",
                         use_selection=True,export_extras=True,export_animations=False,
                         export_cameras=False,export_lights=False,export_original_specular=True)
output_bytes = (OUT/"visual-slider-assembly.glb").read_bytes()
exported = json.loads(output_bytes[20:20+struct.unpack_from("<I",output_bytes,12)[0]])
assert len(exported.get("nodes",[])) == len(names)
assert {n["name"] for n in exported["nodes"]} == names
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == hashlib.sha256(source_bytes).hexdigest()
payload = {"source":str(SOURCE),"sourceBytes":len(source_bytes),"extractedBytes":len(output_bytes),
           "sourceSHA256":hashlib.sha256(source_bytes).hexdigest(),"parts":sorted(names),
           "images":len(exported.get("images",[])),"calibration":calibration,
           "sourceUnchanged":True,"containsControllerBody":False}
(OUT/"assembly.json").write_text(json.dumps(payload,indent=2),encoding="utf-8")
print(json.dumps(payload,indent=2),flush=True)
