"""Build the editable Oddio panel workshop from authored-geometry.json.gz.

Run with Blender 4.5: blender -b --python build-blender.py
"""
import base64
import gzip
import json
import math
import os
import tempfile
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
DATA = json.loads(gzip.open(HERE / "authored-geometry.json.gz", "rt", encoding="utf8").read())
assert DATA["format"] == "oddio-authored-rig-v1"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
for collection in list(bpy.data.collections):
    if collection.name != bpy.context.scene.collection.name:
        bpy.data.collections.remove(collection)
scene = bpy.context.scene
scene.name = "Panel Workshop"
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0

def collection(name, parent=None, scene_to_link=None):
    c = bpy.data.collections.new(name)
    if parent:
        parent.children.link(c)
    elif scene_to_link:
        scene_to_link.collection.children.link(c)
    return c

bases = collection("01 CLEAN PANEL BASES - select these to model", scene_to_link=scene)
reference = collection("02 CURRENT LAYOUT REFERENCE - hide for blank panels", scene_to_link=scene)
ref_groups = {name: collection(name, reference) for name in [
    "A Plaques buttons and displays", "B Dials and volume fader", "C Clock and meters",
    "D Shaped four-key pods", "E Voice selectors and mute tabs", "F Other controls",
]}

# C rotates Three.js (x,y,z) to Blender front-view (x,-z,y), preserving handedness.
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
CI = C.inverted()

def linear_hex(color):
    values = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values)

