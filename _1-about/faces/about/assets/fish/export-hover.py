"""Export the authored seven-ring blue hover assembly from Mix Color.blend.

Run Blender --factory-startup --background --disable-autoexec on
Hover_Rings_Mix_Color.blend. Evaluated SimpleDeform geometry is baked in memory.
The late Final_Attempt link is missing, so this is the last complete visible
authored ring stack available in the sibling source files.
"""

import bpy
import json
import math
import sys
from pathlib import Path

SOURCE = Path(bpy.data.filepath)
assert SOURCE.name == 'Hover_Rings_Mix_Color.blend', SOURCE
DEST = Path(__file__).parent
EVIDENCE = Path(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else None
SCALE = 1.7 / 238.25627136232048
NAMES = [f'Hover_Ring.{i}' for i in range(1, 8)]
BLUE = (0.00249314494, 0.201890618, 0.800196588)
OPACITY = {1: 1.0, 2: .8666667, 3: .6666667, 4: .4, 5: .2475, 6: 0.0, 7: .175}

scene = bpy.context.scene
scene.frame_set(1)
depsgraph = bpy.context.evaluated_depsgraph_get()
root = bpy.data.objects.new('HoverAssemblyRoot', None)
scene.collection.objects.link(root)


def make_material(index):
    material = bpy.data.materials.new(f'AuthoredHover_Blue_{index}')
    material.use_nodes = True
    alpha = OPACITY[index]
    material.diffuse_color = (*BLUE, alpha)
    material.surface_render_method = 'BLENDED'
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*BLUE, 1)
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Roughness'].default_value = .5
    bsdf.inputs['Alpha'].default_value = alpha
    bsdf.inputs['Emission Color'].default_value = (0.00012175, .00892485, 1.0, 1)
    bsdf.inputs['Emission Strength'].default_value = .55 if index == 1 else .75
    return material


def bounds(mesh):
    points = [(v.co.x, v.co.z, -v.co.y) for v in mesh.vertices]
    return {axis: [min(p[i] for p in points), max(p[i] for p in points)] for i, axis in enumerate(('x', 'y', 'z'))}


parts = {}
exports = []
for index, name in enumerate(NAMES, 1):
    source = bpy.data.objects[name]
    evaluated = source.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
    assert len(mesh.vertices) > 0, name
    mesh.name = f'AuthoredHoverMesh_{index}'
    mesh.transform(evaluated.matrix_world)
    for vertex in mesh.vertices:
        vertex.co *= SCALE
    mesh.materials.clear()
    mesh.materials.append(make_material(index))
    ring = bpy.data.objects.new(f'AuthoredHover_{index}', mesh)
    scene.collection.objects.link(ring)
    ring.parent = root
    exports.append(ring)
    parts[name] = {
        'node': ring.name,
        'original_material': source.data.materials[0].name,
        'opacity_at_source_frame_1': OPACITY[index],
        'vertices': len(mesh.vertices),
        'triangles': sum(max(0, len(p.vertices) - 2) for p in mesh.polygons),
        'runtime_bounds': bounds(mesh),
    }

bpy.ops.object.select_all(action='DESELECT')
for obj in (root, *exports):
    obj.select_set(True)
bpy.context.view_layer.objects.active = root
asset = DEST / 'hover-rings.glb'
bpy.ops.export_scene.gltf(filepath=str(asset), export_format='GLB', use_selection=True,
    export_animations=False, export_materials='EXPORT')

manifest = {
    'source': str(SOURCE.relative_to(DEST.parents[4])).replace('\\', '/'),
    'asset': asset.name,
    'root': root.name,
    'coordinate_contract': 'Runtime X=Blender X, Y=Blender Z, outward Z=negative Blender Y; same 238.256-source-diameter-to-1.7 scale as fish rig/mount.',
    'orientation': 'Authored source rings lie in Blender XY and export nearly horizontal in runtime XZ; tilt parent 90 degrees about runtime X to face the viewer at rest.',
    'parts': parts,
    'provenance_note': 'Seven visible ring meshes with evaluated SimpleDeform from the last complete sibling source. The local Hover_Ring.002 in Fishing Sing evaluates to zero vertices because its GeometryNodes modifier removes the mesh at frames 1,4,10,20,30,40. The later linked Final_Attempt.blend is absent; its blend1 backup also has that broken link. Shader noise/particle animation is not portable; simple blue/alpha PBR approximates the original blue materials while preserving authored geometry.',
    'bytes': asset.stat().st_size,
}
(DEST / 'hover-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')

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
    camera_data.ortho_scale = 2.15
    light_data = bpy.data.lights.new('EvidenceLight', 'AREA')
    light_data.energy = 550
    light_data.shape = 'DISK'
    light_data.size = 3
    light = bpy.data.objects.new('EvidenceLight', light_data)
    scene.collection.objects.link(light)
    light.location = (0, -2, 2)
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world.color = (.14, .14, .14)
    for label, location, rotation in (('top', (0, 0, 3), (0, 0, 0)),
        ('side', (0, -3, .2), (math.pi / 2, 0, 0))):
        camera.location = location
        camera.rotation_euler = rotation
        scene.render.filepath = str(EVIDENCE / ('hover-' + label + '.png'))
        bpy.ops.render.render(write_still=True)

print('HOVER_EXPORT_WRITTEN', asset)
