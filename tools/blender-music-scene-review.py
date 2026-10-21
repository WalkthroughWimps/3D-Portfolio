"""Audit the local piano source; create disposable, reproducible review evidence.

Run with Blender --background --factory-startup --disable-autoexec --python
tools/blender-music-scene-review.py -- audit [blend-path].
This script never edits the source during an audit.
"""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/music-piano-scene-review'
SOURCE = ROOT / 'assets/.blend/toy-piano.blend'
ORIGINAL = ROOT / 'assets/.blend/toy-piano-original.blend'
EXTERNAL_SOURCE = Path(r'C:\Users\spami\OneDrive\Documents\Blender\Puzzle Box Assets\.BL\Face_Music\toy_piano_no_shape_keys5.blend')
PANELS = ('piano_leftLeg.003', 'stripey_stripes.002')


def dump(name, value):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(value, indent=2), encoding='utf-8')


def mesh_audit(obj):
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    coords = [v.co for v in bm.verts]
    lo = Vector(tuple(min(v[i] for v in coords) for i in range(3))) if coords else Vector()
    hi = Vector(tuple(max(v[i] for v in coords) for i in range(3))) if coords else Vector()
    diagonal = (hi-lo).length
    epsilon = max(diagonal * 1e-7, 1e-12)
    parent = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    world = [parent.matrix_world @ v.co for v in bm.verts]
    world_bounds = [[min(v[i] for v in world), max(v[i] for v in world)] for i in range(3)] if world else []
    components = []
    unseen = set(bm.verts)
    while unseen:
        todo = [unseen.pop()]
        size = 0
        while todo:
            v = todo.pop()
            size += 1
            for e in v.link_edges:
                other = e.other_vert(v)
                if other in unseen:
                    unseen.remove(other)
                    todo.append(other)
        components.append(size)
    face_histogram = Counter(len(f.verts) for f in bm.faces)
    result = {
        'name': obj.name, 'mesh': mesh.name, 'mesh_users': mesh.users,
        'vertices': len(bm.verts), 'edges': len(bm.edges), 'faces': len(bm.faces),
        'triangles': sum(max(0, len(f.verts)-2) for f in bm.faces),
        'face_sizes': dict(face_histogram),
        'boundary_edges': sum(e.is_boundary for e in bm.edges),
        'wire_edges': sum(e.is_wire for e in bm.edges),
        'overconnected_edges': sum(len(e.link_faces) > 2 for e in bm.edges),
        'inconsistent_winding_edges': sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
        'loose_vertices': sum(not v.link_edges for v in bm.verts),
        'near_zero_edges': sum(e.calc_length() < epsilon for e in bm.edges),
        'near_zero_faces': sum(f.calc_area() < epsilon**2 for f in bm.faces),
        'nonplanar_ngons': sum(len(f.verts)>4 and max(abs((v.co-f.verts[0].co).dot(f.normal)) for v in f.verts) > max(diagonal*1e-5, 1e-10) for f in bm.faces),
        'components': len(components), 'component_vertices': sorted(components, reverse=True),
        'signed_volume': bm.calc_volume(signed=True),
        'world_bounds': world_bounds,
        'world_dimensions': [b-a for a,b in world_bounds],
        'scale': list(obj.scale), 'world_scale': list(parent.matrix_world.to_scale()),
        'parent': obj.parent.name if obj.parent else None,
        'modifiers': [{'name': m.name, 'type': m.type, 'viewport': m.show_viewport, 'render': m.show_render} for m in obj.modifiers],
        'material_slots': [m.name if m else None for m in mesh.materials],
        'used_material_slots': sorted({p.material_index for p in mesh.polygons}),
        'uv_layers': [u.name for u in mesh.uv_layers],
        'custom_normals': mesh.has_custom_normals,
        'smooth_faces': sum(p.use_smooth for p in mesh.polygons),
        'animation': bool(obj.animation_data),
        'shape_keys': [k.name for k in mesh.shape_keys.key_blocks] if mesh.shape_keys else [],
    }
    bm.free()
    return result


