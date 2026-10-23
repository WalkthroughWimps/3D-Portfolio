"""Evaluate original pendants read-only into a compact, camera-neutral mesh pack."""
import bpy, json, math
from pathlib import Path
from array import array
from mathutils import Vector

scene=bpy.context.scene
out=Path(__file__).resolve().parent/'assets'/'navigation'
out.mkdir(exist_ok=True,parents=True)
values=array('f')
grades=[]
for grade,frame in enumerate([2411,1005,1286,1567,1844,2129],1):
    scene.frame_set(frame)
    graph=bpy.context.evaluated_depsgraph_get()
    direction=scene.camera.matrix_world.to_quaternion()@Vector((0,0,1))
    rotation=(-direction).to_track_quat('-Z','Y').to_euler()
    rotation.z+=math.pi
    inverse=rotation.to_quaternion().inverted()
    objects=[o.evaluated_get(graph) for o in bpy.data.objects[f'Pendant_G{grade}'].children_recursive if o.type in {'MESH','FONT','CURVE'}]
    meshes=[o.to_mesh() for o in objects]
    points=[inverse@(o.matrix_world@v.co) for o,mesh in zip(objects,meshes) for v in mesh.vertices]
    lo=Vector([min(p[i] for p in points) for i in range(3)])
    hi=Vector([max(p[i] for p in points) for i in range(3)])
    center=(lo+hi)/2
    size=max((hi-lo).x,(hi-lo).y)
    parts=[]
    for obj,mesh in zip(objects,meshes):
        mesh.calc_loop_triangles()
        positions=[]; normals=[]; groups=[]; materials=[]
        normal_matrix=obj.matrix_world.to_3x3().inverted().transposed()
        for index,material in enumerate(mesh.materials):
            start=len(positions)//3
            for triangle in mesh.loop_triangles:
                if triangle.material_index!=index:continue
                for loop in triangle.loops:
                    positions.extend((inverse@(obj.matrix_world@mesh.vertices[mesh.loops[loop].vertex_index].co)-center)/size)
                    normals.extend((inverse@(normal_matrix@mesh.corner_normals[loop].vector)).normalized())
            groups.append({'start':start,'count':len(positions)//3-start,'materialIndex':index})
            bs=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if material.use_nodes else None
            materials.append({'name':material.name,'color':list(bs.inputs['Base Color'].default_value)[:3] if bs else list(material.diffuse_color)[:3]})
        offset=len(values);values.extend(positions);values.extend(normals)
        parts.append({'name':obj.original.name,'offset':offset,'count':len(positions),'groups':groups,'materials':materials})
        obj.to_mesh_clear()
    grades.append({'grade':grade,'frame':frame,'parts':parts})
(out/'grade-meshes.bin').write_bytes(values.tobytes())
(out/'grade-meshes.json').write_text(json.dumps({'source':'graphics-page.blend','grades':grades,'floats':len(values)},separators=(',',':')))
print('GRADE_MESHES',len(grades),'bytes',len(values)*4,flush=True)
