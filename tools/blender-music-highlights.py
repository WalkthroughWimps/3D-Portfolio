"""Build the isolated Music highlight candidate from the active toy piano GLB.

Run: blender --background --factory-startup --python tools/blender-music-highlights.py
Only the Music candidate in output/glb-accessibility-blender is written.
"""
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from importlib import import_module
helper = import_module("blender-a11y-prepare")

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/glb/toy-piano.glb"
OUT = ROOT / "output/glb-accessibility-blender"
GROUPS = {
    "piano-trim": {"color": (0.50, 0.04, 0.025), "gain": 0.18},
    "side-stripes": {"color": (0.53, 0.05, 0.03), "gain": 0.19},
    "white-key-labels": {"color": (0.57, 0.045, 0.025), "gain": 0.28},
    "green-keys": {"color": (0.055, 0.49, 0.11), "gain": 0.20},
    "tablet-frame": {"color": (0.52, 0.045, 0.026), "gain": 0.20},
    "tablet-back": {"color": (0.45, 0.035, 0.02), "gain": 0.12},
    "tablet-holder": {"color": (0.48, 0.05, 0.028), "gain": 0.17},
    "pedals": {"color": (0.50, 0.34, 0.10), "gain": 0.13},
}
PREVIOUS_GROUPS = {
    "piano-trim": {"color": (0.82, 0.12, 0.09), "gain": 0.38},
    "side-stripes": {"color": (0.9, 0.18, 0.12), "gain": 0.4},
    "white-key-labels": {"color": (0.95, 0.27, 0.18), "gain": 0.55},
    "green-keys": {"color": (0.18, 0.82, 0.32), "gain": 0.4},
    "tablet-frame": {"color": (0.9, 0.17, 0.12), "gain": 0.42},
    "tablet-back": {"color": (0.88, 0.16, 0.12), "gain": 0.36},
    "tablet-holder": {"color": (0.86, 0.2, 0.14), "gain": 0.36},
    "pedals": {"color": (0.9, 0.66, 0.26), "gain": 0.25},
}


def contrast_factor(c):
    return 0.08 + 0.92 * c * c * (3 - 2 * c)


def target(obj, slot):
    n = obj.name
    if n in ("SK_backing", "SK_fronting", "SK_keysFronting", "SK_top") and slot == 1:
        return "piano-trim"
    if n == "SK_bottom" and slot == 0 or n == "SK_keyboard" and slot == 0 or n == "pedal_box" and slot == 0:
        return "piano-trim"
    if n in ("piano_leftLeg.003", "piano_leftLeg.013") and slot == 0 or n == "SK_keyboard" and slot == 2 or n == "SK_midrail" and slot == 0:
        return "piano-trim"
    if n in ("stripey_stripes.002", "stripey_stripes.010") and slot == 0:
        return "side-stripes"
    if n.startswith("noteSticker_") and "#" not in n and slot == 0:
        return "white-key-labels"
    if re.match(r"^\d{3}_[A-G]#\d$", n) and slot == 0:
        return "green-keys"
    if n == "pe'rPad_tablet" and slot == 0:
        return "tablet-frame"
    if n == "tablet_stand" and slot == 0:
        return "tablet-holder"
    if n in ("pedal_left", "pedal_right", "pedalRod_left", "pedalRod_right") and slot == 0:
        return "pedals"
    return None


def make_material(source, group, controls):
    spec = GROUPS[group]
    material = source.copy()
    material.name = source.name + "__a11y_" + group
    material["a11yContractVersion"] = 1
    material["a11yContrastTarget"] = True
    material["a11yHighlightGroup"] = group
    material["a11ySourceMaterial"] = source.name
    bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    strength = bsdf.inputs["Emission Strength"]
    color = bsdf.inputs["Emission Color"]
    baseline = float(strength.default_value)
    material["a11yBaseEmissionStrength"] = baseline
    material["a11yHighlightGain"] = spec["gain"]
    material["a11yHighlightColor"] = list(spec["color"])
    material["a11yHighlightCurve"] = "smoothstep"
    if color.is_linked:
        for link in list(color.links):
            material.node_tree.links.remove(link)
    color.default_value = (*spec["color"], 1)
    curve = strength.driver_add("default_value")
    drv = curve.driver
    drv.type = "SCRIPTED"
    for short, prop in (("c", "contrast"), ("t", "enable_" + group.replace("-", "_"))):
        var = drv.variables.new()
        var.name, var.type = short, "SINGLE_PROP"
        var.targets[0].id = controls
        var.targets[0].data_path = '["' + prop + '"]'
    drv.expression = f"{baseline!r}+{spec['gain']!r}*t*(0.08+0.92*c*c*(3-2*c))"
    return material


