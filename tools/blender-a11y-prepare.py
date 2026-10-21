"""Prepare reversible Blender accessibility candidates from active GLBs.

Run with Blender --background --factory-startup --python this-file -- [route].
Only writes output/glb-accessibility-blender; never overwrites active assets.
Drivers and preview lights live in .blend files. GLB exports contain the
evaluated default materials and explicit extras, not executable controls.
"""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "glb-accessibility-blender"
ASSETS = {
    "Start": "settings-controller.glb", "About": "tester-cube.glb",
    "Videos": "video-tablet.glb", "Graphics": "card-test.glb",
    "Games": "Arcade-Console.glb", "Music": "toy-piano.glb",
    "Docs": "about-cube.glb",
}


def glb_json(path):
    data = path.read_bytes()
    magic, version, size = struct.unpack_from("<III", data)
    if (magic, version, size) != (0x46546C67, 2, len(data)):
        raise ValueError("Invalid GLB header: " + str(path))
    offset = 12
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        if kind == 0x4E4F534A:
            return json.loads(data[offset:offset + length])
        offset += length
    raise ValueError("Missing GLB JSON")


def role_for(route, obj, material):
    name, mat = obj.name.lower(), material.name.lower()
    if route == "Start":
        if "screen" in name or "screen" in mat:
            return "content"
        if name.startswith("txt-"):
            return "label"
        if ("glow" in mat or name.startswith("btn-")) and "black matte" not in mat:
            return "indicator"
    elif route == "About":
        # The six plates have two slots: red raised arrow geometry and a
        # texture-backed surrounding face. Highlight the glyph, not its face.
        if mat == "red":
            return "direction-control"
        if mat.startswith("arrow"):
            return "content"
    elif route == "Videos":
        if mat == "screen":
            return "content"
        if mat == "material_teal":
            return "accent-review"
    elif route == "Graphics":
        return "focus-edge" if mat == "gc_cardedge" else "content"
    elif route == "Games":
        if name == "arcade_screen_surface":
            return "content"
        if name == "buttons" or name.startswith("buttons."):
            return "control-surface"
    elif route == "Music":
        if name.startswith("notetext_"):
            return "label"
        if mat in ("keys_white", "keys_black"):
            return "key-surface"
        if "screen" in name or "screen" in mat:
            return "content"
    elif route == "Docs":
        if name == "cube-paragraph":
            return "label"
        if name in ("face-leftbtn", "face-rightbtn"):
            return "direction-control"
        if mat == "card-side":
            return "focus-edge"
        if "card" in mat or name == "cube-face":
            return "content"
    return "body"


def driver(socket, controls, expression):
    curve = socket.driver_add("default_value")
    drv = curve.driver
    drv.type = "SCRIPTED"
    for short, prop in (("c", "contrast"), ("h", "high_contrast")):
        var = drv.variables.new()
        var.name, var.type = short, "SINGLE_PROP"
        var.targets[0].id = controls
        var.targets[0].data_path = '["' + prop + '"]'
    drv.expression = expression


def prepare_material(original, role, controls):
    material = original.copy()
    material.name = original.name + "__a11y_" + role
    material["a11yRole"] = role
    material["a11yContrastTarget"] = True
    material["a11ySourceMaterial"] = original.name
    material["a11yContractVersion"] = 1
    principled = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if principled is None:
        raise RuntimeError("No Principled material: " + original.name)
    color = principled.inputs["Emission Color"]
    strength = principled.inputs["Emission Strength"]
    # Blender imports non-emissive glTF materials with white emission color
    # and zero strength. Color alone is not evidence of authored emission.
    had_emission = float(strength.default_value) > 0 and (color.is_linked or max(color.default_value[:3]) > 0)
    baseline = float(strength.default_value) if had_emission else 0.0
    if not had_emission:
        base = principled.inputs["Base Color"]
        if base.is_linked:
            material.node_tree.links.new(base.links[0].from_socket, color)
        elif max(base.default_value[:3]) > 0.04:
            color.default_value = base.default_value
        else:
            # Review tint; does not alter the baseline because strength is 0.
            color.default_value = (0.06, 0.28, 0.65, 1.0)
    gain = 0.8 if role in ("label", "direction-control", "focus-edge") else 0.45
    material["a11yBaseEmissionStrength"] = baseline
    material["a11yHighlightGain"] = gain
    material["a11yHighlightColor"] = list(color.default_value[:3])
    material["a11yEmissionUsesBaseTexture"] = bool(color.is_linked)
    driver(strength, controls,
           f"{baseline!r}*(0.25+1.5*c)+{gain!r}*(max(0,2*c-1)+0.75*h)")
    return material


