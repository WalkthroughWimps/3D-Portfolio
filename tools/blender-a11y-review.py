"""Inspect exported asset structure and compare Blender preview pixels.

Run in factory-startup Blender after blender-a11y-prepare.py. This reads the
active GLBs and prepared outputs, and writes only the candidate review JSON.
It does not assert a browser/accessibility pass or replace active assets.
"""
import hashlib
import importlib.util
import json
import struct
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "glb-accessibility-blender"
spec = importlib.util.spec_from_file_location("blender_a11y_prepare", ROOT / "tools" / "blender-a11y-prepare.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def asset_data(path):
    data = path.read_bytes()
    offset, document, binary = 12, None, b""
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset:offset+length]
        if kind == 0x4E4F534A:
            document = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += length
    triangles = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh["primitives"]:
            if primitive.get("mode", 4) != 4:
                raise ValueError("Non-triangle primitive requires separate review")
            accessor = document["accessors"][primitive.get("indices", primitive["attributes"]["POSITION"])]
            triangles += accessor["count"] // 3
    images = []
    for image in document.get("images", []):
        if "bufferView" in image:
            view = document["bufferViews"][image["bufferView"]]
            offset = view.get("byteOffset", 0)
            payload = binary[offset:offset+view["byteLength"]]
            images.append(hashlib.sha256(payload).hexdigest())
    return {"triangles": triangles, "nodes": len(document.get("nodes",[])),
            "images": images, "animations": {a.get("name",str(i)): len(a["channels"])
                           for i,a in enumerate(document.get("animations",[]))}}


def pixels(path):
    image = bpy.data.images.load(str(path), check_existing=False)
    result = np.asarray(image.pixels[:], dtype=np.float32).reshape((-1,4))[:,:3].copy()
    bpy.data.images.remove(image)
    return result


reviews = []
for path in sorted(OUT.glob("*-report.json")):
    report = json.loads(path.read_text(encoding="utf-8"))
    route = report["route"].lower()
    source, candidate = asset_data(Path(report["source"])), asset_data(Path(report["candidate"]))
    reference = pixels(OUT / "previews" / (route + "-source.png"))
    default = pixels(OUT / "previews" / (route + "-default.png"))
    differences = {}
    for profile in ("highlights", "bright"):
        changed = pixels(OUT / "previews" / (route + "-" + profile + ".png"))
        differences[profile] = {"meanAbsoluteRGBDifference": float(np.abs(changed-default).mean()),
                                "maxAbsoluteRGBDifference": float(np.abs(changed-default).max())}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=report["candidate"])
    scene = bpy.context.scene
    builder.preview_rig(scene, list(scene.objects))
    bpy.context.view_layer.update()
    roundtrip_path = OUT / "previews" / (route + "-roundtrip.png")
    scene.render.filepath = str(roundtrip_path)
    bpy.ops.render.render(write_still=True)
    roundtrip = pixels(roundtrip_path)
    reviews.append({"route": report["route"], "trianglesBefore": source["triangles"],
                    "trianglesAfter": candidate["triangles"],
                    "triangleCountPreserved": source["triangles"] == candidate["triangles"],
                    "nodeCountPreserved": source["nodes"] == candidate["nodes"],
                    "animationNamesAndChannelCountsPreserved": source["animations"] == candidate["animations"],
                    "sourceImagesByteIdenticalInExport": sum(h in candidate["images"] for h in source["images"]),
                    "sourceImageCount": len(source["images"]), "exportImageCount": len(candidate["images"]),
                    "sourceToDefaultMeanAbsoluteRGBDifference": float(np.abs(reference-default).mean()),
                    "sourceToDefaultMaxAbsoluteRGBDifference": float(np.abs(reference-default).max()),
                    "sourceToRoundtripMeanAbsoluteRGBDifference": float(np.abs(reference-roundtrip).mean()),
                    "sourceToRoundtripMaxAbsoluteRGBDifference": float(np.abs(reference-roundtrip).max()),
                    "defaultImageRGBVariance": float(default.var()), "profileDifferences": differences,
                    "sourceSHA256Unchanged": hashlib.sha256(Path(report["source"]).read_bytes()).hexdigest() == report["sourceSHA256"],
                    "replacementAccepted": False})
payload = {"blenderVersion": bpy.app.version_string, "routes": reviews,
           "limitations": ["Blender previews use a generic inspection rig, not each website scene.",
                           "Pixel differences do not establish WCAG contrast or a screen-reader pass.",
                           "Export warnings and runtime material replacement require browser review.",
                           "Executable Blender drivers and preview lights are not exported to GLB."]}
(OUT / "review.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
print(json.dumps(reviews, indent=2), flush=True)
