"""Render source-derived transparent navbar miniatures with Blender 4.5.

Run: blender --factory-startup -b --python tools/render-navbar-models.py
Writes assets/navbar-models/*.png and assets/selected-work/*.png.
No source model or artwork is modified.
"""
from pathlib import Path
import math
import shutil
import subprocess
import bpy
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'navbar-models'
OUT.mkdir(parents=True, exist_ok=True)
SELECTED = ROOT / 'assets' / 'selected-work'
SELECTED.mkdir(parents=True, exist_ok=True)
SIZE = 384

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 32
    sc.cycles.use_denoising = True
    sc.render.resolution_x = SIZE
    sc.render.resolution_y = SIZE
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '8'
    sc.world = bpy.data.worlds.new('studio world')
    sc.world.color = (0.13, 0.13, 0.13)
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'

def material(name, color, metallic=0, roughness=.35, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Metallic'].default_value = metallic
    bs.inputs['Roughness'].default_value = roughness
    if emission:
        bs.inputs['Emission Color'].default_value = (*color, 1)
        bs.inputs['Emission Strength'].default_value = emission
    return m

def textured(path, name, glow=.15):
    m = material(name, (.7,.7,.7), roughness=.6)
    n = m.node_tree.nodes
    tex = n.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(str(path), check_existing=True)
    bs = n.get('Principled BSDF')
    m.node_tree.links.new(tex.outputs['Color'], bs.inputs['Base Color'])
    m.node_tree.links.new(tex.outputs['Color'], bs.inputs['Emission Color'])
    bs.inputs['Emission Strength'].default_value = glow
    return m

def box(name, loc, dims, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('rounded edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        o.modifiers.new('weighted normals', 'WEIGHTED_NORMAL')
    return o

def plane_image(name, path, center, width, height, facing='-Y'):
    bpy.ops.mesh.primitive_plane_add(size=1, location=center)
    o = bpy.context.object
    o.name = name
    o.dimensions = (width, height, 0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if facing == '-Y':
        o.rotation_euler[0] = math.pi / 2
    elif facing == '+X':
        o.rotation_euler = (math.pi / 2, 0, math.pi / 2)
    o.data.materials.append(textured(path, name + ' artwork', .32))
    return o

def bounds(objects):
    pts = [o.matrix_world @ Vector(p) for o in objects if o.type == 'MESH' for p in o.bound_box]
    return Vector(tuple(min(p[i] for p in pts) for i in range(3))), Vector(tuple(max(p[i] for p in pts) for i in range(3)))

def camera_for(objects, direction, up='Z', padding=1.2):
    lo, hi = bounds(objects)
    ctr = (lo + hi) / 2
    span = max(hi - lo)
    direction = Vector(direction).normalized()
    bpy.ops.object.camera_add(location=ctr + direction * span * 3.0)
    cam = bpy.context.object
    cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', up).to_euler()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = span * padding
    cam.data.clip_end = max(1000, span * 12)
    bpy.context.scene.camera = cam
    return cam

def studio(objects, direction, padding=1.22, light_factor=1, up='Z'):
    lo, hi = bounds(objects)
    ctr = (lo + hi) / 2
    span = max(hi - lo)
    camera_for(objects, direction, up=up, padding=padding)
    for name, offset, power, size in [
        ('key', (1,-2,3), 600, 4),
        ('fill', (-2,-1,1), 350, 5),
        ('rim', (1,2,2), 750, 3),
    ]:
        bpy.ops.object.light_add(type='AREA', location=ctr + Vector(offset).normalized()*span*2.2)
        lamp = bpy.context.object
        lamp.name = name
        lamp.data.energy = power * max(.25, span/3)**2 * light_factor
        lamp.data.shape = 'DISK'
        lamp.data.size = size * max(.2, span/4)
        lamp.rotation_euler = (ctr - lamp.location).to_track_quat('-Z','Y').to_euler()

def render(name, folder=OUT):
    bpy.context.scene.render.filepath = str(folder / (name + '.png'))
    bpy.ops.render.render(write_still=True)
    print('NAVBAR_RENDER', name, (folder / (name+'.png')).stat().st_size)

def import_glb(path):
    bpy.ops.import_scene.gltf(filepath=str(ROOT / path))
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']

def model(name, path, direction, padding=1.2):
    if name == 'music':
        return music()
    reset()
    meshes = import_glb(path)
    if name == 'about':
        # The source cube shows Skills on its near face. The page's current V9
        # clock assembly is mounted onto its visible right face for this icon.
        before = set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/about-cube/glb/spirals-v9.glb'))
        added = [o for o in bpy.context.scene.objects if o not in before]
        transform = Matrix.Translation((.20,0,0)) @ Matrix.Rotation(-math.pi/2,4,'Y')
        for o in added:
            if o.parent is None:
                o.matrix_world = transform @ o.matrix_world
        for o in added:
            if o.type == 'MESH' and o.name.startswith('Cube'):
                o.hide_render = True
            elif o.type == 'MESH':
                meshes.append(o)
        # Oddio's four colorful cloth lanes and twin reels, derived from its
        # current face palette, are mounted on the visible upper cube face.
        cloth = [(.38,.77,.93),(.86,.47,.75),(.79,.67,.32),(.38,.86,.69)]
        for i, color in enumerate(cloth):
            meshes.append(box('Oddio tape lane %d'%i,
                (0,-.45+i*.29,1.045), (1.25,.19,.035),
                material('Oddio cloth %d'%i,color,roughness=.7,emission=.25), .07))
        brass = material('Oddio reel brass',(.73,.51,.20),metallic=.7,roughness=.23)
        for x in (-.68,.68):
            bpy.ops.mesh.primitive_torus_add(major_radius=.16,minor_radius=.045,
                location=(x,0,1.09))
            reel=bpy.context.object;reel.name='Oddio brass reel';reel.data.materials.append(brass)
            meshes.append(reel)
    elif name == 'videos':
        # A vivid actual frame from NeoTube Studios, extracted at 12 seconds.
        ffmpeg = shutil.which('ffmpeg') or r'C:\FFMPEG\bin\ffmpeg.exe'
        frame = ROOT/'output'/'navbar-miniatures'/'neotube-12.jpg'
        frame.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-ss','12',
            '-i',str(ROOT/'Videos/videos-page/neotube-studios-lq.webm'),
            '-frames:v','1','-q:v','3',str(frame),'-y'],check=True)
        black = material('display backing', (.012,.016,.025), roughness=.38)
        box('dark tablet display', (0,-.107,0), (5.16,.008,3.85), black, .07)
        meshes.append(plane_image('NeoTube Studios frame at 12 seconds', frame,
            (0,-.116,0),5.02,2.82))
        direction = (.45,-5,1.2)
    elif name == 'games':
        # The GLB monitor is blank; the page uses real game thumbnails.
        meshes.append(plane_image('You Be the Server game screen',
            ROOT/'games'/'images'/'game-thumb-you-be-the-server.jpg',
            (.049,0,.72), .65,.40, '+X'))
        direction = (5,-1.5,1.2)
    elif name == 'docs':
        direction = (2,-5,2)
    studio(meshes, direction, padding, up='Y' if name=='games' else 'Z')
    render(name)

def music():
    # A deliberately simplified navbar miniature: broad key shapes carry the
    # piano identity at a few pixels. The interactive page model is untouched.
    reset()
    wood = material('piano mahogany', (.16,.035,.025), roughness=.24)
    trim = material('polished key surround', (.045,.018,.015), roughness=.22)
    ivory = material('wide ivory keys', (.97,.94,.82), roughness=.24)
    ebony = material('raised black keys', (.012,.014,.021), roughness=.20)
    felt = material('red felt behind keyboard', (.48,.035,.065), roughness=.70)
    brass = material('two small pedals', (.72,.43,.12), metallic=.72, roughness=.24)
    pieces = []
    pieces.append(box('low piano cabinet', (0,.12,1.10), (5.05,1.96,.36), wood,.09))
    pieces.append(box('solid back without screen', (0,.87,1.57), (5.05,.22,.74), wood,.06))
    for x in (-2.37,2.37):
        pieces.append(box('piano cheek', (x,-.05,1.43), (.29,1.98,.40), wood,.065))
        pieces.append(box('short sturdy leg', (x,.23,.57), (.31,1.32,.92), wood,.05))
    pieces.append(box('keyboard bed', (0,-.24,1.34), (4.58,1.65,.13), trim,.025))
    pieces.append(box('felt strip', (0,.47,1.44), (4.45,.12,.04), felt,.01))
    step = 4.40 / 14
    for i in range(14):
        x = (i-6.5)*step
        pieces.append(box('wide white key %02d'%i, (x,-.27,1.445), (step-.015,1.35,.15), ivory,.018))
        if i%7 in (0,1,3,4,5) and i < 13:
            pieces.append(box('raised black key %02d'%i, (x+step/2,.025,1.57), (step*.57,.76,.15), ebony,.015))
    for x in (-.28,.28):
        pieces.append(box('pedal', (x,-.35,.30), (.16,.48,.075), brass,.03))
    studio(pieces, (.7,-5.5,4.3), 1.16, 1.25)
    render('music')


def graphics():
    reset()
    paper = material('page edges', (.91,.79,.56), roughness=.75)
    spine = material('bound spines', (.20,.10,.15), roughness=.4)
    pieces = []
    # Closed books in an overlapping fan, ordered yellow through purple.
    for i, grade in enumerate((3,4,5,6)):
        book = bpy.data.objects.new('fanned grade %d'%grade, None)
        bpy.context.collection.objects.link(book)
        book.location = ((i-1.5)*.88, .15 if i in (1,2) else -.12, i*.065)
        book.rotation_euler.z = math.radians((28,10,-10,-28)[i])
        parts = [box('closed grade %d pages'%grade, (0,0,.11), (1.56,2.28,.19), paper,.035),
                 box('grade %d binding'%grade, (-.77,0,.12), (.07,2.28,.23), spine,.02),
                 plane_image('grade %d cover'%grade,
                    ROOT/'_3-graphics'/'shelf'/'assets'/('grade-%d'%grade)/'travel'/'front.jpg',
                    (0,0,.211),1.54,2.25,'+Z')]
        for part in parts:
            part.parent = book
            pieces.append(part)
    bpy.context.view_layer.update()
    studio(pieces, (.2,-3.5,8), 1.20, .85)
    render('graphics')


def old_hexagon_desk():
    # Actual desk and its attached green lamp from the older Hexagon Site.
    source = ROOT/'assets/.blend/Puzzle Box Assets/.BL/Hexagon_Site_2.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    sc=bpy.context.scene
    sc.render.engine='CYCLES'; sc.cycles.samples=32; sc.cycles.use_denoising=True
    sc.render.resolution_x=SIZE; sc.render.resolution_y=SIZE
    sc.render.resolution_percentage=100;sc.render.film_transparent=True
    sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGBA'
    sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast'
    desk=bpy.data.objects['Desk']
    world=desk.matrix_world.copy();desk.parent=None;desk.matrix_world=world
    def descendants(o):
        yield o
        for child in o.children: yield from descendants(child)
    owned=set(descendants(desk))
    for o in sc.objects:
        if o not in owned: o.hide_render=True
    meshes=[o for o in owned if o.type=='MESH']
    studio(meshes,(1,5,2.2),1.25,1.25,up='Y')
    render('docs')

def selected_coursebooks():
    reset()
    sc = bpy.context.scene
    sc.render.resolution_x = 768
    sc.render.resolution_y = 512
    cream = material('cream page block', (.95,.87,.69), roughness=.72)
    dark = material('bound spines', (.19,.15,.19), roughness=.4)
    pieces = []
    # Six current Just Speak cover files in a neatly spread, closed state.
    for i in range(6):
        col, row = i%3, i//3
        x = (col-1)*1.93 + (row-.5)*.07
        y = (.5-row)*2.75
        z = .11 + ((i%3)*.012)
        pages = box('closed grade %d pages'%(i+1), (x,y,z), (1.65,2.42,.20), cream,.035)
        spine = box('grade %d spine'%(i+1), (x-.81,y,z+.025), (.08,2.42,.24), dark,.02)
        cover = plane_image('grade %d original front'%(i+1),
            ROOT/'_3-graphics'/'shelf'/'assets'/('grade-%d'%(i+1))/'travel'/'front.jpg',
            (x,y,z+.108), 1.62,2.38, '+Z')
        pieces.extend((pages,spine,cover))
    studio(pieces, (1.0,-1.8,7), 1.36, .42)
    render('coursebooks', SELECTED)

def selected_global_conquest():
    reset()
    sc = bpy.context.scene
    sc.render.resolution_x = 768
    sc.render.resolution_y = 512
    board = material('folded board edge', (.095,.08,.19), roughness=.48)
    seam = material('center fold', (.11,.16,.28), roughness=.54)
    pieces = []
    # Open board, with the printed map only: no pieces, cards, or tokens.
    pieces.append(box('open game board', (0,0,.03), (7.6,5.38,.13), board,.06))
    pieces.append(plane_image('original Global Conquest map',
        ROOT/'_3-graphics'/'shelf'/'assets'/'games'/'global-conquest-light.jpg',
        (0,0,.105), 7.48,5.24, '+Z'))
    pieces.append(box('fold hinge', (0,0,.115), (.025,5.22,.015), seam,.008))
    studio(pieces, (1.2,-4.3,7), 1.31, .24)
    render('global-conquest', SELECTED)

import sys
chosen = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if not chosen or 'about' in chosen: model('about', 'assets/about-cube/glb/model.glb', (3,-4,3), 1.4)
if not chosen or 'videos' in chosen: model('videos', 'assets/glb/video-tablet.glb', (1,-5,2), 1.17)
if not chosen or 'graphics' in chosen: graphics()
if not chosen or 'games' in chosen: model('games', 'assets/glb/Arcade-Console.glb', (3,-5,2.5), 1.21)
if not chosen or 'music' in chosen: model('music', 'assets/glb/toy-piano.glb', (1,-5,2.4), 1.2)
if not chosen or 'docs' in chosen: old_hexagon_desk()
if not chosen or 'coursebooks' in chosen: selected_coursebooks()
if not chosen or 'global-conquest' in chosen: selected_global_conquest()