def world_bounds(objects):
    points = [o.matrix_world @ Vector(corner) for o in objects
              if o.type == "MESH" for corner in o.bound_box]
    low = Vector([min(p[i] for p in points) for i in range(3)])
    high = Vector([max(p[i] for p in points) for i in range(3)])
    return low, high


def gltf_bounds(document):
    points = []
    def visit(index, parent):
        node = document["nodes"][index]
        if "matrix" in node:
            transform = Matrix([node["matrix"][i::4] for i in range(4)])
        else:
            q = node.get("rotation", [0, 0, 0, 1])
            transform = Matrix.LocRotScale(Vector(node.get("translation", [0, 0, 0])),
                         Quaternion((q[3], q[0], q[1], q[2])), Vector(node.get("scale", [1, 1, 1])))
        transform = parent @ transform
        if "mesh" in node:
            for primitive in document["meshes"][node["mesh"]]["primitives"]:
                position = document["accessors"][primitive["attributes"]["POSITION"]]
                lo, hi = position.get("min"), position.get("max")
                if lo is not None and hi is not None:
                    for x in (lo[0], hi[0]):
                        for y in (lo[1], hi[1]):
                            for z in (lo[2], hi[2]):
                                points.append(transform @ Vector((x, y, z)))
        for child in node.get("children", []):
            visit(child, transform)
    for root in document["scenes"][document.get("scene", 0)]["nodes"]:
        visit(root, Matrix.Identity(4))
    return [[min(p[i] for p in points) for i in range(3)],
            [max(p[i] for p in points) for i in range(3)]]


