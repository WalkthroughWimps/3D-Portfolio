"""Export the original Hexagon Site Docs desk as a standalone, normalized GLB.

Run with Blender 4.5: blender --factory-startup --background --disable-autoexec
    --python tools/export-docs-desk.py
The source .blend is opened read-only and never saved.
"""
from pathlib import Path
import json
import hashlib
import tempfile
import bpy
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/.blend/Puzzle Box Assets/.BL/Hexagon_Site_2.blend'
OUT = ROOT / '_6-docs/assets'
OUT.mkdir(parents=True, exist_ok=True)
with SOURCE.open('rb') as stream:
    source_hash = hashlib.file_digest(stream, 'sha256').hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE), load_ui=False, use_scripts=False)

def descendants(obj):
    yield obj
    for child in obj.children:
        yield from descendants(child)

desk = bpy.data.objects['Desk']
owned = list(descendants(desk))
meshes = [o for o in owned if o.type in {'MESH', 'CURVE'}]
print('DOCS_DESK_OBJECTS', [(o.name, o.type) for o in owned])
front = Vector((.5, .8660254038, 0))
drawer_offsets = {}
for obj in owned:
    if obj.name not in {'Drawer_TL', 'Drawer_TR', 'Drawer_BL', 'Drawer_BR'}:
        continue
    corners = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
    depth = max(p.dot(front) for p in corners) - min(p.dot(front) for p in corners)
    delta = obj.parent.matrix_world.inverted().to_3x3() @ (front * depth * .55)
    # The authored parent-space axis is X, unchanged by glTF's Y-up conversion.
    obj['docsDrawerOffset'] = [round(delta.x, 6), 0.0, 0.0]
    drawer_offsets[obj.name] = list(obj['docsDrawerOffset'])
for o in owned:
    if o.type == 'MESH':
        pts = [o.matrix_world @ Vector(v) for v in o.bound_box]
        print('DOCS_DESK_BOUND', o.name, [round(min(p[i] for p in pts), 3) for i in range(3)], [round(max(p[i] for p in pts), 3) for i in range(3)])

for o in bpy.context.scene.objects:
    o.select_set(False)
for o in owned:
    o.hide_set(False)
    o.hide_viewport = False
    o.select_set(True)
bpy.context.view_layer.objects.active = desk

# Duplicate selected objects into an empty scene via GLTF's selection exporter;
# preserve source world transforms but scale physical width to 1.4 m. The original
# geometry is roughly 404 Blender units wide including drawers and lamp.
pts = [o.matrix_world @ Vector(v) for o in owned if o.type == 'MESH' for v in o.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)])
hi = Vector([max(p[i] for p in pts) for i in range(3)])
width = hi.x - lo.x
scale = 1.4 / width
print('DOCS_DESK_SOURCE_BOUNDS', list(lo), list(hi), 'SCALE', scale)

# GLTF exporter preserves transforms. Shift and scale the top-level Desk only;
# its descendants inherit the conversion. +Z remains up in glTF/Three.js.
world = desk.matrix_world.copy()
desk.parent = None
desk.matrix_world = world
for o in owned:
    if o is not desk and o.parent not in owned:
        o.parent = desk
bpy.context.view_layer.update()
desk.matrix_world = Matrix.Scale(scale, 4) @ Matrix.Translation(-lo) @ desk.matrix_world
bpy.context.view_layer.update()

# The source's authored materials use color and procedural nodes. GLB exports
# the supported PBR inputs; report image dependencies for review.
materials = sorted({m.name for o in owned if o.type == 'MESH' for m in o.data.materials if m})
images = []
for name in materials:
    mat = bpy.data.materials[name]
    if mat.use_nodes:
        for node in mat.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                image = node.image
                images.append({'material': name, 'image': image.name, 'filepath': image.filepath,
                               'packed': bool(image.packed_file), 'exists': bool(image.packed_file) or Path(bpy.path.abspath(image.filepath)).exists()})
print('DOCS_DESK_IMAGES', images)

# Blender's glTF exporter cannot resolve a Value node driving Mapping.Scale.
# Write that same constant into the socket in this temporary Blender process.
# This retains the original UV density instead of exporting a 100x/200x repeat.
mapping_scales = []
for name in materials:
    mat = bpy.data.materials[name]
    if not mat.use_nodes:
        continue
    for node in mat.node_tree.nodes:
        if node.type != 'MAPPING':
            continue
        socket = node.inputs['Scale']
        for link in list(socket.links):
            if link.from_node.type != 'VALUE':
                raise RuntimeError('Unsupported animated mapping scale in ' + name)
            value = float(link.from_socket.default_value)
            mat.node_tree.links.remove(link)
            socket.default_value = (value, value, value)
            mapping_scales.append({'material': name, 'scale': value})