def audit():
    bpy.context.view_layer.update()
    meshes = [mesh_audit(o) for o in bpy.data.objects if o.type == 'MESH']
    material_users = {}
    for o in bpy.data.objects:
        for slot in o.material_slots:
            if slot.material:
                material_users.setdefault(slot.material.name, []).append(o.name)
    images = []
    for im in bpy.data.images:
        linked_materials = []
        def nodes_use_image(tree, seen=None):
            seen = set() if seen is None else seen
            if not tree or tree.as_pointer() in seen:
                return False
            seen.add(tree.as_pointer())
            return any((n.type == 'TEX_IMAGE' and n.image == im) or (n.type == 'GROUP' and nodes_use_image(n.node_tree, seen)) for n in tree.nodes)
        for mat in bpy.data.materials:
            if nodes_use_image(mat.node_tree):
                linked_materials.append(mat.name)
        images.append({'name': im.name, 'packed': bool(im.packed_file), 'size': list(im.size),
                       'path': im.filepath, 'resolved_path': bpy.path.abspath(im.filepath),
                       'exists': Path(bpy.path.abspath(im.filepath)).is_file() if im.filepath else False,
                       'users': im.users, 'materials': linked_materials,
                       'objects': sorted({o for m in linked_materials for o in material_users.get(m, [])})})
    actions = []
    for a in bpy.data.actions:
        actions.append({'name':a.name, 'users':a.users, 'frame_range':list(a.frame_range)})
    return {'file':bpy.data.filepath, 'blender':bpy.app.version_string,
            'objects':len(bpy.data.objects), 'object_types':dict(Counter(o.type for o in bpy.data.objects)),
            'scene_frame':bpy.context.scene.frame_current, 'scene_range':[bpy.context.scene.frame_start,bpy.context.scene.frame_end],
            'unit_system':bpy.context.scene.unit_settings.system, 'unit_scale':bpy.context.scene.unit_settings.scale_length,
            'totals':{k:sum(m[k] for m in meshes) for k in ['vertices','edges','faces','triangles','boundary_edges','wire_edges','overconnected_edges','loose_vertices','near_zero_edges','near_zero_faces','nonplanar_ngons','inconsistent_winding_edges']},
            'meshes':meshes, 'images':images, 'actions':actions,
            'materials':[{'name':m.name,'users':m.users,'object_users':material_users.get(m.name,[])} for m in bpy.data.materials],
            'fonts':[{'name':f.name,'path':f.filepath,'packed':bool(f.packed_file)} for f in bpy.data.fonts],
            'shape_key_datablocks':len(bpy.data.shape_keys)}