def preview_rig(scene, objects):
    collection = bpy.data.collections.new("A11Y Preview Rig excluded from export")
    scene.collection.children.link(collection)
    controls = bpy.data.objects.new("A11Y_Preview_Controls", None)
    collection.objects.link(controls)
    for prop, value in (("brightness", 0.5), ("contrast", 0.5), ("high_contrast", False)):
        controls[prop] = value
        if prop != "high_contrast":
            controls.id_properties_ui(prop).update(min=0.0, max=1.0, description="Preview only; evaluated default exports to GLB")
    controls["instructions"] = "Object Properties > Custom Properties. Brightness affects preview lights. Contrast/high_contrast affect isolated highlight slots. GLB drivers are not exported."
    low, high = world_bounds(objects)
    center, span = (low + high) / 2, max(high - low)
    controls.location = center
    controls.empty_display_type, controls.empty_display_size = "PLAIN_AXES", span * 0.12
    for name, offset, energy in (("Key", (1, -1.8, 2), 80), ("Fill", (-1.8, -0.8, 1), 45), ("Rim", (0, 1.5, 1.6), 50)):
        data = bpy.data.lights.new("A11Y_Preview_" + name, "AREA")
        obj = bpy.data.objects.new(data.name, data)
        collection.objects.link(obj)
        obj.location = center + Vector(offset) * span
        obj.rotation_euler = (center - obj.location).to_track_quat("-Z", "Y").to_euler()
        data.shape, data.size = "DISK", span * 1.6
        drv = data.driver_add("energy").driver
        var = drv.variables.new()
        var.name, var.type = "b", "SINGLE_PROP"
        var.targets[0].id, var.targets[0].data_path = controls, '["brightness"]'
        drv.expression = f"{energy * span * span!r}*(0.1+1.8*b)"
    camera_data = bpy.data.cameras.new("A11Y_Preview_Camera")
    camera = bpy.data.objects.new(camera_data.name, camera_data)
    collection.objects.link(camera)
    camera.location = center + Vector((1.2, -2.6, 1.6)) * span
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    view_rotation = camera.rotation_euler.to_matrix().transposed()
    projected = [view_rotation @ (Vector((x,y,z)) - center)
                 for x in (low.x,high.x) for y in (low.y,high.y) for z in (low.z,high.z)]
    width = max(p.x for p in projected)-min(p.x for p in projected)
    height = max(p.y for p in projected)-min(p.y for p in projected)
    camera_data.type, camera_data.ortho_scale = "ORTHO", max(width,height*4/3)*1.12
    camera_data.clip_start, camera_data.clip_end = max(0.001,span*1e-5), max(1000,span*20)
    scene.camera = camera
    world = bpy.data.worlds.new("A11Y_Preview_World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.045, 0.065, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.3
    scene.world = world
    # EEVEE emission does not illuminate neighbours like Cycles path tracing;
    # it is closer to the website's non-GI emissive-material feedback.
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 480, 360
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    return controls


def build(route, filename):
    source = ROOT / "assets" / "glb" / filename
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    original = glb_json(source)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    # Pack embedded import buffers before EEVEE can release their CPU copy.
    # Their temporary image paths are not standalone files on disk.
    for image in bpy.data.images:
        if image.source == "FILE" and image.has_data:
            image.pack()
    scene = bpy.context.scene
    model_objects = list(scene.objects)
    before = {o.name: (len(o.data.vertices), len(o.data.polygons)) for o in model_objects if o.type == "MESH"}
    controls = preview_rig(scene, model_objects)
    bpy.context.view_layer.update()
    scene.render.filepath = str(OUT / "previews" / (route.lower() + "-source.png"))
    bpy.ops.render.render(write_still=True)
    prepared, targets, content = {}, [], []
    for obj in model_objects:
        obj["a11yContractVersion"] = 1
        obj["a11ySourceNode"] = obj.name
        if obj.type != "MESH":
            continue
        roles = []
        for slot in obj.material_slots:
            material = slot.material
            if material is None:
                continue
            role = role_for(route, obj, material)
            roles.append(role)
            if role == "content":
                content.append({"node": obj.name, "material": material.name})
            elif role != "body":
                key = (material.name, role)
                if key not in prepared:
                    prepared[key] = prepare_material(material, role, controls)
                slot.material = prepared[key]
                targets.append({"node": obj.name, "sourceMaterial": material.name,
                                "material": slot.material.name, "role": role})
        obj["a11yRoles"] = ",".join(sorted(set(roles)))
        if obj.name.startswith("noteText_"):
            obj["a11yLabel"] = "Note " + obj.name[len("noteText_"):]
        elif obj.name in ("face-leftbtn", "face-rightbtn"):
            obj["a11yLabel"] = "Turn " + ("left" if "left" in obj.name else "right")
    for image in bpy.data.images:
        if image.source == "FILE" and image.packed_file:
            image.reload()
    notes = bpy.data.texts.new("READ ME Accessibility candidate")
    notes.write("Imported from active GLB " + filename + ". Original authoring file not overwritten.\n"
                "Select A11Y_Preview_Controls and use Object Properties > Custom Properties.\n"
                "Default contrast 0.5 preserves imported emission. High contrast is an emission preview, not an accessibility pass.\n"
                "Preview lights/camera and executable drivers are NOT in exported GLB.\n"
                "GLB contains default evaluated materials and a11y target extras; website code must consume the contract.\n"
                "Content slots are excluded. Geometry, hierarchy, animation, and names require browser compatibility review before replacement.\n")
    bpy.ops.object.select_all(action="DESELECT")
    controls.select_set(True)
    bpy.context.view_layer.objects.active = controls
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.view_layer.update()
    blend = OUT / (route.lower() + "-accessibility.blend")
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in model_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next(o for o in model_objects if o.type == "MESH")
    candidate = OUT / "glb" / filename
    bpy.ops.export_scene.gltf(filepath=str(candidate), export_format="GLB", use_selection=True,
                             export_extras=True, export_lights=False, export_cameras=True,
                             export_original_specular=True, export_image_quality=100,
                             export_jpeg_quality=100, export_force_sampling=False,
                             export_draco_mesh_compression_enable=False)
    exported = glb_json(candidate)
    assert len(exported.get("images",[])) >= len(original.get("images",[])), "Export dropped source textures"
    after = {o.name: (len(o.data.vertices), len(o.data.polygons)) for o in model_objects if o.type == "MESH"}
    assert before == after, "Blender topology changed"
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash, "Source changed"
    original_names = {n.get("name") for n in original["nodes"] if n.get("name")}
    export_names = {n.get("name") for n in exported["nodes"] if n.get("name")}
    bounds_before, bounds_after = gltf_bounds(original), gltf_bounds(exported)
    bounds_error = max(abs(x-y) for a,b in zip(bounds_before,bounds_after) for x,y in zip(a,b))
    report = {"route": route, "source": str(source), "sourceSHA256": source_hash,
              "blend": str(blend), "candidate": str(candidate), "blender": bpy.app.version_string,
              "highlightTargets": targets, "excludedContentSlots": content,
              "preparedMaterials": len(prepared), "meshTopologyPreservedInBlender": before == after,
              "sourceNodeNamesMissingFromExport": sorted(original_names-export_names),
              "extraExportNodeNames": sorted(export_names-original_names),
              "worldBoundsBefore": bounds_before, "worldBoundsAfter": bounds_after,
              "worldBoundsMaxError": bounds_error,
              "sourceImages": len(original.get("images",[])), "exportImages": len(exported.get("images",[])),
              "sourceAnimations": len(original.get("animations",[])), "exportAnimations": len(exported.get("animations",[])),
              "exportedTargetMaterials": sum(bool(m.get("extras",{}).get("a11yContrastTarget")) for m in exported.get("materials",[])),
              "previewRigExported": any(n.startswith("A11Y_Preview_") for n in export_names),
              "activeAssetReplaced": False, "browserAccepted": False}
    assert report["exportedTargetMaterials"] == len(prepared), "Target metadata lost"
    assert not report["previewRigExported"], "Preview rig leaked into GLB"
    report["previewStates"] = {}
    for profile, values in (("default", (0.5,0.5,False)), ("highlights", (0.5,1.0,True)), ("bright", (1.0,0.5,False))):
        controls["brightness"], controls["contrast"], controls["high_contrast"] = values
        controls.update_tag()
        for material in prepared.values():
            material.node_tree.update_tag()
            material.update_tag()
        scene.frame_set(scene.frame_current)
        bpy.context.view_layer.update()
        report["previewStates"][profile] = {
            "controls": list(values),
            "emissionStrengths": {m.name: next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Emission Strength"].default_value for m in prepared.values()},
            "lightEnergy": {light.name: light.energy for light in bpy.data.lights if light.name.startswith("A11Y_Preview_")},
        }
        scene.render.filepath = str(OUT / "previews" / (route.lower() + "-" + profile + ".png"))
        bpy.ops.render.render(write_still=True)
    default = report["previewStates"]["default"]
    highlights = report["previewStates"]["highlights"]
    bright = report["previewStates"]["bright"]
    assert all(highlights["emissionStrengths"][name] > value for name,value in default["emissionStrengths"].items()), "Contrast driver did not update"
    assert all(bright["lightEnergy"][name] > value for name,value in default["lightEnergy"].items()), "Brightness driver did not update"
    (OUT / (route.lower() + "-report.json")).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("A11Y_COMPLETE", route, "materials", len(prepared), "bounds_error", bounds_error, flush=True)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "glb").mkdir(exist_ok=True)
    (OUT / "previews").mkdir(exist_ok=True)
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for route, filename in ASSETS.items():
        if not args or route.lower() in [a.lower() for a in args]:
            build(route, filename)