def image_hashes(glb_path, document):
    data = glb_path.read_bytes()
    chunk_start = 12
    chunks = {}
    while chunk_start < len(data):
        size = int.from_bytes(data[chunk_start:chunk_start+4], "little")
        kind = int.from_bytes(data[chunk_start+4:chunk_start+8], "little")
        chunks[kind] = data[chunk_start+8:chunk_start+8+size]
        chunk_start += 8 + size
    binary = chunks[0x004E4942]
    values = []
    for image in document.get("images", []):
        view = document["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        values.append(hashlib.sha256(binary[start:start+view["byteLength"]]).hexdigest())
    return sorted(values)


def screen_state(objects):
    result = {}
    for obj in objects:
        if obj.type != "MESH" or obj.name not in ("pe'rPad_screen", "SK_backboard_screen"):
            continue
        mesh = obj.data
        result[obj.name] = {
            "vertices": [tuple(v.co) for v in mesh.vertices],
            "polygons": [tuple(p.vertices) for p in mesh.polygons],
            "uv": [[tuple(loop.uv) for loop in layer.data] for layer in mesh.uv_layers],
            "materials": [slot.material.as_pointer() for slot in obj.material_slots],
        }
    return result


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "glb").mkdir(exist_ok=True)
    original_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    original = helper.glb_json(SOURCE)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    for image in bpy.data.images:
        if image.source == "FILE" and image.has_data:
            image.pack()
    scene = bpy.context.scene
    objects = list(scene.objects)
    screens_before = screen_state(objects)
    before = {o.name: (len(o.data.vertices), len(o.data.polygons), len(o.data.uv_layers)) for o in objects if o.type == "MESH"}
    controls = helper.preview_rig(scene, objects)
    controls["high_contrast"] = False
    for group in GROUPS:
        prop = "enable_" + group.replace("-", "_")
        controls[prop] = False
        controls.id_properties_ui(prop).update(description="Enable " + group + " independently")
    controls["instructions"] = "Enable individual groups here; contrast adjusts enabled highlight intensity. All groups OFF at export. Drivers remain in this blend only."
    prepared, assignments = {}, []
    for obj in objects:
        obj["a11yContractVersion"] = 1
        obj["a11ySourceNode"] = obj.name
        if obj.type != "MESH":
            continue
        for index, slot in enumerate(obj.material_slots):
            group = target(obj, index)
            if not group:
                continue
            source = slot.material
            if source is None:
                raise AssertionError((obj.name, index, "missing material"))
            key = (source.name, group)
            if key not in prepared:
                prepared[key] = make_material(source, group, controls)
            slot.material = prepared[key]
            assignments.append({"node": obj.name, "slot": index, "sourceMaterial": source.name, "highlightGroup": group})
        if obj.name.startswith("noteText_"):
            obj["a11yLabel"] = "Note " + obj.name[len("noteText_"):]
    # Split the tablet's back face into a dedicated material slot using the
    # imported Blender meshes. glTF axis conversion changes local axes.
    tablet = bpy.data.objects["pe'rPad_tablet"]
    counts = Counter(tuple(round(x, 3) for x in p.normal) for p in tablet.data.polygons)
    screen = bpy.data.objects["pe'rPad_screen"]
    tablet_center = sum((tablet.matrix_world @ v.co for v in tablet.data.vertices), Vector()) / len(tablet.data.vertices)
    screen_center = sum((screen.matrix_world @ v.co for v in screen.data.vertices), Vector()) / len(screen.data.vertices)
    front_direction = (screen_center - tablet_center).normalized()
    normal_matrix = tablet.matrix_world.to_3x3().inverted().transposed()
    back_faces = [p for p in tablet.data.polygons
                  if (normal_matrix @ p.normal).normalized().dot(front_direction) < -0.9]
    print("TABLET_FRONT_DIRECTION", tuple(round(x, 6) for x in front_direction),
          "back_faces", len(back_faces), "screen_delta", (screen_center-tablet_center).length, flush=True)
    if not back_faces:
        raise AssertionError("Tablet back normal rule selected no faces")
    back_mat = make_material(bpy.data.materials["irPurd_Frame"], "tablet-back", controls)
    tablet.data.materials.append(back_mat)
    back_slot = len(tablet.material_slots) - 1
    for p in back_faces:
        p.material_index = back_slot
    assignments.append({"node": tablet.name, "slot": back_slot, "sourceMaterial": "irPurd_Frame", "highlightGroup": "tablet-back", "faceCount": len(back_faces)})
    prepared[("irPurd_Frame", "tablet-back")] = back_mat
    assert screen_state(objects) == screens_before, "Screen mesh, UV, or PBR material changed"
    # Verify the saved/default state and that each independent toggle has a
    # visible effect even at the neutral contrast setting.
    preview_strengths = {}
    for group in GROUPS:
        prop = "enable_" + group.replace("-", "_")
        matches = [m for (_, g), m in prepared.items() if g == group]
        assert all(next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Emission Strength"].default_value == m["a11yBaseEmissionStrength"] for m in matches)
        controls[prop] = True
        controls.update_tag()
        for m in matches:
            m.node_tree.update_tag()
            m.update_tag()
        scene.frame_set(scene.frame_current)
        bpy.context.view_layer.update()
        measured = [next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Emission Strength"].default_value for m in matches]
        expected = [m["a11yBaseEmissionStrength"] + m["a11yHighlightGain"] * contrast_factor(0.5) for m in matches]
        assert all(abs(a-b) < 1e-6 for a,b in zip(measured, expected)), (group, measured, expected)
        preview_strengths[group] = measured
        controls[prop] = False
        controls.update_tag()
        for m in matches:
            m.node_tree.update_tag()
            m.update_tag()
        scene.frame_set(scene.frame_current)
        bpy.context.view_layer.update()
    assert all(not controls["enable_" + group.replace("-", "_")] for group in GROUPS)
    bpy.context.view_layer.update()
    notes = bpy.data.texts.new("READ ME Music highlight candidate")
    notes.write("Imported from active toy-piano.glb; source untouched. Select A11Y_Preview_Controls to toggle eight groups and set contrast. All toggles default OFF, preserving imported appearance. GLB exports default evaluated materials and extras, but not drivers. Website code must apply group toggles and contrast. Screens excluded. Tablet back faces opposite the screen-to-body world direction.\n")
    bpy.ops.object.select_all(action="DESELECT")
    controls.select_set(True)
    bpy.context.view_layer.objects.active = controls
    bpy.context.preferences.filepaths.save_version = 0
    blend = OUT / "music-accessibility.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = tablet
    candidate = OUT / "glb/toy-piano.glb"
    bpy.ops.export_scene.gltf(filepath=str(candidate), export_format="GLB", use_selection=True,
                              export_extras=True, export_lights=False, export_cameras=True,
                              export_original_specular=True, export_image_quality=100,
                              export_jpeg_quality=100, export_force_sampling=False,
                              export_draco_mesh_compression_enable=False)
    exported = helper.glb_json(candidate)
    after = {o.name: (len(o.data.vertices), len(o.data.polygons), len(o.data.uv_layers)) for o in objects if o.type == "MESH"}
    assert before == after
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == original_hash
    original_names = {n.get("name") for n in original["nodes"] if n.get("name")}
    export_names = {n.get("name") for n in exported["nodes"] if n.get("name")}
    bounds_before, bounds_after = helper.gltf_bounds(original), helper.gltf_bounds(exported)
    bounds_error = max(abs(x-y) for a,b in zip(bounds_before,bounds_after) for x,y in zip(a,b))
    counts_by_group = Counter(a["highlightGroup"] for a in assignments)
    report = {"route": "Music", "source": str(SOURCE), "sourceSHA256": original_hash,
              "blend": str(blend), "candidate": str(candidate), "blender": bpy.app.version_string,
              "highlightGroups": GROUPS, "previousHighlightGroups": PREVIOUS_GROUPS,
              "highlightCurve": "0.08 + 0.92 * contrast^2 * (3 - 2 * contrast)",
              "previousHighlightCurve": "0.2 + 0.8 * contrast",
              "highlightTargets": assignments,
              "targetSlotCounts": dict(counts_by_group), "preparedMaterials": len(prepared),
              "tabletBack": {"normalRule": "world normal dot normalized(screen world centroid - tablet world centroid) < -0.9",
                             "frontWorldDirection": list(front_direction),
                             "screenToBodyCenterDistance": (screen_center-tablet_center).length,
                             "faceCount": len(back_faces), "slot": back_slot,
                             "normalCounts": {str(k): v for k,v in counts.items()}},
              "screenMeshUVAndPBRUnchangedInBlender": screen_state(objects) == screens_before,
              "meshTopologyAndUVLayerCountsPreservedInBlender": before == after,
              "sourceNodeNamesMissingFromExport": sorted(original_names-export_names),
              "extraExportNodeNames": sorted(export_names-original_names),
              "worldBoundsBefore": bounds_before, "worldBoundsAfter": bounds_after,
              "worldBoundsMaxError": bounds_error,
              "sourceImages": len(original.get("images",[])), "exportImages": len(exported.get("images",[])),
              "sourceImageSHA256": image_hashes(SOURCE, original),
              "exportImageSHA256": image_hashes(candidate, exported),
              "sourceAnimations": len(original.get("animations",[])), "exportAnimations": len(exported.get("animations",[])),
              "exportedTargetMaterials": sum(bool(m.get("extras",{}).get("a11yContrastTarget")) for m in exported.get("materials",[])),
              "previewRigExported": any(n.startswith("A11Y_Preview_") for n in export_names),
              "defaultAllGroupsOff": True, "activeAssetReplaced": False, "browserAccepted": False}
    report["neutralContrastEnabledStrengths"] = preview_strengths
    assert all(counts_by_group.get(g, 0) > 0 for g in GROUPS)
    assert report["exportedTargetMaterials"] == len(prepared)
    assert not report["previewRigExported"]
    assert not report["sourceNodeNamesMissingFromExport"]
    assert report["sourceImages"] <= report["exportImages"]
    assert report["sourceImageSHA256"] == report["exportImageSHA256"], "Embedded image bytes changed"
    assert report["sourceAnimations"] == report["exportAnimations"]
    (OUT / "music-highlight-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("MUSIC_HIGHLIGHT_COMPLETE", dict(counts_by_group), "materials", len(prepared), "bounds_error", bounds_error, flush=True)


if __name__ == "__main__":
    main()
