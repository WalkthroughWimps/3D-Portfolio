"""Rebuild Notes' cube-local modeling reference with Blender 4.5.

Run from repository root: blender -b -t 2 --python _1-about/notes/blender-reference/build_reference.py
One Blender unit equals one site scene unit; no physical scale is asserted.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / 'assets/about-cube/blend/notes-glass-reference.blend'
VERIFY = Path(__file__).with_name('verification.json')
SOURCE = ROOT / 'assets/about-cube/glb/model.glb'

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))

def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c

def move(obj, target):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    target.objects.link(obj)

def material(name, rgba, metallic=0, roughness=.35, alpha=1):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgba, alpha)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*rgba, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Alpha'].default_value = alpha
    if alpha < 1:
        m.surface_render_method = 'BLENDED'
    return m

silver = material('source shell | satin graphite', (.15,.21,.25), .35)
backmat = material('source Notes backing | warm dark teal', (.09,.22,.24), .3)
glassmat = material('glass | transparent cyan', (.41,.83,.89), .05, .08, .22)
rearmat = material('optional rear layer | cyan', (.25,.53,.68), .05, .15, .11)
gold = material('guides | muted brass', (.76,.52,.23), .7)
cyan = material('guides | pale cyan', (.44,.92,.98), .1)

focus_parent = bpy.data.objects.new('FOCUS VIEW ONLY | illustrative whole-cube rotation', None)
bpy.context.scene.collection.objects.link(focus_parent)
focus_parent.empty_display_type = 'ARROWS'
focus_parent.empty_display_size = .32
site_parent = bpy.data.objects.new('CUBE LOCAL | lock this for physical clearance', None)
bpy.context.scene.collection.objects.link(site_parent)
site_parent.parent = focus_parent

shell_col = collection('01 SOURCE | actual cube and Notes backing')
source = {}
for obj in list(bpy.data.objects):
    if obj in (focus_parent, site_parent):
        continue
    if obj.type == 'MESH' and obj.name in ('back.art Export', 'cube.main Export'):
        imported_world=obj.matrix_world.copy()
        obj.parent = site_parent
        obj.matrix_world=imported_world
        obj.name = 'SOURCE | Notes backing | back.art' if obj.name.startswith('back') else 'SOURCE | cube.main shell'
        obj.data.materials.clear()
        obj.data.materials.append(backmat if 'backing' in obj.name else silver)
        move(obj, shell_col)
        source[obj.name] = obj
    else:
        bpy.data.objects.remove(obj, do_unlink=True)

glass_col = collection('02 GLASS | actual diameter and layer offsets')
tablet_col = collection('03 TABLET PANES | code initial targets, viewport varies')
guide_col = collection('04 GUIDES | nonexport measurements and pivot')

# GLTF importer maps site (x,y,z) to Blender (x,-z,y).
def site(x,y,z):
    return Vector((x,-z,y))

mount = bpy.data.objects.new('MOUNT | site [-0.966, 0, 0] | outward -X', None)
glass_col.objects.link(mount)
mount.parent = site_parent
mount.location = site(-.966,0,0)
mount.empty_display_type = 'SPHERE'
mount.empty_display_size = .075

carrier = bpy.data.objects.new('CARRIER | physical lift 0.045 to 0.225', None)
glass_col.objects.link(carrier)
carrier.parent = mount
carrier.empty_display_type = 'CIRCLE'
carrier.empty_display_size = .12
carrier.location.x = -.045

def disk(name, radius, offset, mat, show=True):
    bpy.ops.mesh.primitive_circle_add(vertices=128, radius=radius, fill_type='NGON')
    obj = bpy.context.object
    obj.name = name
    # Circle lies in YZ, with front normal toward outward -X.
    obj.rotation_euler[1] = -math.pi/2
    obj.parent = carrier
    obj.location.x = offset
    obj.data.materials.append(mat)
    obj.hide_render = not show
    move(obj, glass_col)
    return obj

primary = disk('PANE 0 | clear glass | diameter 1.670', .835, 0, glassmat)
rear1 = disk('PANE 1 | optional rear | site local z -0.006', .835, .006, rearmat)
rear2 = disk('PANE 2 | optional rear | site local z -0.012', .835, .012, rearmat)
for obj in (rear1,rear2):
    obj.hide_set(True)
    obj.hide_render = True

def torus(name, major, minor, x, parent, mat, target):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=128, minor_segments=8)
    obj=bpy.context.object
    obj.name=name
    obj.rotation_euler[1]=-math.pi/2
    obj.parent=parent
    obj.location.x=x
    obj.data.materials.append(mat)
    move(obj,target)
    return obj

torus('BEZEL | moving | radius .900 tube .014', .900,.014,0,carrier,gold,glass_col)
torus('SEAT | fixed | radius .900 tube .007', .900,.007,-.035,mount,gold,glass_col)
torus('OPENING | radius .895 guide only',.895,.002,0,mount,cyan,guide_col)

def marker(name, coord, size=.06):
    o=bpy.data.objects.new(name,None)
    guide_col.objects.link(o)
    o.parent=site_parent
    o.location=site(*coord)
    o.empty_display_type='SPHERE'
    o.empty_display_size=size
    o.show_in_front=True
    return o

marker('PIVOT REF | site origin | proposed central support location only',(0,0,0),.10)
marker('REST | pane center site x -1.011',(-1.011,0,0))
marker('FOCUSED OPEN | pane center site x -1.191',(-1.191,0,0))
marker('OUTWARD NORMAL | 1 unit marker',(-1.966,0,0),.035)

# The runtime recalculates targets from viewport and camera. These two are its
# exact initial targets before layout(): x +/-1.6, width 1.2, aspect 546:900.
# They give a reproducible nominal rail envelope, not a guaranteed browser pose.
TABLET_WIDTH=1.2
TABLET_HEIGHT=TABLET_WIDTH*900/546
ROD_GAP=.058
def clamp(v): return max(0,min(1,v))
def smooth(v):
    v=clamp(v)
    return v*v*(3-2*v)
def span(v,a,b): return smooth((v-a)/(b-a))
def lerp(a,b,t): return a+(b-a)*t

def tablet_pose(side,p):
    # scrollPose() + railAssembly() with identity screen orientation.
    # createScrollMotion multiplies the deployment reach by the lift gate.
    lift=min(.18,max(0,p*2.8/.25*.18))
    reach=span(p,0,.64)*span(lift/.18,.9,1)
    clear_x=side*(.835+TABLET_WIDTH/2+.16)
    stored_y=-side*.48
    x=lerp(0,clear_x,span(reach,0,.2))
    z=.2 if reach<.3 else lerp(.2,.36,span(reach,.3,.65))
    y=stored_y
    orientation=span(reach,.65,1)
    if reach>=.65:
        x=lerp(clear_x,side*1.6,orientation)
        y=lerp(stored_y,-TABLET_HEIGHT/2,orientation)
        z=lerp(.36,.36,orientation)
    fold=span(p,.64,.78)
    unroll=span(p,.78,1)
    height=lerp(ROD_GAP,TABLET_HEIGHT,unroll)
    length=(TABLET_HEIGHT+ROD_GAP+.04)/2
    theta=fold*math.pi/2
    d1=(side*math.cos(theta),math.sin(theta))
    d2=(-d1[0],d1[1])
    travel=height+ROD_GAP if fold>=.999999 else ROD_GAP*(1+math.sin(theta))
    hinge=(length*d1[0],length*d1[1])
    onrail=(travel*d1[0],travel*d1[1]) if travel<=length else (hinge[0]+(travel-length)*d2[0],hinge[1]+(travel-length)*d2[1])
    offset=(0,-ROD_GAP) if fold>=.999999 else (-ROD_GAP*math.sin(theta)*d1[0],-ROD_GAP*math.sin(theta)*d1[1])
    upper=(onrail[0]+offset[0],onrail[1]+offset[1])
    center=(x+upper[0]/2,y+upper[1]/2,z+.008)
    return center,height,unroll

tablet_materials=[material('tablet left | muted amber',(.68,.37,.17),.08,.3,.7),
                  material('tablet right | slate blue',(.16,.43,.65),.08,.3,.7)]
tablets=[]
dowels=[]
for i,side in enumerate((-1,1)):
    mesh=bpy.data.meshes.new('tablet rectangle 1 x 1')
    mesh.from_pydata([(0,.5,-.5),(0,-.5,-.5),(0,-.5,.5),(0,.5,.5)],[],[(0,1,2,3)])
    mesh.materials.append(tablet_materials[i])
    obj=bpy.data.objects.new(('LEFT' if side<0 else 'RIGHT')+' TABLET | 546 x 900 ratio | width 1.2 nominal',mesh)
    tablet_col.objects.link(obj)
    obj.parent=carrier
    tablets.append((side,obj))
    pivot=bpy.data.objects.new(('LEFT' if side<0 else 'RIGHT')+' PROPOSED pane-center pivot | guide only',None)
    guide_col.objects.link(pivot)
    pivot.parent=obj
    pivot.empty_display_type='SPHERE'
    pivot.empty_display_size=.07
    pivot.show_in_front=True
    for edge in ('LOWER','UPPER'):
        bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=1,depth=2)
        dowel=bpy.context.object
        dowel.name=('LEFT' if side<0 else 'RIGHT')+' '+edge+' DOWEL REF | radius .013 span 1.274'
        dowel.parent=carrier
        dowel.rotation_euler[0]=math.pi/2
        dowel.data.materials.append(gold)
        move(dowel,tablet_col)
        dowels.append((side,edge,dowel))
    marker(('LEFT' if side<0 else 'RIGHT')+' TARGET | nominal center site face-local x '+str(side*1.6),(-1.191,0,side*1.6),.04)

# Rest-to-focus scene: cube rotation is illustrative because the entry orientation
# is user controlled. Lift follows the exact .25-second outward travel cap after
# a Notes-facing/open request, expressed on a 30 fps timeline.
fps=30
scene=bpy.context.scene
scene.render.fps=fps
scene.frame_start=1
scene.frame_end=91
for frame, angle in ((1,-20),(91,35)):
    focus_parent.rotation_euler.z=math.radians(angle)
    focus_parent.keyframe_insert(data_path='rotation_euler',frame=frame)
for frame,lift in ((1,0),(4,.06),(7,.12),(9,.16),(10,.18),(91,.18)):
    carrier.location.x=-(.045+lift)
    carrier.keyframe_insert(data_path='location',frame=frame)
for fc in carrier.animation_data.action.fcurves:
    for k in fc.keyframe_points:
        k.interpolation='LINEAR'
for frame in (1,19,37,55,64,73,79,85,91):
    p=clamp((frame-1)/84)
    for side,obj in tablets:
        center,height,unroll=tablet_pose(side,p)
        # Face-local (x,y,z) maps to Blender local (-z,-x,y).
        obj.location=(-center[2],-center[0],center[1])
        obj.scale=(1,TABLET_WIDTH,height)
        obj.keyframe_insert(data_path='location',frame=frame)
        obj.keyframe_insert(data_path='scale',frame=frame)
        obj.hide_render=unroll<=.001
        obj.hide_viewport=unroll<=.001
        obj.keyframe_insert(data_path='hide_render',frame=frame)
        obj.keyframe_insert(data_path='hide_viewport',frame=frame)
        for shaft_side,edge,dowel in dowels:
            if shaft_side!=side: continue
            edge_y=center[1]+(-height/2 if edge=='LOWER' else height/2)
            dowel.location=(-center[2]+.008,-center[0],edge_y)
            dowel.scale=(.013,.013,(TABLET_WIDTH+.074)/2)
            dowel.keyframe_insert(data_path='location',frame=frame)
            dowel.keyframe_insert(data_path='scale',frame=frame)
for frame,label in ((1,'REST | illustrative away orientation'),(10,'FULL PHYSICAL LIFT | 0.18'),(66,'GUIDES FOLDING | nominal'),(85,'TABLETS OPEN | 2.8 s nominal'),(91,'NOTES FACING | whole cube focus')):
    m=scene.timeline_markers.new(label,frame=frame)

scene.unit_settings.system='NONE'
scene.unit_settings.scale_length=1
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.resolution_x=1200
scene.render.resolution_y=900
scene.render.resolution_percentage=70
scene.world.color=(.12,.16,.2)

def track(obj,target):
    direction=Vector(target)-obj.location
    obj.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()

camdata=bpy.data.cameras.new('Reference orbit camera')
camera=bpy.data.objects.new('CAMERA | illustrative view',camdata)
guide_col.objects.link(camera)
camera.location=(-4.3,-3.2,2.7)
track(camera,(0,0,0))
camdata.type='ORTHO'
camdata.ortho_scale=6.8
scene.camera=camera
for name,loc,energy,size in (('Key',(-3,-4,5),800,5),('Fill',(1,3,2),500,4)):
    light=bpy.data.lights.new(name,'AREA')
    light.energy=energy
    light.shape='DISK'
    light.size=size
    obj=bpy.data.objects.new(name,light)
    guide_col.objects.link(obj)
    obj.location=loc
    track(obj,(0,0,0))

for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'

scene.frame_set(91)
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))

samples=[]
for frame in (1,4,7,9,10,30,60,91):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    samples.append({'frame':frame,'carrier_lift':round(-carrier.location.x-.045,6),
                    'pane_center_cube_local':[round(v,6) for v in (-.966+carrier.location.x,0,0)],
                    'illustrative_cube_yaw_degrees':round(math.degrees(focus_parent.rotation_euler.z),6),
                    'nominal_tablets':[{'side':side,'center_face_local':[round(v,6) for v in tablet_pose(side,clamp((frame-1)/84))[0]],
                                        'height':round(tablet_pose(side,clamp((frame-1)/84))[1],6)} for side,_ in tablets]})
VERIFY.write_text(json.dumps({'source_glb':str(SOURCE.relative_to(ROOT)).replace('\\','/'),
  'unit':'one Blender unit = one site scene unit; physical meters unverified',
  'glass_diameter':1.67,'opening_radius':.895,'bezel_radius':.9,
  'nominal_tablet_target':{'x_left':-1.6,'x_right':1.6,'width':TABLET_WIDTH,'height':TABLET_HEIGHT,'note':'initial code target; viewport layout can replace it'},
  'rest_pane_center_cube_local':[-1.011,0,0],
  'open_pane_center_cube_local':[-1.191,0,0],
  'source_meshes':{k:{'vertices':len(v.data.vertices),
    'cube_local_bounds':[[round(min((site_parent.matrix_world.inverted() @ v.matrix_world @ x.co)[i] for x in v.data.vertices),6),
                     round(max((site_parent.matrix_world.inverted() @ v.matrix_world @ x.co)[i] for x in v.data.vertices),6)] for i in range(3)]}
    for k,v in source.items()},'samples':samples},indent=2))
print('REFERENCE_SAVED',OUTPUT)
