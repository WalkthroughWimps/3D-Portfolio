"""Export the evaluated Blender geometry needed for the cube faces and a spiral.

Open the start-cube-cones .blend file, run this in Blender's Text Editor, then
send the resulting start-cube-cones-geometry.json file back for inspection.
The script reads the scene and writes JSON; it never changes Blender objects.
"""

import json
from pathlib import Path

import bpy
from mathutils import Vector


REQUIRED = ("cube.main", "back.ref")
missing = [name for name in REQUIRED if bpy.data.objects.get(name) is None]
if missing:
    raise RuntimeError("Missing required object(s): " + ", ".join(missing))


def vec(value):
    return [float(value[0]), float(value[1]), float(value[2])]


def mat(value):
    return [[float(cell) for cell in row] for row in value]


depsgraph = bpy.context.evaluated_depsgraph_get()
scene = bpy.context.scene
objects = []

for obj in sorted(scene.objects, key=lambda item: item.name):
    record = {
        "name": obj.name,
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "collections": sorted(collection.name for collection in obj.users_collection),
        "matrix_world": mat(obj.matrix_world),
        "location_world": vec(obj.matrix_world.translation),
        "dimensions": vec(obj.dimensions),
        "hide_viewport": bool(obj.hide_viewport),
        "hide_render": bool(obj.hide_render),
        "modifiers": [
            {
                "name": modifier.name,
                "type": modifier.type,
                "show_viewport": bool(modifier.show_viewport),
                "show_render": bool(modifier.show_render),
                **(
                    {"levels": int(modifier.levels), "subdivision_type": modifier.subdivision_type}
                    if modifier.type == "SUBSURF"
                    else {}
                ),
                **(
                    {"segments": int(modifier.segments), "width": float(modifier.width)}
                    if modifier.type == "BEVEL"
                    else {}
                ),
            }
            for modifier in obj.modifiers
        ],
    }

    # Export the two actual surfaces in full. The evaluated mesh includes
    # Boolean, bevel and subdivision modifiers visible in the viewport.
    if obj.name in REQUIRED:
        if obj.type != "MESH":
            raise RuntimeError(f"{obj.name} must be a mesh, found {obj.type}")
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
        try:
            mesh.calc_loop_triangles()
            world = evaluated.matrix_world
            normal_matrix = world.to_3x3().inverted_safe().transposed()
            record["mesh"] = {
                "vertex_count": len(mesh.vertices),
                "triangle_count": len(mesh.loop_triangles),
                "vertices_world": [vec(world @ vertex.co) for vertex in mesh.vertices],
                "vertex_normals_world": [
                    vec((normal_matrix @ vertex.normal).normalized())
                    for vertex in mesh.vertices
                ],
                "triangles": [list(triangle.vertices) for triangle in mesh.loop_triangles],
                "polygons": [list(polygon.vertices) for polygon in mesh.polygons],
                "bounds_world": [
                    vec(world @ Vector(corner)) for corner in obj.bound_box
                ],
            }
        finally:
            evaluated.to_mesh_clear()
    objects.append(record)

blend_path = Path(bpy.data.filepath) if bpy.data.filepath else None
output_dir = blend_path.parent if blend_path else Path(bpy.app.tempdir)
output_path = output_dir / "start-cube-cones-geometry.json"
payload = {
    "schema_version": 1,
    "blend_file": str(blend_path) if blend_path else None,
    "scene": scene.name,
    "blender_version": bpy.app.version_string,
    "unit_scale": float(scene.unit_settings.scale_length),
    "required_objects": list(REQUIRED),
    "objects": objects,
}
output_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
print(f"Exported {len(objects)} objects to {output_path}")