images = {}
with tempfile.TemporaryDirectory(prefix="oddio-images-") as image_dir:
    for key, item in DATA["images"].items():
        path = Path(image_dir) / f"{key}.png"
        path.write_bytes(base64.b64decode(item["png"]))
        image = bpy.data.images.load(str(path), check_existing=False)
        image.name = "Authored texture " + key[:8]
        image.pack()
        images[key] = image

    materials = {}
    for key, item in DATA["materials"].items():
        mat = bpy.data.materials.new("Authored " + item["name"] + " " + key[:6])
        mat.use_nodes = True
        mat.diffuse_color = (*linear_hex(item["color"]), item["opacity"])
        mat.metallic = item["metalness"]
        mat.roughness = item["roughness"]
        mat.use_backface_culling = item["side"] == 0
        if item["transparent"] and item["opacity"] < 1:
            mat.surface_render_method = "DITHERED"
        nodes = mat.node_tree.nodes
        shader = nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = mat.diffuse_color
        shader.inputs["Metallic"].default_value = item["metalness"]
        shader.inputs["Roughness"].default_value = item["roughness"]
        shader.inputs["Alpha"].default_value = item["opacity"]
        if item["map"]:
            tex = nodes.new("ShaderNodeTexImage")
            tex.image = images[item["map"]]
            tex.label = "Authored front art"
            mat.node_tree.links.new(tex.outputs["Color"], shader.inputs["Base Color"])
        if item["emissiveMap"]:
            tex = nodes.new("ShaderNodeTexImage")
            tex.image = images[item["emissiveMap"]]
            tex.label = "Authored glow art"
            mat.node_tree.links.new(tex.outputs["Color"], shader.inputs["Emission Color"])
            shader.inputs["Emission Strength"].default_value = item["emissiveIntensity"]
        elif item["emissiveIntensity"]:
            color = item["emissive"]
            shader.inputs["Emission Color"].default_value = (*linear_hex(color), 1)
            shader.inputs["Emission Strength"].default_value = item["emissiveIntensity"]
        materials[key] = mat

    geometries = {}
    for key, item in DATA["geometries"].items():
        pos = item["attributes"]["position"]["array"]
        vertices = [(pos[i], -pos[i+2], pos[i+1]) for i in range(0, len(pos), 3)]
        indices = item["index"] or list(range(len(vertices)))
        triangles = [tuple(indices[i:i+3]) for i in range(0, len(indices)-2, 3)]
        mesh = bpy.data.meshes.new("Authored geometry " + key[:8])
        mesh.from_pydata(vertices, [], triangles)
        mesh.update()
        normals = item["attributes"].get("normal")
        if normals and len(normals["array"]) == len(pos):
            raw = normals["array"]
            converted = [(raw[i], -raw[i+2], raw[i+1]) for i in range(0, len(raw), 3)]
            for polygon in mesh.polygons:
                polygon.use_smooth = True
            mesh.normals_split_custom_set_from_vertices(converted)
        groups = item["groups"]
        for group in groups:
            for poly_idx in range(group["start"]//3, min(len(mesh.polygons), (group["start"]+group["count"])//3)):
                mesh.polygons[poly_idx].material_index = group["materialIndex"]
        uv = item["attributes"].get("uv")
        if uv:
            values = uv["array"]
            layer = mesh.uv_layers.new(name="Authored UV")
            for loop in mesh.loops:
                idx = loop.vertex_index * 2
                if idx+1 < len(values):
                    layer.data[loop.index].uv = (values[idx], values[idx+1])
        geometries[key] = mesh

    records = []
    for entry in DATA["meshes"]:
        mesh = geometries[entry["geometry"]]
        obj = bpy.data.objects.new(entry["name"] or "Unnamed authored part", mesh)
        while len(mesh.materials) < len(entry["materials"]):
            mesh.materials.append(materials[entry["materials"][len(mesh.materials)]])
        for slot_index, mat_key in enumerate(entry["materials"]):
            obj.material_slots[slot_index].link = "OBJECT"
            obj.material_slots[slot_index].material = materials[mat_key]
        world = Matrix([entry["worldMatrix"][i:i+4] for i in range(0,16,4)]).transposed()
        obj.matrix_world = C @ world @ CI
        obj["source_root"] = entry["root"]
        obj["source_path"] = " / ".join(entry["path"])
        if entry["action"]:
            obj["oddio_action"] = entry["action"]
        if entry["kind"] == "upper_panel":
            obj.name = "UPPER CLEAN PANEL BASE - exact authored shell"
            bases.objects.link(obj)
        elif entry["kind"] == "lower_panel":
            obj.name = "LOWER CLEAN PANEL BASE - exact authored shell"
            bases.objects.link(obj)
        else:
            root = entry["root"]
            if root in ("Movable helical level meter", "Four track helical meter bank", "1970s alarm-clock time display"):
                section = "C Clock and meters"
            elif "pod" in root.lower():
                section = "D Shaped four-key pods"
            elif "selector" in root.lower() or "mute tab" in root.lower() or "voice " in root.lower():
                section = "E Voice selectors and mute tabs"
            elif "dial" in root.lower() or "volume" in root.lower() or root == "":
                section = "B Dials and volume fader"
            elif root in ("Central playback line", "Left destination connected selector rail", "Right mute connected selector rail"):
                section = "F Other controls"
            else:
                section = "A Plaques buttons and displays"
            ref_groups[section].objects.link(obj)
        records.append((entry, obj))

    # Reusable assets are copies with a mounting-plane origin at the component center.
    library = collection("COMPONENT LIBRARY - assets are available in Current File", scene_to_link=scene)
    scene.view_layers[0].layer_collection.children[library.name].exclude = True
    blank_face = bpy.data.materials.new("Editable blank control face")
    blank_face.diffuse_color = (.055, .11, .105, 1)
    blank_face.use_nodes = True
    blank_face.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = blank_face.diffuse_color

    def selected(root=None, names=None, path_contains=None):
        return [(e,o) for e,o in records if e["kind"] == "control"
                and (root is None or e["root"] == root)
                and (names is None or e["name"] in names)
                and (path_contains is None or path_contains in " / ".join(e["path"]))]

    def plaque_with_support(root_name):
        parts = selected(root=root_name)
        if not parts:
            return parts
        center = parts[0][1].matrix_world.translation
        candidates = selected(root="Panel-mounted plaque support")
        nearby = [(e,o) for e,o in candidates if (o.matrix_world.translation - center).length < .03
                  and abs(o.matrix_world.translation.x-center.x) < .001
                  and abs(o.matrix_world.translation.z-center.z) < .001]
        return parts + nearby[:1]

    asset_definitions = [
        ("Button - large rectangular", plaque_with_support("PLAY"), False),
        ("Button - large BLANK", plaque_with_support("PLAY"), True),
        ("Button - compact rectangular", plaque_with_support("LOOP"), False),
        ("Button - compact BLANK", plaque_with_support("LOOP"), True),
        ("Display - long text", plaque_with_support("FEED AUDIO OR PRINT A BELL"), False),
        ("Display - long BLANK", plaque_with_support("FEED AUDIO OR PRINT A BELL"), True),
        ("Display - numeric", plaque_with_support("48 LEFT"), False),
        ("Display - compact value", plaque_with_support("100%"), False),
        ("Seven-segment time counter", selected(root="1970s alarm-clock time display"), False),
        ("Helical main level meter", selected(root="Movable helical level meter"), False),
        ("Helical single track meter", selected(root="Four track helical meter bank", path_contains="Stationary track 1 meter cylinder"), False),
        ("Helical four-track meter bank", selected(root="Four track helical meter bank"), False),
        ("Four-key transport pod", selected(root="Four-key transport pod"), False),
        ("Four-key shuttle pod", selected(root="Four-key shuttle pod"), False),
        ("Angled pod key", selected(root="Four-key transport pod", names={"transport button 2", "Front icon 2"}), False),
        ("Rectangular pod key", selected(root="Four-key transport pod", names={"transport button 1", "Front icon 1"}), False),
        ("Voice selector tab", selected(root="Voice 1 hinged selector"), False),
        ("Mute tab", selected(root="Voice 1 mute tab"), False),
        ("Destination selector tab", selected(root="Move clip to voice 1"), False),
    ]
    volume_names = {"Page volume horizontal rail", "Panel-seated volume rail bed", "Page volume slider", "Volume fader center mark"}
    asset_definitions.append(("Horizontal volume fader", [(e,o) for e,o in records if e["root"] in volume_names], False))
    # The first enamel dial, its unlabelled collar, pointer and value plaque form a complete control.
    dial = selected(root="Enamel voice dial 1") + selected(root="Dial pointer")[:1] + plaque_with_support("GAIN")
    collar = [(e,o) for e,o in records if e["root"] == "" and e["name"] == "Unnamed mesh"]
    if collar: dial += collar[:1]
    asset_definitions.append(("Enamel knob with collar and pointer", dial, False))

    asset_report = []
    gallery = bpy.data.scenes.new("Component Gallery")
    gallery.unit_settings.system = "METRIC"
    gallery.unit_settings.scale_length = 1.0
    gallery_group = collection("Gallery instances - one of each asset", scene_to_link=gallery)
    mount_y = -(0.266 - 0.240)
    for asset_index, (name, parts, blank) in enumerate(asset_definitions):
        if not parts:
            raise RuntimeError("Empty component asset: " + name)
        ac = collection(name, library)
        ac.asset_mark()
        ac.asset_data.description = "Editable Oddio control assembly; source geometry from cloth-rig.js. Origin is centered on its panel mounting plane."
        # Use the first physical part's center, except wide assemblies use all-part bounds.
        bounds = []
        for _, original in parts:
            for corner in original.bound_box:
                bounds.append(original.matrix_world @ Vector(corner))
        pivot = Vector(((min(p.x for p in bounds)+max(p.x for p in bounds))/2,
                        mount_y,
                        (min(p.z for p in bounds)+max(p.z for p in bounds))/2))
        for entry, original in parts:
            duplicate = original.copy()
            duplicate.data = original.data.copy() if blank else original.data
            if blank and entry["name"] == entry["root"]:
                slot = 1 if len(duplicate.material_slots) > 1 else 0
                if duplicate.material_slots:
                    duplicate.material_slots[slot].link = "OBJECT"
                    duplicate.material_slots[slot].material = blank_face
            ac.objects.link(duplicate)
            duplicate.matrix_world = original.matrix_world.copy()
            duplicate.matrix_world.translation -= pivot
            duplicate["asset_component"] = name
        instance = bpy.data.objects.new(name + " [gallery]", None)
        instance.instance_type = "COLLECTION"
        instance.instance_collection = ac
        instance.location = (-1.1 + (asset_index % 4)*.75, 0, .8 - (asset_index//4)*.63)
        gallery_group.objects.link(instance)
        label_curve = bpy.data.curves.new(name + " label", type="FONT")
        label_curve.body = name
        label_curve.size = .031
        label_curve.align_x = "CENTER"
        label = bpy.data.objects.new(name + " label", label_curve)
        gallery_group.objects.link(label)
        label.location = (instance.location.x, -.12, instance.location.z-.24)
        label.rotation_euler.x = math.pi/2
        asset_report.append({"name": name, "parts": len(parts), "pivot": list(pivot)})

    def camera_for(target_scene, name, center, ortho):
        camera_data = bpy.data.cameras.new(name)
        camera = bpy.data.objects.new(name, camera_data)
        target_scene.collection.objects.link(camera)
        camera.location = (center[0], -3, center[1])
        direction = Vector((center[0], 0, center[1])) - camera.location
        camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        camera_data.type = "ORTHO"
        camera_data.ortho_scale = ortho
        target_scene.camera = camera
        return camera

    camera_for(scene, "Front view - panel layout", (0, 0), 2.05)
    camera_for(gallery, "Front view - components", (0, -.8), 4.15)
    for target_scene in (scene, gallery):
        target_scene.render.engine = "BLENDER_EEVEE_NEXT"
        target_scene.render.resolution_x = 1600
        target_scene.render.resolution_y = 1600
        target_scene.render.resolution_percentage = 100
        target_scene.render.image_settings.file_format = "PNG"
        if target_scene.world is None:
            target_scene.world = bpy.data.worlds.new(target_scene.name + " world")
        target_scene.world.color = (.14, .14, .14)
        target_scene.view_settings.view_transform = "Standard"
        target_scene.render.film_transparent = False
        light_data = bpy.data.lights.new("Softbox", type="AREA")
        light = bpy.data.objects.new("Softbox", light_data)
        target_scene.collection.objects.link(light)
        light.location = (0, -2, 2.2)
        light_data.energy = 280
        light_data.shape = "DISK"
        light_data.size = 4

    for area in bpy.context.screen.areas if bpy.context.screen else []:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_perspective = "ORTHO"
            area.spaces.active.region_3d.view_rotation = scene.camera.rotation_euler.to_quaternion()
            area.spaces.active.region_3d.view_distance = 2.4
            area.spaces.active.region_3d.view_location = (0, 0, 0)

    bpy.context.window.scene = scene
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "oddio-control-panels.blend"))

    scene.render.filepath = str(HERE / "panels-preview.png")
    bpy.ops.render.render(write_still=True, scene=scene.name)
    gallery.render.filepath = str(HERE / "components-preview.png")
    bpy.ops.render.render(write_still=True, scene=gallery.name)

    # GLBs carry clean panel meshes plus layout controls as distinct objects. Component library is also exported.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bases.all_objects:
        obj.select_set(True)
    for obj in reference.all_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next(iter(bases.all_objects))
    bpy.ops.export_scene.gltf(filepath=str(HERE / "oddio-panels-and-layout.glb"), export_format="GLB", use_selection=True, use_active_scene=True, export_yup=True)

    # Export a spaced gallery with one parent node per assembly, preserving distinct meshes.
    temp = collection("Temporary component export", scene_to_link=scene)
    bpy.ops.object.select_all(action="DESELECT")
    for asset_index, ac in enumerate(library.children):
        root = bpy.data.objects.new(ac.name, None)
        temp.objects.link(root)
        root.location = (-1.1 + (asset_index % 4)*.75, 0, .8 - (asset_index//4)*.63)
        root.select_set(True)
        for source in ac.objects:
            obj = source.copy()
            obj.data = source.data
            temp.objects.link(obj)
            obj.parent = root
            obj.matrix_parent_inverse.identity()
            obj.matrix_world = root.matrix_world @ source.matrix_world
            obj.select_set(True)
    bpy.context.view_layer.objects.active = next(iter(temp.objects))
    bpy.ops.export_scene.gltf(filepath=str(HERE / "oddio-component-library.glb"), export_format="GLB", use_selection=True, use_active_scene=True, export_yup=True, export_extras=True)
    for obj in list(temp.objects):
        temp.objects.unlink(obj)
        bpy.data.objects.remove(obj)
    scene.collection.children.unlink(temp)
    bpy.data.collections.remove(temp)

    # Save after export only if no temporary references remain.
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "oddio-control-panels.blend"))
    report = {
        "scene": scene.name, "source_meshes": len(DATA["meshes"]),
        "reference_meshes": len(reference.all_objects), "panel_meshes": len(bases.all_objects),
        "assets": asset_report, "packed_images": sum(bool(i.packed_file) for i in bpy.data.images),
        "blender": bpy.app.version_string,
    }
    (HERE / "build-report.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    print("ODDIO_BUILD_REPORT=" + json.dumps(report))