def render_view(path, objects, direction=(1,-1,0.7), wire=False):
    scene = bpy.context.scene
    for o in bpy.data.objects:
        o.hide_render = o not in objects
    deps = bpy.context.evaluated_depsgraph_get()
    corners = [o.evaluated_get(deps).matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    low = Vector(tuple(min(c[i] for c in corners) for i in range(3)))
    high = Vector(tuple(max(c[i] for c in corners) for i in range(3)))
    center = (low+high)/2
    size = (high-low).length
    cam_data = bpy.data.cameras.new('Music review camera')
    camera = bpy.data.objects.new('Music review camera', cam_data)
    scene.collection.objects.link(camera)
    camera.location = center + Vector(direction).normalized() * size * 2
    camera.rotation_euler = (center-camera.location).to_track_quat('-Z','Y').to_euler()
    cam_data.type = 'ORTHO'
    projected = [camera.rotation_euler.to_quaternion().inverted() @ (v-center) for v in corners]
    width = max(v.x for v in projected)-min(v.x for v in projected)
    height = max(v.y for v in projected)-min(v.y for v in projected)
    cam_data.ortho_scale = max(width, height*1200/900) * 1.15
    cam_data.clip_start = max(size * 1e-5, 0.00001)
    cam_data.clip_end = size * 20
    scene.camera = camera
    if wire:
        for o in objects:
            curve = bpy.data.curves.new(o.name+' review edges', 'CURVE')
            curve.dimensions = '3D'
            curve.bevel_depth = size * 0.0006
            curve.bevel_resolution = 0
            ev = o.evaluated_get(deps)
            mesh = ev.to_mesh()
            for e in mesh.edges:
                spline = curve.splines.new('POLY')
                spline.points.add(1)
                for j, idx in enumerate(e.vertices):
                    v = ev.matrix_world @ mesh.vertices[idx].co
                    spline.points[j].co = (*v, 1)
            edges = bpy.data.objects.new(o.name+' review edges', curve)
            scene.collection.objects.link(edges)
            edges.color = (0.025,0.035,0.05,1)
            ev.to_mesh_clear()
            o.color = (0.63,0.72,0.82,1)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.studio_light = 'paint.sl'
    scene.display.shading.color_type = 'OBJECT' if wire else 'MATERIAL'
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = 'BOTH'
    scene.display.shading.background_type = 'WORLD'
    scene.world.color = (0.12,0.12,0.12)
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(path)
    scene.render.film_transparent = False
    bpy.ops.render.render(write_still=True)


def corner_signatures(mesh):
    normals = [n.vector.copy() for n in mesh.corner_normals]
    return {tuple(round(v,6) for v in mesh.vertices[l.vertex_index].co)
            + tuple(round(x,6) for uv in mesh.uv_layers for x in uv.data[l.index].uv)
            + tuple(round(x,5) for x in normals[l.index])
            for l in mesh.loops}


def repair_panel(obj):
    mesh = obj.data
    before = mesh_audit(obj)
    original_corners = corner_signatures(mesh)
    original_normals = [n.vector.copy() for n in mesh.corner_normals]
    original_uvs = [uv.name for uv in mesh.uv_layers]
    original_bvh = BVHTree.FromPolygons([v.co.copy() for v in mesh.vertices],
                                      [list(p.vertices) for p in mesh.polygons])
    original_positions = [v.co.copy() for v in mesh.vertices]
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    normal_layers = [bm.loops.layers.float.new('_music_review_normal_'+axis) for axis in 'xyz']
    for f in bm.faces:
        for loop, original_idx in zip(f.loops, mesh.polygons[f.index].loop_indices):
            for i, layer in enumerate(normal_layers):
                loop[layer] = original_normals[original_idx][i]
    start_vertices = len(bm.verts)
    if obj.name == PANELS[0]:
        # 1e-8 local units is approximately 0.000085 inherited world units.
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-8)
    removed_vertices = start_vertices-len(bm.verts)
    caps = [f for f in bm.faces if len(f.verts)>4]
    bmesh.ops.triangulate(bm, faces=caps, quad_method='BEAUTY', ngon_method='BEAUTY')
    # This exact flap is an extra face left at a welded split, not a missing cap.
    flaps = [f for f in bm.faces if len(f.verts)==3
             and sum(len(e.link_faces)==3 for e in f.edges)==2
             and sum(e.is_boundary for e in f.edges)==1]
    if obj.name == PANELS[0]:
        assert len(flaps)==1, 'Unexpected left-panel flap topology; refusing repair'
        bmesh.ops.delete(bm, geom=flaps, context='FACES')
    else:
        assert not flaps
    assert all(e.is_manifold and e.is_contiguous for e in bm.edges), 'Panel is not a consistently wound closed surface'
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    transferred = [tuple(mesh.attributes['_music_review_normal_'+axis].data[i].value for axis in 'xyz') for i in range(len(mesh.loops))]
    for axis in 'xyz':
        mesh.attributes.remove(mesh.attributes['_music_review_normal_'+axis])
    mesh.normals_split_custom_set(transferred)
    mesh.update()
    assert original_uvs == [uv.name for uv in mesh.uv_layers]
    after_corners = corner_signatures(mesh)
    source_normals = {}
    for corner in original_corners:
        source_normals.setdefault(corner[:-3], []).append(Vector(corner[-3:]).normalized())
    assert all(c[:-3] in source_normals for c in after_corners), 'A UV corner value changed unexpectedly'
    max_normal_error = max(min(math.degrees(Vector(c[-3:]).normalized().angle(n)) for n in source_normals[c[:-3]]) for c in after_corners)
    print('NORMAL_TRANSFER='+json.dumps({'object':obj.name,'maximum_error_degrees':max_normal_error}),flush=True)
    # Re-encoding split normals after changing a smooth fan introduces a small
    # angular rounding difference. Record it explicitly, with a sub-degree gate.
    assert max_normal_error < 0.5, 'Split normal transfer exceeds the 0.5 degree tolerance'
    after = mesh_audit(obj)
    new_bvh = BVHTree.FromPolygons([v.co.copy() for v in mesh.vertices], [list(p.vertices) for p in mesh.polygons])
    old_to_new = max(new_bvh.find_nearest(v)[3] for v in original_positions)
    new_to_old = max(original_bvh.find_nearest(v.co)[3] for v in mesh.vertices)
    return {'object':obj.name, 'welded_vertices':removed_vertices, 'triangulated_caps':len(caps),
            'removed_stray_triangles':len(flaps), 'before':before, 'after':after,
            'uv_corner_values_preserved':True, 'custom_split_normals_transferred':True,
            'maximum_split_normal_error_degrees':max_normal_error,
            'maximum_vertex_to_original_surface_local':new_to_old,
            'maximum_original_vertex_to_repaired_surface_local':old_to_new,
            'world_bounds_max_delta':max(abs(x-y) for old,new in zip(before['world_bounds'],after['world_bounds']) for x,y in zip(old,new))}


