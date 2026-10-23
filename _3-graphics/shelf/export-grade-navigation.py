"""Read-only render of the six authored Blender pendants. Never saves the blend."""
import bpy
from pathlib import Path
from mathutils import Vector
import math

source=bpy.context.scene
out=Path(__file__).resolve().parent/'assets'/'navigation'
out.mkdir(parents=True,exist_ok=True)
holds=[2411,1005,1286,1567,1844,2129]
for grade,frame in enumerate(holds,1):
    bpy.context.window.scene=source
    source.frame_set(frame)
    graph=bpy.context.evaluated_depsgraph_get()
    direction=source.camera.matrix_world.to_quaternion()@Vector((0,0,1))
    scene=bpy.data.scenes.new('Grade icon review '+str(grade))
    points=[]
    names=[o.name for o in bpy.data.objects[f'Pendant_G{grade}'].children_recursive if o.type in {'MESH','FONT','CURVE'}]
    assert len(names)==3,(grade,names)
    for name in names:
        evaluated=bpy.data.objects[name].evaluated_get(graph)
        mesh=bpy.data.meshes.new_from_object(evaluated)
        obj=bpy.data.objects.new('Snapshot '+name,mesh)
        obj.matrix_world=evaluated.matrix_world.copy()
        scene.collection.objects.link(obj)
        points.extend(obj.matrix_world@v.co for v in mesh.vertices)
    lo=Vector([min(p[i] for p in points) for i in range(3)])
    hi=Vector([max(p[i] for p in points) for i in range(3)])
    center=(lo+hi)/2
    camera=bpy.data.objects.new('Icon camera',bpy.data.cameras.new('Icon camera'))
    scene.collection.objects.link(camera)
    scene.camera=camera
    camera.location=center+direction*12
    camera.rotation_euler=(-direction).to_track_quat('-Z','Y').to_euler()
    camera.rotation_euler.z+=math.pi
    camera.data.type='ORTHO'
    camera.data.ortho_scale=max(hi-lo)*1.3
    world=bpy.data.worlds.new('Icon world')
    world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.8,.8,.8,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
    scene.world=world
    lamp=bpy.data.lights.new('Icon softbox','AREA')
    lamp.energy=550
    lamp.shape='DISK'
    lamp.size=5
    light=bpy.data.objects.new('Icon softbox',lamp)
    scene.collection.objects.link(light)
    light.location=center+direction*6+Vector((-3,4,0))
    light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine='CYCLES'
    scene.cycles.samples=16
    scene.cycles.use_denoising=True
    scene.render.resolution_x=512
    scene.render.resolution_y=512
    scene.render.resolution_percentage=100
    scene.render.film_transparent=True
    scene.render.image_settings.file_format='PNG'
    scene.render.filepath=str(out/f'grade-{grade}.png')
    bpy.ops.render.render(write_still=True,scene=scene.name)
    print('Rendered authored Grade',grade,'at source frame',frame,flush=True)
