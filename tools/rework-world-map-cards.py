"""Rework editable IDML copies, then build web cards from InDesign PDF proofs.

Requires Pillow and PyMuPDF 1.26.5. Original INDDs and linked artwork are read-only.
Run prepare; open the two reworked IDMLs in InDesign and export same-name PDFs;
then run assets. All coordinates below are points in the card's spread space.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote, unquote
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tmp/card-rework-deps'))
import pymupdf as fitz

WORK = ROOT / 'games/world-map-game/card-rework'
ART = ROOT / '_3-graphics/shelf/assets/gc-cards'
QA = ROOT / 'output/world-map-cards-20261027'
ET.register_namespace('idPkg', 'http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging')


def read_doc(kind):
    with ZipFile(WORK / 'source' / f'{kind} Cards.reference.idml') as z:
        data = {n: z.read(n) for n in z.namelist()}
    trees = {n: ET.fromstring(b) for n, b in data.items() if n.endswith('.xml')}
    stories = {t[0].get('Self'): t for n, t in trees.items() if n.startswith('Stories/')}
    spreads = sorted(((n, t) for n, t in trees.items() if n.startswith('Spreads/')),
                     key=lambda nt: int(next(nt[1].iter('Page')).get('Name')))
    return data, trees, stories, spreads


def text(stories, frame):
    return ''.join(x.text or '' for x in stories[frame.get('ParentStory')].iter('Content'))


def bounds(item):
    pts = [list(map(float, p.get('Anchor').split())) for p in
           item.findall('./Properties/PathGeometry/GeometryPathType/PathPointArray/PathPointType')]
    return [min(p[0] for p in pts), min(p[1] for p in pts),
            max(p[0] for p in pts), max(p[1] for p in pts)]


def world_bounds(item):
    a, b, c, d, tx, ty = map(float, item.get('ItemTransform', '1 0 0 1 0 0').split())
    x0, y0, x1, y1 = bounds(item)
    pts = [(a*x+c*y+tx, b*x+d*y+ty) for x, y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]]
    return [min(x for x,y in pts), min(y for x,y in pts),
            max(x for x,y in pts), max(y for x,y in pts)]


def set_rect(item, box):
    x0,y0,x1,y1 = box
    points = item.findall('./Properties/PathGeometry/GeometryPathType/PathPointArray/PathPointType')
    if len(points) != 4:
        raise ValueError(f'Expected rectangular image frame: {item.get("Self")}')
    for p, xy in zip(points, [(x0,y0),(x0,y1),(x1,y1),(x1,y0)]):
        for key in ['Anchor','LeftDirection','RightDirection']:
            p.set(key, f'{xy[0]:.8f} {xy[1]:.8f}')
    item.set('ItemTransform', '1 0 0 1 0 0')


def copy_visual(target, template):
    # Keep each original story and identity. Copy the actual frame, not a bitmap.
    identity = {k: target.get(k) for k in ['Self','ParentStory','ItemLayer'] if target.get(k) is not None}
    target.attrib.clear()
    target.attrib.update(template.attrib)
    target.attrib.update(identity)
    target[:] = [copy.deepcopy(c) for c in template]


def linked_file(link):
    return Path(unquote(link.get('LinkResourceURI')).removeprefix('file:'))


def recolour(trees):
    # Deliberate foreground palette changes, preserving vector shapes/gradients.
    palettes = {
        'helicopter.svg': {
            '#90500c':'#bc7615', '#a45d13':'#e39520', '#b38613':'#f3be36',
            '#876309':'#c99415', '#755500':'#a77a08', '#7d1d0a':'#a63213',
            '#4c6448':'#96b981', '#00795c':'#12aa80', '#1b4476':'#2a619e',
            '#061629':'#102c47', '#0c2c4a':'#17476b', '#11416e':'#286190'},
        'bicycle.svg': {'#30e6c4':'#ff9b70', '#007a64':'#c24427'},
        'airplane.svg': {'#e7e3e8':'#fbfcff', '#6279bf':'#3e69b3',
                         '#7387c4':'#4f79c6', '#144b6e':'#165b8a'},
    }
    (WORK / 'Links').mkdir(parents=True, exist_ok=True)
    changes = []
    for n, tree in trees.items():
        if not n.startswith('Spreads/'): continue
        for link in tree.iter('Link'):
            source = linked_file(link)
            if source.name not in palettes: continue
            svg = source.read_text(encoding='utf-8')
            palette = palettes[source.name]
            updated = re.sub(r'#[0-9a-fA-F]{6}\b', lambda m: palette.get(m[0].lower(), m[0]), svg)
            destination = WORK / 'Links' / source.name
            destination.write_text(updated, encoding='utf-8')
            link.set('LinkResourceURI', 'file:' + quote(destination.as_posix(), safe='/:'))
            link.set('LinkResourceModified','true')
            changes.append(source.name)
    return sorted(set(changes))


def save_doc(kind, data, trees):
    path = WORK / f'{kind} Cards.reworked.idml'
    with ZipFile(path, 'w') as z:
        for name, original in data.items():
            # Preserve designmap's Adobe processing instructions, font metadata,
            # and all untouched resources verbatim. Only spreads are edited.
            value = ET.tostring(trees[name], encoding='utf-8', xml_declaration=True) if name.startswith('Spreads/') else original
            z.writestr(name, value, compress_type=ZIP_STORED if name=='mimetype' else ZIP_DEFLATED)
    return path


def vehicles():
    data, trees, stories, spreads = read_doc('Vehicle')
    ref = spreads[0][1][0]
    frames = list(ref.iter('TextFrame'))
    instruction = next(f for f in frames if text(stories,f).startswith('Move'))
    title = next(f for f in frames if text(stories,f)=='Bicycle')
    # Instructions are a separate text frame over a rectangle. Names are text
    # inside the styled frame. Preserve that distinction on every card.
    background = min((r for r in ref if r.tag=='Rectangle'),
                     key=lambda r: sum(abs(a-b) for a,b in zip(world_bounds(r),world_bounds(instruction))))
    records = []
    for n, tree in spreads:
        spread = tree[0]
        fs = list(spread.iter('TextFrame'))
        rule = next(f for f in fs if text(stories,f).startswith(('Move','Steal')))
        name = next(f for f in fs if f is not rule and text(stories,f) != 'LANDMARK Card')
        old_rule_bounds = world_bounds(rule)
        panel = min((r for r in spread if r.tag=='Rectangle'),
                    key=lambda r: sum(abs(a-b) for a,b in zip(world_bounds(r),old_rule_bounds)))
        if sum(abs(a-b) for a,b in zip(world_bounds(panel),old_rule_bounds)) > 3:
            raise ValueError('Cannot identify instruction background')
        if spread is not ref:
            copy_visual(panel, background)
            copy_visual(rule, instruction)
            copy_visual(name, title)
        if text(stories,name)=='Thief':
            badge=next(g for g in spread.iter('Group') if any(linked_file(l).name=='City Skyline.png' for l in g.iter('Link')))
            transform=list(map(float,badge.get('ItemTransform').split()))
            transform[5]-=18
            badge.set('ItemTransform',' '.join(map(str,transform)))
        records.append({'page':int(next(tree.iter('Page')).get('Name')),
                        'name':text(stories,name),'instructions':text(stories,rule)})
    colours = recolour(trees)
    return {'cards':records,'colours':colours,'path':str(save_doc('Vehicle',data,trees))}


def landmark_icon(spread):
    return next(r for r in spread.iter('Rectangle')
                if any('/Icons/' in unquote(l.get('LinkResourceURI','')) for l in r.iter('Link')))


def icon_placement(frame, protected):
    image = frame.find('Image')
    if image is None: raise ValueError('Landmark icon must be a placed image')
    source = linked_file(next(image.iter('Link')))
    rgba = Image.open(source).convert('RGBA')
    alpha = rgba.getchannel('A')
    ink = alpha.getbbox()
    if not ink: raise ValueError(f'Empty landmark graphic {source.name}')
    gb = image.find('./Properties/GraphicBounds')
    gw = float(gb.get('Right'))-float(gb.get('Left'))
    gh = float(gb.get('Bottom'))-float(gb.get('Top'))
    iw,ih = ink[2]-ink[0],ink[3]-ink[1]
    unitw,unith = gw*iw/rgba.width, gh*ih/rgba.height
    nominal = min(52/unitw,48.7/unith)
    # Use the actual transparent silhouette against label/title exclusion areas.
    # The preferred centre is taken from the user's Castle composition.
    best = None
    for factor in [1,.95,.9,.85,.8,.75,.7,.65,.6]:
        scale = nominal*factor
        w,h = unitw*scale,unith*scale
        mask = alpha.crop(ink).resize((max(1,round(w*8)),max(1,round(h*8))))
        for dx in [0,3,6,9,-3]:
            for dy in [0,3,6,-3,9]:
                x,y = -14.64+dx-w/2,-7.48+dy-h/2
                if x < -60.5 or y < -60.5 or x+w>60.5 or y+h>60.5:continue
                overlap = 0
                for a,b,c,d in protected:
                    a,b,c,d = max(0,(a-x)*8),max(0,(b-y)*8),min(mask.width,(c-x)*8),min(mask.height,(d-y)*8)
                    if c>a and d>b:
                        overlap += sum(v>80 for v in mask.crop((int(a),int(b),int(c),int(d))).get_flattened_data())
                if overlap:continue
                # Keep some real overlap with the photograph, rather than simply
                # placing a large emblem in the empty bottom-left corner.
                if x+w < -5:continue
                score = factor*100-abs(dx)*.55-abs(dy)*.35
                if best is None or score>best[0]:best=(score,scale,x,y,w,h)
        if best and best[0]>factor*100-8:break
    if best is None:raise ValueError(f'No collision-free icon placement: {source.name}')
    _,scale,x,y,w,h=best
    tx=x-scale*(float(gb.get('Left'))+gw*ink[0]/rgba.width)
    ty=y-scale*(float(gb.get('Top'))+gh*ink[1]/rgba.height)
    set_rect(frame,[x-.2,y-.2,x+w+.2,y+h+.2])
    image.set('ItemTransform',f'{scale:.10f} 0 0 {scale:.10f} {tx:.10f} {ty:.10f}')
    return {'source':source.name,'inkBounds':[x,y,x+w,y+h],'scale':scale}


def landmarks():
    data, trees, stories, spreads = read_doc('Landmark')
    pdf=fitz.open(WORK/'source/Landmark Cards.reference.pdf')
    records=[]
    for n,tree in spreads:
        spread=tree[0]; page=int(next(tree.iter('Page')).get('Name'))
        fs=list(spread.iter('TextFrame')); labels=[text(stories,f) for f in fs]
        icon=landmark_icon(spread)
        # Castle is the untouched reference, including its deliberate overlap.
        if any('Castle in Love with the Wind' in s for s in labels):
            placement={'reference':True,'source':linked_file(next(icon.iter('Link'))).name}
        else:
            rects=[]
            for block in pdf[page-1].get_text('dict')['blocks']:
                for line in block.get('lines',[]):
                    for span in line['spans']:
                        a,b,c,d=span['bbox']
                        rects.append([a-65.409-1,b-65.4095-1,c-65.409+1,d-65.4095+1])
            placement=icon_placement(icon,rects)
        records.append({'page':page,'text':labels,'placement':placement})
    return {'cards':records,'path':str(save_doc('Landmark',data,trees))}


def prepare():
    QA.mkdir(parents=True,exist_ok=True)
    result={'vehicles':vehicles(),'landmarks':landmarks()}
    (QA/'source-layout-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Prepared 12 vehicle and 29 landmark cards; Castle reference preserved.')


def build_assets():
    # This is intentionally a separate step after native InDesign composition.
    manifest=json.loads((ART/'manifest.json').read_text(encoding='utf-8'))
    atlases=[Image.open(ART/f'atlas-{i}.jpg').convert('RGB') for i in range(3)]
    masters=ART/'masters';masters.mkdir(parents=True,exist_ok=True)
    faces=ART/'faces';faces.mkdir(parents=True,exist_ok=True)
    content={};digest=hashlib.sha256()
    for kind,family in [('Vehicle','vehicles'),('Landmark','landmarks')]:
        pdf=fitz.open(WORK/f'{kind} Cards.reworked.pdf')
        for i,page in enumerate(pdf):
            key=f'{family}:{i+1:03d}';entry=manifest['cards'][key]
            svg=page.get_svg_image(text_as_path=True)
            (masters/f'{family}-{i+1:03d}.svg').write_text(svg,encoding='utf-8')
            pix=page.get_pixmap(matrix=fitz.Matrix(1024/page.rect.width,1024/page.rect.height),alpha=False)
            image=Image.frombytes('RGB',[pix.width,pix.height],pix.samples).resize((1024,1024),Image.Resampling.LANCZOS)
            image.save(faces/f'{family}-{i+1:03d}.webp',quality=94,method=6)
            tile=image.resize((512,512),Image.Resampling.LANCZOS)
            atlases[entry['atlas']].paste(tile,((entry['tile']%4)*512,(entry['tile']//4)*512))
            plain=page.get_text().strip()
            content[key]={'text':plain,'svg':f'masters/{family}-{i+1:03d}.svg','detail':f'faces/{family}-{i+1:03d}.webp'}
            entry.update({'svg':content[key]['svg'],'detail':content[key]['detail']})
            digest.update(svg.encode())
    for i,atlas in enumerate(atlases):atlas.save(ART/f'atlas-{i}.jpg',quality=95,subsampling=0,optimize=True)
    manifest['revision']=digest.hexdigest()[:12]
    (ART/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    (ART/'card-content.json').write_text(json.dumps(content,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Built {len(content)} vector masters and 1024px details; base atlases remain 2048px.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('step',choices=['prepare','assets'])
    args=parser.parse_args()
    prepare() if args.step=='prepare' else build_assets()