def pack_dependencies(before):
    result = {'packed_images':[], 'recovered_from_live_glb':[], 'packed_fonts':[], 'unresolved_used_images':[]}
    glb = (ROOT/'assets/glb/toy-piano.glb').read_bytes()
    offset = 12
    gltf = None
    binary = None
    while offset < len(glb):
        length, kind = struct.unpack_from('<II', glb, offset)
        data = glb[offset+8:offset+8+length]
        if kind == 0x4e4f534a:
            gltf = json.loads(data)
        elif kind == 0x004e4942:
            binary = data
        offset += 8+length
    embedded = {}
    for im in gltf.get('images',[]):
        if 'bufferView' in im:
            view = gltf['bufferViews'][im['bufferView']]
            start = view.get('byteOffset',0)
            embedded[im.get('name','')] = binary[start:start+view['byteLength']]
    needed = {i['name'] for i in before['images'] if i['objects']}
    for image in bpy.data.images:
        if image.packed_file or image.name not in needed or not image.filepath:
            continue
        candidate = Path(bpy.path.abspath(image.filepath, start=str(EXTERNAL_SOURCE.parent)))
        raw = None
        try:
            raw = candidate.read_bytes()
        except OSError:
            raw = embedded.get(image.name)
            if raw is not None:
                result['recovered_from_live_glb'].append(image.name)
        if raw:
            image.filepath = str(candidate)
            image.pack(data=raw, data_len=len(raw))
            assert image.packed_file and len(image.packed_file.data)==len(raw)
            result['packed_images'].append(image.name)
        else:
            result['unresolved_used_images'].append({'name':image.name,'source_path':str(candidate)})
    for font in bpy.data.fonts:
        if font.packed_file or font.filepath=='<builtin>':
            continue
        candidate = Path(r'C:\Windows\Fonts') / Path(font.filepath.replace('\\','/')).name
        if candidate.is_file():
            font.filepath = str(candidate)
            font.pack()
            result['packed_fonts'].append(font.name)
    return result


def repair():
    assert Path(bpy.data.filepath).resolve() == ORIGINAL.resolve(), 'Rebuild only from the untouched project backup'
    before = audit()
    report = {'source':str(EXTERNAL_SOURCE), 'working_copy':str(SOURCE),
              'original_backup_sha256':hashlib.sha256(ORIGINAL.read_bytes()).hexdigest(),
              'live_glb_sha256_before':hashlib.sha256((ROOT/'assets/glb/toy-piano.glb').read_bytes()).hexdigest(),
              'panels':[repair_panel(bpy.data.objects[n]) for n in PANELS]}
    report['dependency_packaging'] = pack_dependencies(before)
    bpy.context.view_layer.update()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), check_existing=False)
    report['live_glb_sha256_after'] = hashlib.sha256((ROOT/'assets/glb/toy-piano.glb').read_bytes()).hexdigest()
    assert report['live_glb_sha256_before'] == report['live_glb_sha256_after']
    dump('repair-report.json', report)
    dump('after-audit.json', audit())
    print('REPAIR_SUMMARY='+json.dumps({'panels':[{k:r[k] for k in ['object','welded_vertices','triangulated_caps','removed_stray_triangles','uv_corner_values_preserved','maximum_split_normal_error_degrees','world_bounds_max_delta']} for r in report['panels']], 'dependency_packaging':report['dependency_packaging']}),flush=True)


