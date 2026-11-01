"""Export the authored fish wall, trim, board, and plaque as a slim mount.

Run with Blender --factory-startup --background --disable-autoexec and the
original Fishing Sing.blend. All changes remain in memory; the source is never
saved. Optional first argument after -- is a disposable render directory.
"""

import bpy
import json
import math
import sys
import tempfile
from pathlib import Path

SOURCE = Path(bpy.data.filepath)
assert SOURCE.name == 'Fishing Sing.blend', SOURCE
DEST = Path(__file__).parent
EVIDENCE = Path(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else None
SCALE = 1.7 / 238.25627136232048
DEPTH_FACTORS = {'Fish_Wall': 0.30, 'Fish_Gold_Trim': 0.25, 'Board': 0.45, 'Plaque': 1.0}
ORDER = tuple(DEPTH_FACTORS)

scene = bpy.context.scene
scene.frame_set(1)
depsgraph = bpy.context.evaluated_depsgraph_get()
originals = {name: bpy.data.objects[name] for name in ORDER}
EXPORT_NAMES = {'Fish_Wall': 'Mount_Wall', 'Fish_Gold_Trim': 'Mount_GoldTrim',
    'Board': 'Mount_Board', 'Plaque': 'Mount_Plaque'}

root = bpy.data.objects.new('FishMountRoot', None)
scene.collection.objects.link(root)
image_cache = {}
material_cache = {}
staging = tempfile.TemporaryDirectory(prefix='fish-mount-textures-')


def copy_material(source):
    if not source:
        return None
    if source.name in material_cache:
        return material_cache[source.name]
    result = source.copy()
    result.name = 'FishMount_' + source.name.replace(' ', '_')
    if result.use_nodes:
        for node in result.node_tree.nodes:
            if node.type != 'TEX_IMAGE' or not node.image:
                continue
            original = node.image
            key = original.name
            if key not in image_cache:
                img = original.copy()
                img.name = 'FishMount_' + original.name
                # Packed source images can retain stale external paths. Force
                # pixels into memory and encode the resized copy as PNG.
                _ = img.pixels[0]
                limit = 1024 if any(word in original.name.lower() for word in ('base', 'color', 'wallpaper')) else 512
                if max(img.size) > limit:
                    ratio = limit / max(img.size)
                    img.scale(max(1, round(img.size[0] * ratio)), max(1, round(img.size[1] * ratio)))
                img.file_format = 'PNG'
                img.filepath_raw = str(Path(staging.name) / f'{len(image_cache):02d}.png')
                img.save()
                img.pack()
                image_cache[key] = img
            node.image = image_cache[key]
    material_cache[source.name] = result
    return result


def runtime_bounds(mesh):
    points = [(v.co.x, v.co.z, -v.co.y) for v in mesh.vertices]
    return {axis: [min(p[i] for p in points), max(p[i] for p in points)] for i, axis in enumerate(('x', 'y', 'z'))}


parts = {}
exports = []
for name in ORDER:
    source = originals[name]
    evaluated = source.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
    mesh.name = name + '_Slim'
    mesh.transform(evaluated.matrix_world)
    front_y = min(v.co.y for v in mesh.vertices)
    original_y = [front_y, max(v.co.y for v in mesh.vertices)]
    for vert in mesh.vertices:
        vert.co.y = front_y + (vert.co.y - front_y) * DEPTH_FACTORS[name]
        vert.co *= SCALE
    source_materials = list(mesh.materials)
    # Clearing slots resets every polygon's material_index to zero. Preserve
    # the source split: clouds face the fish; green Fish Tiles face the back.
    source_polygon_materials = [poly.material_index for poly in mesh.polygons]
    mesh.materials.clear()
    for source_material in source_materials:
        copied = copy_material(source_material)
        if copied:
            mesh.materials.append(copied)
    for poly, material_index in zip(mesh.polygons, source_polygon_materials):
        poly.material_index = material_index
    material_groups = []
    for material_index, material in enumerate(mesh.materials):
        polygons = [poly for poly in mesh.polygons if poly.material_index == material_index]
        material_groups.append({'material': material.name, 'polygons': len(polygons),
            'triangles': sum(max(0, len(poly.vertices)-2) for poly in polygons)})
    if name == 'Fish_Wall':
        assert [group['polygons'] for group in material_groups] == [576, 576], material_groups
    part = bpy.data.objects.new(EXPORT_NAMES[name], mesh)
    scene.collection.objects.link(part)
    part.parent = root
    exports.append(part)
    parts[name] = {
        'node': part.name,
        'role': 'part of the rigid fish mount; travels and flips with fish and hover rings',
        'source_y': original_y,
        'depth_factor': DEPTH_FACTORS[name],
        'runtime_bounds': runtime_bounds(mesh),
        'vertices': len(mesh.vertices),
        'triangles': sum(max(0, len(p.vertices) - 2) for p in mesh.polygons),
        'materials': [mat.name for mat in mesh.materials],
        'source_material_groups': material_groups,
    }

bpy.ops.object.select_all(action='DESELECT')
for obj in (root, *exports):
    obj.select_set(True)
bpy.context.view_layer.objects.active = root
asset = DEST / 'fish-mount.glb'
bpy.ops.export_scene.gltf(filepath=str(asset), export_format='GLB', use_selection=True,
    export_animations=False, export_materials='EXPORT', export_image_format='AUTO')
glb_data = asset.read_bytes()
glb_json_length = int.from_bytes(glb_data[12:16], 'little')
glb = json.loads(glb_data[20:20 + glb_json_length].decode('utf-8'))
wall_node = next(node for node in glb['nodes'] if node.get('name') == 'Mount_Wall')
wall_mesh = glb['meshes'][wall_node['mesh']]
wall_groups = [{'material': glb['materials'][primitive['material']]['name'],
    'triangles': glb['accessors'][primitive['indices']]['count'] // 3}
    for primitive in wall_mesh['primitives']]
assert [(group['material'], group['triangles']) for group in wall_groups] == [
    ('FishMount_Cloudy_Wallpaper', 1152),
    ('FishMount_Tiles_(Green,_Fish_Tiles)', 1152)], wall_groups

manifest = {
    'source': str(SOURCE.relative_to(DEST.parents[4])).replace('\\', '/'),
    'asset': asset.name,
    'root': root.name,
    'coordinate_contract': 'Same as fish-rig.glb: runtime X=Blender X, Y=Blender Z, outward Z=negative Blender Y; trim diameter 1.7.',
    'parts': parts,
    'exported_wall_material_groups': wall_groups,
    'source_image_copies': [{'name': img.name, 'size': list(img.size)} for img in image_cache.values()],
    'embedded_images': [img.get('name') for img in glb.get('images', [])],
    'note': 'Original authored front cloudy wallpaper and reverse green Fish Tiles surfaces, UVs, and packed maps retained. Depth-only compression removes unseen bulk. The four parts form one rigid mount that travels and flips with fish and hover rings.',
    'bytes': asset.stat().st_size,
}
(DEST / 'mount-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')

if EVIDENCE:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    for obj in bpy.data.objects:
        if obj.type not in {'CAMERA', 'LIGHT'} and obj not in (root, *exports):
            obj.hide_render = True
    camera_data = bpy.data.cameras.new('EvidenceCamera')
    camera = bpy.data.objects.new('EvidenceCamera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 2.0
    light_data = bpy.data.lights.new('EvidenceLight', 'AREA')
    light_data.energy = 650
    light_data.shape = 'DISK'
    light_data.size = 3
    light = bpy.data.objects.new('EvidenceLight', light_data)
    scene.collection.objects.link(light)
    light.location = (0, -2, 2)
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world.color = (.17, .17, .17)
    for label, location, yaw in (('front', (0, -3, 0), 0),
            ('reverse', (0, 3, 0), math.pi), ('side', (3, 0, 0), math.pi / 2)):
        camera.location = location
        camera.rotation_euler = (math.pi / 2, 0, yaw)
        light.location = (0, 2 if label == 'reverse' else -2, 2)
        scene.render.filepath = str(EVIDENCE / ('mount-' + label + '.png'))
        bpy.ops.render.render(write_still=True)

print('MOUNT_EXPORT_WRITTEN', asset)
staging.cleanup()