print('DOCS_DESK_MAPPING_SCALES', mapping_scales)

# Downsample only copies inside this Blender process. The 241 MB source .blend
# and its packed images are not saved or changed on disk. Wood/leather color
# gets 1024px; normals, hardware and scalar maps stay at 512px. No tessellation.
scratch = tempfile.TemporaryDirectory(prefix='docs-desk-textures-')
derived = {}
processed_materials = set()
for o in owned:
    if o.type != 'MESH':
        continue
    for mat in o.data.materials:
        if not mat or not mat.use_nodes or mat.name in processed_materials:
            continue
        processed_materials.add(mat.name)
        for node in mat.node_tree.nodes:
            if node.type != 'TEX_IMAGE' or not node.image:
                continue
            original = node.image
            if original.name not in derived:
                copy = original.copy()
                width, height = copy.size
                detailed = original.name.startswith(('wood12b_diffuse', 'Green leather_BaseColor'))
                max_edge = 1024 if detailed else 512
                factor = min(1, max_edge / max(width, height))
                if factor < 1:
                    copy.scale(max(1, round(width * factor)), max(1, round(height * factor)))
                normal = 'normal' in original.name.lower()
                copy.file_format = 'PNG' if normal else 'JPEG'
                extension = 'png' if normal else 'jpg'
                copy.filepath_raw = str(Path(scratch.name) / f'texture-{len(derived):02d}.{extension}')
                copy.save()
                if copy.packed_file:
                    copy.unpack(method='REMOVE')
                    copy.filepath_raw = str(Path(scratch.name) / f'texture-{len(derived):02d}.{extension}')
                derived[original.name] = copy
            node.image = derived[original.name]
print('DOCS_DESK_DERIVED_TEXTURES', [(n, list(i.size)) for n, i in derived.items()])

target = OUT / 'desk.glb'
bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True,
    export_apply=True, export_yup=True, export_materials='EXPORT',
    export_image_format='AUTO', export_draco_mesh_compression_enable=False, export_extras=True)
scratch.cleanup()

layout = {
  'source': 'assets/.blend/Puzzle Box Assets/.BL/Hexagon_Site_2.blend',
  'sourceRootObject': 'Desk',
  'includedObjectNames': [o.name for o in owned],
  'units': 'metres (normalized from source geometry)',
  'scaleMetresPerSourceUnit': scale,
  'sourceBounds': {'min': list(lo), 'max': list(hi)},
  'modelBoundsYUp': {'min': [0, 0, round(-(hi.y-lo.y)*scale, 6)],
                      'max': [1.4, round((hi.z-lo.z)*scale, 6), 0]},
  'orientation': 'glTF and Three.js Y up; X is desk width; front of desktop faces negative Z',
  'tabletop': {
    'surfaceY': round((170.858-lo.z)*scale, 6),
    'usableRectangleXZ': {'minX': round((120.316-lo.x)*scale, 6),
                          'maxX': round((488.496-lo.x)*scale, 6),
                          'minZ': round(-(676.872-lo.y)*scale, 6),
                          'maxZ': round(-(374.407-lo.y)*scale, 6)},
    'sourceBasis': 'Desk_Leather mesh world bounds; top at source Z=170.858',
    'placementNote': 'Keep papers away from the lamp footprint (X 0.84-1.10, Z -0.37 to -0.14). A4 is 0.210 x 0.297 m at this scale.'
  },
  'materials': materials,
  'images': images,
  'sourceSha256': source_hash,
  'derivedTextureMaxEdgePixels': 1024,
  'scalarAndHardwareMaxEdgePixels': 512,
  'constantMappingScales': mapping_scales,
  'drawerOffsetsLocal': drawer_offsets,
}
(OUT/'desk-layout.json').write_text(json.dumps(layout, indent=2), encoding='utf-8')
print('DOCS_DESK_EXPORTED', target, target.stat().st_size)
with SOURCE.open('rb') as stream:
    if hashlib.file_digest(stream, 'sha256').hexdigest() != source_hash:
        raise RuntimeError('Original Blender source changed unexpectedly')