def verify():
    frames = [1,118,300]
    def snapshot(path):
        bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False, use_scripts=False)
        meshes = {}
        for obj in bpy.data.objects:
            if obj.type != 'MESH':
                continue
            m = obj.data
            payload = {'vertices':[list(v.co) for v in m.vertices],
                       'edges':[list(e.vertices) for e in m.edges],
                       'faces':[list(p.vertices)+[p.material_index,p.use_smooth] for p in m.polygons],
                       'uv':[[list(v.uv) for v in uv.data] for uv in m.uv_layers],
                       'normals':[list(n.vector) for n in m.corner_normals]}
            meshes[obj.name] = hashlib.sha256(json.dumps(payload).encode()).hexdigest()
        poses = {}
        for frame in frames:
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            deps = bpy.context.evaluated_depsgraph_get()
            poses[frame] = {o.name:[list(row) for row in o.evaluated_get(deps).matrix_world] for o in bpy.data.objects}
        return {'meshes':meshes, 'poses':poses,
                'parents':{o.name:o.parent.name if o.parent else None for o in bpy.data.objects},
                'actions':sorted((a.name,a.users,list(a.frame_range)) for a in bpy.data.actions),
                'visibility':{o.name:[o.hide_render,o.hide_viewport,o.hide_get()] for o in bpy.data.objects}}
    old = snapshot(ORIGINAL)
    new = snapshot(SOURCE)
    changed = [n for n in old['meshes'] if old['meshes'][n]!=new['meshes'][n]]
    assert set(changed)==set(PANELS)
    for k in ['poses','parents','actions','visibility']:
        assert old[k]==new[k], k+' changed'
    repair_report = json.loads((OUT/'repair-report.json').read_text())
    packed = []
    for name in repair_report['dependency_packaging']['packed_images']:
        image = bpy.data.images[name]
        assert image.packed_file and len(image.packed_file.data)>0, name+' did not remain packed'
        assert min(image.size)>0, name+' did not decode'
        packed.append({'name':name, 'bytes':len(image.packed_file.data), 'size':list(image.size)})
    for name in repair_report['dependency_packaging']['packed_fonts']:
        assert bpy.data.fonts[name].packed_file
    result = {'changed_meshes':changed, 'other_meshes_unchanged':len(old['meshes'])-len(changed),
              'hierarchy_visibility_actions_unchanged':True, 'world_transforms_identical_at_frames':frames,
              'packed_dependencies_reopened_and_decoded':packed,
              'source_backup_matches_external':hashlib.sha256(ORIGINAL.read_bytes()).digest()==hashlib.sha256(EXTERNAL_SOURCE.read_bytes()).digest(),
              'live_glb_unchanged':hashlib.sha256((ROOT/'assets/glb/toy-piano.glb').read_bytes()).hexdigest()==repair_report['live_glb_sha256_before'],
              'shape_key_deformation_count':sum(max(0,len(k.key_blocks)-1) for k in bpy.data.shape_keys)}
    assert result['source_backup_matches_external'] and result['live_glb_unchanged']
    dump('verification.json',result)
    print('VERIFICATION='+json.dumps(result),flush=True)


def main():
    args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['audit']
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['audit','render','repair','verify'])
    parser.add_argument('file', nargs='?', default=str(SOURCE))
    parser.add_argument('--objects', nargs='+')
    parser.add_argument('--label', default='before')
    ns = parser.parse_args(args)
    path = ORIGINAL if ns.mode=='repair' else Path(ns.file).resolve()
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False, use_scripts=False)
    if ns.mode == 'audit':
        result = audit()
        dump(ns.label+'-audit.json', result)
        print('AUDIT_TOTALS='+json.dumps(result['totals']), flush=True)
        for m in result['meshes']:
            if m['world_dimensions'][2] > 0 and ('SK_' in m['name'] or 'stripey_stripes.002' == m['name'] or ('leftLeg' in m['name'] and m['vertices']>400)):
                print('PANEL_CANDIDATE='+json.dumps({k:m[k] for k in ['name','vertices','faces','triangles','world_dimensions','boundary_edges','overconnected_edges','nonplanar_ngons','near_zero_faces','loose_vertices']}),flush=True)
    elif ns.mode == 'render':
        objects = [bpy.data.objects[n] for n in ns.objects] if ns.objects else [o for o in bpy.context.scene.objects if o.type in {'MESH','FONT'} and o.visible_get()]
        bpy.context.view_layer.update()
        render_view(OUT/(ns.label+'.png'), objects, wire=bool(ns.objects))
    elif ns.mode == 'repair':
        repair()
    elif ns.mode == 'verify':
        verify()


if __name__ == '__main__':
    main()
