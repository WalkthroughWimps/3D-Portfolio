"""Export the singing fish as an isolated, normalized browser asset.

Run Blender in background mode with --factory-startup and --disable-autoexec.
This script changes only the in-memory scene and writes files in this directory
plus optional validation renders under output/about-fish-mechanism/.
"""

import bpy
import json
import math
import sys
from pathlib import Path

SOURCE = Path(bpy.data.filepath)
DEST = Path(__file__).parent
EVIDENCE = Path(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else None
FISH_NAME = 'Fish.001'
ARMATURE_NAME = 'Armature'
SOURCE_TRIM_DIAMETER = 238.25627136232048
TARGET_TRIM_DIAMETER = 1.7
SCALE = TARGET_TRIM_DIAMETER / SOURCE_TRIM_DIAMETER

scene = bpy.context.scene
scene.frame_set(1)
fish = bpy.data.objects[FISH_NAME]
armature = bpy.data.objects[ARMATURE_NAME]
for obj in (fish, armature):
    if obj.name not in scene.collection.objects:
        scene.collection.objects.link(obj)
    obj.hide_viewport = False
    obj.hide_render = False
    obj.hide_set(False)

# Keep the skinned fish and the armature together, independent of the thick
# original wall and gold ring. The exporter converts Blender Z-up/Y-depth to
# glTF Y-up/Z-depth without an extra asset rotation.
armature_world = armature.matrix_world.copy()
armature.parent = None
armature.matrix_world = armature_world
armature.animation_data_clear()
armature.pose.bones['Head'].rotation_mode = 'QUATERNION'
armature.pose.bones['Head'].rotation_quaternion = (1, 0, 0, 0)
armature.pose.bones['Mouth'].rotation_mode = 'QUATERNION'
armature.pose.bones['Mouth'].rotation_quaternion = (1, 0, 0, 0)

root = bpy.data.objects.new('FishAssetRoot', None)
scene.collection.objects.link(root)
armature_world = armature.matrix_world.copy()
armature.parent = root
armature.matrix_world = armature_world
root.scale = (SCALE, SCALE, SCALE)

# Copy the fish's four 2K maps into the export scene, halve them to 1K, and
# pack them so the GLB needs no external texture requests. The source files
# and saved blend remain untouched.
material = fish.data.materials[0].copy()
material.name = 'Fish_PBR_1K'
fish.data.materials[0] = material
texture_info = []
for node in material.node_tree.nodes:
    if node.type != 'TEX_IMAGE' or not node.image:
        continue
    source_image = node.image
    image = source_image.copy()
    image.name = source_image.name + '_1K'
    if max(image.size) > 1024:
        image.scale(1024, 1024)
    image.pack()
    node.image = image
    texture_info.append({'source': source_image.name, 'export': image.name, 'size': list(image.size)})

bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in (root, armature, fish):
    obj.select_set(True)
bpy.context.view_layer.objects.active = armature

asset_path = DEST / 'fish-rig.glb'
bpy.ops.export_scene.gltf(
    filepath=str(asset_path),
    export_format='GLB',
    use_selection=True,
    export_animations=False,
    export_extras=False,
    export_materials='EXPORT',
    export_image_format='AUTO',
)

depsgraph = bpy.context.evaluated_depsgraph_get()
evaluated = fish.evaluated_get(depsgraph)
evaluated_mesh = evaluated.to_mesh()
points = [evaluated.matrix_world @ vertex.co for vertex in evaluated_mesh.vertices]
evaluated.to_mesh_clear()
runtime_points = [(p.x, p.z, -p.y) for p in points]
runtime_bounds = {
    axis: [min(p[index] for p in runtime_points), max(p[index] for p in runtime_points)]
    for index, axis in enumerate(('x', 'y', 'z'))
}

manifest = {
    'source': str(SOURCE.relative_to(DEST.parents[4])).replace('\\', '/'),
    'asset': asset_path.name,
    'source_trim_diameter': SOURCE_TRIM_DIAMETER,
    'target_trim_diameter': TARGET_TRIM_DIAMETER,
    'scale': SCALE,
    'excluded_source_mount': ['Fish_Wall', 'Fish_Gold_Trim', 'Board', 'Plaque'],
    'nodes': {'root': root.name, 'armature': armature.name, 'mesh': fish.name, 'head_bone': 'Head', 'mouth_bone': 'Mouth'},
    'axis_conversion': {'x': 'source X', 'y': 'source Z', 'z_out': 'negative source Y'},
    'neutral_runtime_bounds': runtime_bounds,
    'textures': texture_info,
    'mouth_control': 'Add local Z rotation 0..0.4 rad to exported neutral Mouth quaternion for downward jaw opening; Blender mouth_open driver is excluded.',
    'head_control': 'Add local X rotation roughly -0.25..+0.35 rad to exported neutral Head quaternion; positive swings outward (+runtime Z), negative swings inward. Confirm browser pose and clearance.',
    'bytes': asset_path.stat().st_size,
}
(DEST / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')

if EVIDENCE:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    for obj in bpy.data.objects:
        if obj.type not in {'CAMERA', 'LIGHT'} and obj not in (fish, armature, root):
            obj.hide_render = True
    camera_data = bpy.data.cameras.new('EvidenceCamera')
    camera = bpy.data.objects.new('EvidenceCamera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 1.9
    light_data = bpy.data.lights.new('EvidenceLight', 'AREA')
    light_data.energy = 600
    light_data.shape = 'DISK'
    light_data.size = 3.0
    light = bpy.data.objects.new('EvidenceLight', light_data)
    scene.collection.objects.link(light)
    light.location = (0, -2, 2.5)
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 600
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world.color = (0.15, 0.15, 0.15)
    for label, location, yaw in (
        ('front', (0, -3, 0), 0),
        ('back', (0, 3, 0), math.pi),
        ('side', (3, 0, 0), math.pi / 2),
    ):
        camera.location = location
        camera.rotation_euler = (math.pi / 2, 0, yaw)
        scene.render.filepath = str(EVIDENCE / ('fish-' + label + '.png'))
        bpy.ops.render.render(write_still=True)

print('FISH_EXPORT_WRITTEN', asset_path)
