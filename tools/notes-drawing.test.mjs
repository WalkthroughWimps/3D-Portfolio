import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const gearSource = await readFile(new URL('../_1-about/notes/gear-model.js', import.meta.url), 'utf8');
const gearURL = `data:text/javascript;base64,${Buffer.from(gearSource).toString('base64')}`;
const g = await import(gearURL);
const source = (await readFile(new URL('../_1-about/notes/drawing-model.js', import.meta.url), 'utf8')).replace("'./gear-model.js'", JSON.stringify(gearURL));
const modelURL = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const m = await import(modelURL);
const documentSource = (await readFile(new URL('../_1-about/notes/drawing-document.js', import.meta.url), 'utf8')).replace("'./drawing-model.js'", JSON.stringify(modelURL));
const documentURL = `data:text/javascript;base64,${Buffer.from(documentSource).toString('base64')}`;
const d = await import(documentURL);
const rotationSource = (await readFile(new URL('../_1-about/notes/drawing-rotation.js', import.meta.url), 'utf8')).replace("'./drawing-model.js'", JSON.stringify(modelURL)).replace("'./drawing-document.js'", JSON.stringify(documentURL));
const rotation = await import(`data:text/javascript;base64,${Buffer.from(rotationSource).toString('base64')}`);
const transformSource = (await readFile(new URL('../_1-about/notes/drawing-transforms.js', import.meta.url), 'utf8')).replace("'./drawing-model.js'", JSON.stringify(modelURL)).replace("'./drawing-document.js'", JSON.stringify(documentURL)).replace("'./drawing-rotation.js'", JSON.stringify(`data:text/javascript;base64,${Buffer.from(rotationSource).toString('base64')}`));
const transforms = await import(`data:text/javascript;base64,${Buffer.from(transformSource).toString('base64')}`);
const layoutSource = await readFile(new URL('../_1-about/notes/drawing-layout.js', import.meta.url), 'utf8');
const layout = await import(`data:text/javascript;base64,${Buffer.from(layoutSource).toString('base64')}`);
const presenceSource = await readFile(new URL('../_1-about/notes/panel-presence.js', import.meta.url), 'utf8');
const { createPanelPresence } = await import(`data:text/javascript;base64,${Buffer.from(presenceSource).toString('base64')}`);
const style = { stroke: '#56d9ed', fill: null, strokeWidth: 6, sides: 3, depth: .5, smoothing: .45 };
const shape = (id, type = 'rectangle') => ({ ...m.shapeFromDrag(type, { x: 100, y: 100 }, { x: 200, y: 180 }, style), id, name: id, layerId: 'pane-1', groupId: null, order: Number(id.at(-1)) || 0 });
const close = (a, b) => assert.ok(m.distance(a, b) < 1e-7, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);

test('dragging uses the new geometry, keeps IDs, and snaps lines to the same 15-degree grid', () => {
  const original = shape('line1', 'line');
  const line = m.shapeFromDrag('line', { x: 0, y: 0 }, { x: 120, y: 39 }, original, true);
  assert.equal(line.id, original.id); assert.notEqual(line.width, original.width);
  const delta = m.subtract(line.points[1], line.points[0]);
  assert.ok(Math.abs(Math.atan2(delta.y, delta.x) - Math.PI / 12) < 1e-8);
});
test('line endpoint normalization preserves endpoints and width; its rotation handle is perpendicular', () => {
  const line = shape('line1', 'line'); line.rotation = .35; const before = line.points.map(p => m.toWorld(p, line));
  line.points[1] = m.toLocal({ x: 340, y: 310 }, line); m.rebaseShape(line);
  close(m.toWorld(line.points[0], line), before[0]); close(m.toWorld(line.points[1], line), { x: 340, y: 310 }); assert.equal(line.strokeWidth, 6);
  const [a, b, handle] = m.handles(line, 18), mid = m.multiply(m.add(a, b), .5), axis = m.subtract(b, a), stem = m.subtract(handle, mid);
  assert.ok(Math.abs(axis.x * stem.x + axis.y * stem.y) < 1e-7);
});

test('resize handles include four local side midpoints and centered scaling keeps rotated centers fixed', () => {
  for (const angle of [0, .47, Math.PI / 2]) {
    const original = { ...shape('resize1'), x: 500, y: 500, width: 160, height: 100, rotation: angle };
    const handles = m.handles(original, 7); assert.equal(handles.length, 9);
    for (let i = 0; i < 8; i++) {
      const [x, y] = m.RESIZE_HANDLES[i]; close(handles[i], m.toWorld({ x: x * 80, y: y * 50 }, original));
      const resized = m.resizeShape(original, i, m.toWorld({ x: x * 120, y: y * 80 }, original), false, false);
      close(resized, original); assert.ok(Math.abs(resized.width - (x ? 240 : 160)) < 1e-7);
      assert.ok(Math.abs(resized.height - (y ? 160 : 100)) < 1e-7); assert.equal(resized.strokeWidth, 6);
    }
  }
});

test('Ctrl resize fixes the opposite side or corner and Shift also constrains edge handles', () => {
  const original = { ...shape('resize1'), x: 500, y: 500, width: 160, height: 100, rotation: .63 }, before = JSON.stringify(original);
  for (let i = 0; i < 8; i++) {
    const [x, y] = m.RESIZE_HANDLES[i], opposite = m.toWorld({ x: -x * 80, y: -y * 50 }, original);
    const target = m.toWorld({ x: x * 130, y: y * 90 }, original);
    const resized = m.resizeShape(original, i, target, false, false, true);
    close(m.toWorld({ x: -x * resized.width / 2, y: -y * resized.height / 2 }, resized), opposite);
    close(m.toWorld({ x: x * resized.width / 2, y: y * resized.height / 2 }, resized), target);
    const locked = m.resizeShape(original, i, target, true, true, true);
    assert.ok(Math.abs(locked.width / locked.height - 1.6) < 1e-7);
    close(m.toWorld({ x: -x * locked.width / 2, y: -y * locked.height / 2 }, locked), opposite);
    assert.ok(Math.abs(locked.strokeWidth / 6 - locked.width / 160) < 1e-7);
  }
  const centered = m.resizeShape(original, 5, m.toWorld({ x: 120, y: 0 }, original), false, true);
  close(centered, original); assert.ok(Math.abs(centered.width - 240) < 1e-7); assert.ok(Math.abs(centered.height - 150) < 1e-7);
  assert.equal(JSON.stringify(original), before);
});

test('nonuniform group resizing preserves transformed rotated curves, centers, hierarchy and stroke policy', () => {
  const originals = ['rectangle', 'ellipse', 'heart', 'line', 'pencil'].map((type, i) => {
    const s = { ...shape(`group${i}`, type), x: 350 + i * 60, y: 400 + i * 20, rotation: .17 + i * .2, groupId: 'group-a' };
    if (type === 'pencil') { s.points = [{ x: -50, y: -40 }, { x: 20, y: 30 }, { x: 50, y: 40 }]; s.smoothing = 0; }
    return s;
  });
  const before = JSON.stringify(originals), frame = { ...m.boundsOf(originals), type: 'rectangle' };
  const target = { x: frame.x + frame.width * .8, y: frame.y };
  for (const opposite of [false, true]) {
    const nextFrame = m.resizeShape(frame, 5, target, false, false, opposite), sx = nextFrame.width / frame.width;
    const resized = m.resizeShapes(originals, frame, 5, target, false, false, opposite);
    originals.forEach((s, i) => {
      const points = m.flattenShape(s), actual = m.flattenShape(resized[i]); assert.equal(points.length, actual.length);
      points.forEach((p, j) => close(actual[j], { x: nextFrame.x + (p.x - frame.x) * sx, y: p.y }));
      assert.equal(resized[i].groupId, 'group-a'); assert.equal(resized[i].layerId, s.layerId); assert.equal(resized[i].strokeWidth, 6);
    });
    const scaled = m.resizeShapes(originals, frame, 5, target, true, false, opposite);
    scaled.forEach(s => assert.ok(Math.abs(s.strokeWidth - 6 * Math.sqrt(sx)) < 1e-7));
  }
  assert.equal(JSON.stringify(originals), before);
});
test('marquee selects partial intersections and contained shapes without ellipse corner false positives', () => {
  const ellipse = { ...shape('e1', 'ellipse'), x: 0, y: 0, width: 100, height: 100, stroke: null };
  assert.equal(m.overlapsRect(ellipse, { left: 43, right: 49, top: 43, bottom: 49 }), false);
  assert.equal(m.overlapsRect(ellipse, { left: -5, right: 5, top: -5, bottom: 5 }), true);
  const line = { ...shape('l1', 'line'), x: 0, y: 0, points: [{ x: -100, y: 0 }, { x: 100, y: 0 }] };
  assert.equal(m.overlapsRect(line, { left: -2, right: 2, top: -2, bottom: 2 }), true);
  assert.equal(m.overlapsRect(line, { left: -2, right: 2, top: 20, bottom: 25 }), false);
});
test('adding a Bézier anchor preserves the curve exactly; straight edges split at the requested location', () => {
  const a = m.anchor(0, 0, { x: 0, y: 0 }, { x: 40, y: 100 }), b = m.anchor(120, 0, { x: -50, y: 80 });
  const split = m.splitCurve([a, b], 0, .4, false);
  for (let i = 0; i <= 20; i++) {
    const t = i / 20, index = t <= .4 ? 0 : 1, u = t <= .4 ? t / .4 : (t - .4) / .6, left = split[index], right = split[index + 1];
    close(m.cubic(a, m.add(a, a.out), m.add(b, b.in), b, t), m.cubic(left, m.add(left, left.out), m.add(right, right.in), right, u));
  }
  close(m.splitCurve([m.anchor(0, 0), m.anchor(100, 0)], 0, .2, false)[1], { x: 20, y: 0 });
});
test('old drawings migrate to Pencil and editable polygons while retaining appearance', () => {
  const pencil = { ...shape('p1'), type: 'pen', points: [{ x: -20, y: 0 }, { x: 20, y: 10 }] }, triangle = { ...shape('t2'), type: 'triangle' };
  const doc = m.restoreDocument({ version: 1, objects: [pencil, triangle] });
  assert.deepEqual(doc.objects.map(s => s.type), ['pencil', 'polygon']); assert.equal(doc.objects[1].sides, 3); assert.equal(doc.objects[0].stroke, style.stroke); assert.equal(doc.layers.length, 1);
  const bad = m.restoreDocument({ version: 2, objects: [{ ...shape('bad'), points: 'not points' }], layers: [{ id: 'pane-1', name: 'Pane' }] }); assert.equal(bad.objects.length, 0);
});
test('grouping has exactly two levels and duplicate/move/ungroup preserve hierarchy', () => {
  const doc = m.emptyDocument(); doc.objects = [shape('s1'), shape('s2'), shape('s3'), shape('s4')];
  const inner = d.groupSelection(doc, new Set(['s1', 's2'])); assert.ok(inner);
  const outer = d.groupSelection(doc, new Set(['s1', 's2', 's3'])); assert.ok(outer); assert.equal(inner.parentId, outer.id);
  assert.equal(d.groupContext(doc, new Set(['s1', 's2', 's3', 's4'])), null);
  const duplicates = d.duplicateSelection(doc, new Set(['s1', 's2', 's3'])); assert.equal(duplicates.size, 3); assert.equal(doc.groups.length, 4);
  doc.layers.push({ id: 'pane-2', name: 'Pane 2', visible: true, locked: false }); d.moveSelectionToLayer(doc, duplicates, 'pane-2');
  assert.equal(doc.objects.filter(s => s.layerId === 'pane-2').length, 3); assert.equal(d.orderedObjects(doc).length, 7);
  assert.ok(d.ungroupSelection(doc, duplicates)); assert.equal(doc.groups.filter(g => g.layerId === 'pane-2').length, 1);
});
test('restore caps panes at three and rejects malformed geometry and group cycles', () => {
  const value = { ...m.emptyDocument(), layers: Array.from({ length: 8 }, (_, i) => ({ id: `pane-${i + 1}`, name: 'Pane' })), objects: [shape('s1'), { ...shape('s2'), width: NaN }],
    groups: [{ id: 'a', layerId: 'pane-1', parentId: 'b' }, { id: 'b', layerId: 'pane-1', parentId: 'a' }] };
  const doc = m.restoreDocument(value); assert.equal(doc.layers.length, 3); assert.equal(doc.objects.length, 1); assert.equal(d.orderedObjects(doc).length, 1);
  const roots = doc.groups.filter(g => !g.parentId); assert.ok(roots.length);
});
test('pencil smoothing keeps endpoints and removes jitter; parametric shapes expose editable anchors', () => {
  const points = Array.from({ length: 40 }, (_, i) => ({ x: i * 5, y: i % 2 })), smooth = m.simplified(points, 5);
  close(smooth[0], points[0]); close(smooth.at(-1), points.at(-1)); assert.ok(smooth.length < points.length / 2);
  assert.equal(m.shapeAnchors({ ...shape('s1', 'star'), sides: 7 }).length, 14);
  assert.equal(m.shapeAnchors({ ...shape('p1', 'polygon'), sides: 8 }).length, 8);
  assert.ok(m.shapeAnchors(shape('h1', 'heart')).some(a => Math.hypot(a.in.x, a.in.y) > 0));
});

test('depth covers displayed 0 through 100 while keeping star and heart topology safe', () => {
  for (const type of ['star', 'heart']) for (const depth of [0, 1]) {
    const s = { ...shape('depth1', type), depth, sides: 5 }, anchors = m.shapeAnchors(s);
    assert.ok(anchors.every(a => Number.isFinite(a.x) && Number.isFinite(a.y)));
    if (type === 'star' && depth === 1) assert.ok(Math.hypot(anchors[1].x, anchors[1].y) > 0);
    if (type === 'heart' && depth === 1) assert.ok(anchors[0].y < anchors[2].y);
    const restored = m.restoreDocument({ ...m.emptyDocument(), objects: [s] }); assert.equal(restored.objects[0].depth, depth);
  }
});
test('all nine rollers and ten pins close on every guide; pane-fit contains centered artwork', () => {
  for (const guide of g.GUIDES) for (const roller of g.ROLLERS) for (const hole of g.HOLES) for (const scale of [.55, 1]) {
    for (const inside of guide.id === 'circle' ? [false, true] : [false]) {
      const geometry = g.gearGeometry({ guide: guide.id, roller: roller.id, teeth: roller.teeth, hole, scale, inside, layout: 'pane', x: 500, y: 500 });
      close(geometry.pose(0).pen, geometry.pose(1).pen);
      assert.deepEqual(geometry.points[0], geometry.points.at(-1)); assert.ok(geometry.points.length <= 4000);
      assert.ok(geometry.points.every(p => Math.hypot(p.x - 500, p.y - 500) < 480));
      assert.ok(Math.hypot(geometry.pose(0).center.x - geometry.pose(1).center.x, geometry.pose(0).center.y - geometry.pose(1).center.y) < 1e-7);
    }
  }
});
test('rounded guide tracks are continuous with finite normals and no roller slip', () => {
  for (const guide of g.GUIDES) {
    const geometry = g.gearGeometry({ guide: guide.id, teeth: 32, hole: .68, scale: 1, inside: false, x: 500, y: 500 });
    let previous = geometry.pose(0);
    for (let i = 1; i <= 12000; i++) {
      const pose = geometry.pose(i / 12000), travel = m.distance(previous.center, pose.center), roll = Math.abs(pose.rotation - previous.rotation) * pose.radius;
      assert.ok(Math.abs(travel - roll) < .01, `${guide.id} slipped at ${i}`); previous = pose;
    }
  }
});
test('gear restoration keeps one bounded setup per pane and preserves valid placement', () => {
  const doc = m.emptyDocument(), setup = { layerId: doc.activeLayer, guide: 'square', teeth: 36, hole: .9, scale: .7, x: 530, y: 510 };
  const restored = m.restoreDocument({ ...doc, gears: [setup, setup, { ...setup, layerId: 'missing' }] });
  assert.equal(restored.gears.length, 1); assert.equal(restored.gears[0].x, 530); assert.equal(restored.gears[0].inside, false);
  const bad = g.restoreGears([{ ...setup, x: 1e9, y: 1e9, scale: Infinity, teeth: 99, hole: -2 }], doc.layers)[0];
  assert.equal(bad.teeth, 32); assert.equal(bad.hole, .68); assert.ok(Math.hypot(bad.x - 500, bad.y - 500) <= 496.000001);
});

test('entity visibility survives restoration and composes with nested groups and pane visibility', () => {
  const a = shape('visible1'), b = shape('visible2');
  a.groupId = 'inner'; b.groupId = 'outer'; a.visible = false;
  const doc = m.restoreDocument({ ...m.emptyDocument(), objects: [a, b], groups: [
    { id: 'outer', name: 'Outer', layerId: 'pane-1', parentId: null, order: 0, visible: true },
    { id: 'inner', name: 'Inner', layerId: 'pane-1', parentId: 'outer', order: 0, visible: true }
  ] });
  const first = doc.objects[0], second = doc.objects[1];
  assert.equal(first.visible, false); assert.equal(second.visible, true);
  assert.equal(d.nodeVisible(doc, first), false); assert.equal(d.objectEditable(doc, first), false);
  assert.equal(d.nodeVisible(doc, second), true);
  first.visible = true; assert.equal(d.nodeVisible(doc, first), true);
  doc.groups[1].visible = false; assert.equal(d.nodeVisible(doc, first), false); assert.equal(d.nodeVisible(doc, second), true);
  doc.groups[0].visible = false; assert.equal(d.nodeVisible(doc, second), false);
  doc.groups.forEach(group => { group.visible = true; }); doc.layers[0].visible = false;
  assert.equal(d.nodeVisible(doc, first), false); assert.equal(d.nodeVisible(doc, second), false);
  doc.layers[0].visible = true; doc.layers[0].locked = true;
  assert.equal(d.nodeVisible(doc, first), true); assert.equal(d.objectEditable(doc, first), false);
  const restored = m.restoreDocument(JSON.parse(JSON.stringify(doc))); assert.equal(restored.objects[0].visible, true);
});

test('pane intersection uses visible fill/strokes, not a shape center or bounding-box overlap', () => {
  const rectangle = { ...shape('place1'), x: 1030, y: 500, width: 100, height: 80, fill: '#ff827b', stroke: null };
  assert.equal(m.intersectsGlass(rectangle), true);
  rectangle.x = 1050; assert.equal(m.intersectsGlass(rectangle), false);
  const surround = { ...rectangle, x: 500, y: 500, width: 1400, height: 1400 };
  assert.equal(m.intersectsGlass(surround), true);
  surround.fill = null; surround.stroke = '#56d9ed'; assert.equal(m.intersectsGlass(surround), false);
  const crossing = { ...shape('cross', 'line'), x: 500, y: 500, points: [{ x: -700, y: 0 }, { x: 700, y: 0 }], width: 1400, height: 4 };
  assert.equal(m.intersectsGlass(crossing), true);
  crossing.y = 1100; assert.equal(m.intersectsGlass(crossing), false);
});
test('off-pane continuation clips crossing segments exactly at the glass rim', () => {
  const line = { ...shape('edge1', 'line'), x: 500, y: 500, points: [{ x: -700, y: 0 }, { x: 700, y: 0 }], width: 1400, height: 4 };
  const segments = m.outsideSegments(line); assert.equal(segments.length, 2);
  close(segments[0][1], { x: 4, y: 500 }); close(segments[1][0], { x: 996, y: 500 });
  assert.ok(segments.every(([a, b]) => Math.hypot((a.x + b.x) / 2 - 500, (a.y + b.y) / 2 - 500) > m.RADIUS));
  line.x = 1500; assert.equal(m.outsideSegments(line).length, 1);
  const inside = { ...shape('in1'), x: 500, y: 500 }; assert.deepEqual(m.outsideSegments(inside), []);
});
test('fully off-pane drops return to the drag origin while partly clipped shapes stay free', () => {
  const doc = m.emptyDocument(), original = { ...shape('move1'), x: 700, y: 500 };
  doc.objects = [m.clone(original)]; doc.objects[0].x = 1020;
  assert.equal(d.recoverOffPane(doc, [original], new Set([original.id])).length, 0); assert.equal(doc.objects[0].x, 1020);
  doc.objects[0].x = 1200;
  assert.equal(d.recoverOffPane(doc, [original], new Set([original.id])).length, 1); assert.equal(doc.objects[0].x, 700);
  const other = { ...shape('move2'), x: 760, y: 500 }; doc.objects.push(other); const selection = new Set(doc.objects.map(s => s.id)); d.groupSelection(doc, selection);
  const before = m.clone(doc.objects); doc.objects.forEach(s => { s.x += 1000; });
  assert.equal(d.recoverOffPane(doc, before, selection).length, 2); assert.deepEqual(doc.objects, before);
});
test('dimension inputs preserve center, obey stroke scaling, and scale groups proportionally', () => {
  const original = { ...shape('size1'), x: 500, y: 500, rotation: .6 };
  const changed = m.dimensionShapes([original], 'width', 240, false)[0]; assert.equal(changed.width, 240); assert.equal(changed.height, original.height); assert.equal(changed.strokeWidth, original.strokeWidth); close(changed, original);
  const other = { ...original, id: 'size2', x: 700 }, frame = m.boundsOf([original, other]);
  const enlarged = m.dimensionShapes([original, other], 'height', frame.height * 2, true);
  assert.equal(enlarged[0].width, original.width * 2); assert.equal(enlarged[0].strokeWidth, original.strokeWidth * 2);
  assert.equal(m.distance(enlarged[0], enlarged[1]), 400);
});
test('mode cursors retain geometry and hotspots while using the current palette color', async () => {
  const source = await readFile(new URL('../_1-about/notes/drawing-tools.js', import.meta.url), 'utf8');
  const tools = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const cyan = tools.toolCursor('rectangle', '#56d9ed'), pink = tools.toolCursor('rectangle', '#ff9fda');
  assert.notEqual(cyan, pink); assert.equal(tools.toolCursor('rectangle', '#ff9fda'), pink);
  assert.ok(decodeURIComponent(pink).includes('fill="#ff9fda"')); assert.ok(decodeURIComponent(pink).includes('M4 5h16v14H4z'));
  assert.ok(decodeURIComponent(tools.toolCursor('rectangle', null)).includes('M3 23L23 3'));
});

test('line dimensions edit its endpoint spans without stretching stroke width', () => {
  const line = { ...shape('dimension-line', 'line'), points: [{ x: -50, y: 0 }, { x: 50, y: 0 }], width: 100, height: 4 };
  const changed = m.dimensionShapes([line], 'height', 80, true)[0];
  assert.equal(changed.points[1].y - changed.points[0].y, 80); assert.equal(changed.width, 100); assert.equal(changed.strokeWidth, line.strokeWidth);
  assert.equal(m.dimensionShapes([changed], 'width', 240, true)[0].points[1].x, 120);
});


test('odd roller contact has zero slip and stays convex and inside the circular guide', () => {
  assert.equal(g.ROLLERS.length, 9); assert.equal(g.HOLES.length, 10);
  for (const roller of g.ROLLERS) {
    const profile = g.rollerProfile(roller);
    for (let i = 0; i <= 300; i++) {
      const point = profile.atNormal(i * Math.PI * 2 / 300), inverted = profile.atArc(point.arc);
      close(point, inverted); assert.ok(point.curvature > .09);
    }
    for (const guide of g.GUIDES) for (const inside of guide.id === 'circle' ? [true, false] : [false]) {
      const geom = g.gearGeometry({ guide: guide.id, roller: roller.id, teeth: roller.teeth, hole: .68, scale: 1, x: 500, y: 500, inside }, false);
      for (let i = 1; i < 160; i++) {
        const t = i / 160, a = geom.pose(t - 1e-7), b = geom.pose(t + 1e-7), mid = geom.pose(t);
        const turn = b.rotation - a.rotation;
        const q = { x: mid.contact.x - mid.center.x, y: mid.contact.y - mid.center.y };
        assert.ok(Math.hypot(b.center.x - a.center.x - turn * q.y, b.center.y - a.center.y + turn * q.x) < .0001, `${roller.id}/${guide.id}: slip`);
        if (inside) for (const p of geom.profile.outline) { const w = mid.world(p); assert.ok(Math.hypot(w.x - 500, w.y - 500) <= geom.track.radius + 1e-6, `${roller.id}: ring clearance`); }
      }
    }
  }
});

test('center and eight compass snaps are exact with a larger release radius', () => {
  close(g.snapGuide({ x: 540, y: 500 }), { x: 500, y: 500 });
  assert.equal(g.snapGuide({ x: 560, y: 500 }), null);
  assert.equal(g.snapGuide({ x: 560, y: 500 }, 'center').id, 'center');
  for (let i = 0; i < 8; i++) {
    const target = { x: 500 + 496 * Math.cos(i * Math.PI / 4), y: 500 + 496 * Math.sin(i * Math.PI / 4) };
    close(g.snapGuide({ x: target.x - 10, y: target.y + 10 }), target);
  }
});

test('rim placement restores intact and chooses an on-pane roller starting contact', () => {
  const layers = m.emptyDocument().layers;
  for (const guide of g.GUIDES) for (const roller of g.ROLLERS) for (let i = 0; i < 8; i++) {
    const setup = { layerId: layers[0].id, guide: guide.id, roller: roller.id, teeth: roller.teeth, hole: .9, inside: guide.id === 'circle', layout: 'pane', scale: 1, x: 500 + 496 * Math.cos(i * Math.PI / 4), y: 500 + 496 * Math.sin(i * Math.PI / 4) };
    setup.phase = g.visibleGearPhase(setup);
    const restored = g.restoreGears([setup], layers)[0]; close(restored, setup);
    const geom = g.gearGeometry(restored, false), pose = geom.pose(0);
    assert.ok(Math.hypot(pose.center.x - 500, pose.center.y - 500) < m.RADIUS, `${roller.id}/${guide.id} roller starts outside`);
  }
});

test('rounded plus pockets clear the entire body of every curated roller', () => {
  for (const roller of g.ROLLERS) {
    const geom = g.gearGeometry({ guide: 'plus', roller: roller.id, teeth: roller.teeth, hole: .68, inside: false, scale: 1, x: 500, y: 500 }, false);
    for (let i = 0; i < 160; i++) {
      const pose = geom.pose(i / 160);
      for (const p of geom.profile.outline) {
        const q = pose.world(p), angle = Math.atan2(q.y - 500, q.x - 500), boundary = geom.track.radius / 1.18 * (1 + .18 * Math.cos(4 * angle));
        assert.ok(Math.hypot(q.x - 500, q.y - 500) >= boundary - .002, `${roller.id}: intersects plus recess`);
      }
    }
  }
});

test('normalized gear size preserves the percentage and keeps a roller contact on-pane at maximum', () => {
  assert.equal(g.GUIDES.length, 6);
  for (const guide of g.GUIDES) for (const roller of g.ROLLERS) for (const size of [0, 60, 100]) {
    const setup = { guide: guide.id, roller: roller.id, teeth: roller.teeth, hole: .9, inside: guide.id === 'circle', layout: 'pane', size, x: 500, y: 500 };
    setup.phase = g.visibleGearPhase(setup); const geom = g.gearGeometry(setup, false);
    assert.equal(g.gearSizePercent(setup), size); assert.ok(Number.isFinite(geom.envelope));
    assert.ok(m.distance(geom.pose(0).center, { x: 500, y: 500 }) <= 460.00001);
    if (size === 100 && setup.inside) assert.ok(geom.track.radius > m.RADIUS);
  }
});

test('layer drop insertion preserves groups across panes and rejects cyclic/deep placements', () => {
  const doc = m.emptyDocument(); doc.layers.push({ id: 'pane-2', name: 'Second', visible: true, locked: false });
  doc.objects = ['a', 'b', 'c', 'd'].map((id, i) => ({ ...shape(id), order: i }));
  d.groupSelection(doc, new Set(['a', 'b'])); const group = doc.groups[0];
  assert.ok(d.placeNodes(doc, [group.id], { layerId: 'pane-2' }));
  assert.deepEqual(d.children(doc, 'pane-2').map(n => n.id), [group.id]);
  assert.ok(doc.objects.filter(s => ['a', 'b'].includes(s.id)).every(s => s.layerId === 'pane-2' && s.groupId === group.id));
  assert.equal(d.placeNodes(doc, [group.id], { layerId: 'pane-2', parentId: group.id }), false);
  assert.ok(d.placeNodes(doc, ['c'], { layerId: 'pane-2', beforeId: group.id }));
  assert.deepEqual(d.children(doc, 'pane-2').reverse().map(n => n.id), ['c', group.id]);
  assert.ok(d.placeNodes(doc, ['d'], { layerId: 'pane-2', parentId: group.id }));
  assert.ok(doc.objects.find(s => s.id === 'd').groupId === group.id);
  const before = m.clone(doc); doc.layers[1].locked = true;
  assert.equal(d.placeNodes(doc, ['c'], { layerId: 'pane-2' }), false); doc.layers[1].locked = false;
  assert.deepEqual(doc, before);
});

test('reorder slots use stable geometry with variable item heights', async () => {
  const { reorderSlot } = await import('../_7-shared-scripts/panel-assembly/StableReorder.mjs');
  const rectangles = [{ top: 100, height: 50 }, { top: 160, height: 200 }, { top: 370, height: 80 }];
  assert.equal(reorderSlot(rectangles, 125), 1); assert.equal(reorderSlot(rectangles, 259), 1);
  assert.equal(reorderSlot(rectangles, 261), 2); assert.equal(reorderSlot(rectangles, 500), 3);
  assert.equal(reorderSlot(rectangles, 90), 0);
});


test('smart rotation preserves relative geometry and stroke width around arbitrary pivots', () => {
  const originals = [{ ...shape('rotate1'), x: 700, y: 500 }, { ...shape('rotate2', 'line'), x: 600, y: 500 }];
  const moved = rotation.rotateShapesAround(originals, { x: 500, y: 500 }, Math.PI / 2);
  close(moved[0], { x: 500, y: 700 }); close(moved[1], { x: 500, y: 600 });
  assert.equal(m.distance(moved[0], moved[1]), m.distance(originals[0], originals[1]));
  assert.equal(moved[1].strokeWidth, originals[1].strokeWidth); assert.deepEqual(moved[1].points, originals[1].points);
  close(rotation.rotateShapesAround(moved, { x: 500, y: 500 }, -Math.PI / 2)[0], originals[0]);
  assert.ok(Math.abs(rotation.angleStep(Math.PI - .1, -Math.PI + .1) - .2) < 1e-9);
});

test('pivot snaps use pane compass points, transformed anchors and visible centers only', () => {
  const doc = m.emptyDocument(); const rectangle = { ...shape('pivot1'), rotation: Math.PI / 2 }, pencil = shape('pivot2', 'pencil'), hidden = { ...shape('pivot3'), visible: false };
  doc.objects = [rectangle, pencil, hidden];
  const snaps = { enabled: true, pane: true, centers: true, anchors: true }, targets = rotation.rotationTargets(doc, snaps);
  assert.equal(targets.filter(t => t.kind === 'pane').length, 9);
  assert.equal(targets.filter(t => t.kind === 'anchor' && t.objectId === pencil.id).length, 0);
  assert.ok(!targets.some(t => t.objectId === hidden.id));
  const corner = m.toWorld(m.shapeAnchors(rectangle)[0], rectangle);
  close(rotation.nearestRotationTarget(corner, targets, 10), corner);
  close(rotation.nearestRotationTarget({ x: 990, y: 504 }, targets, 15), { x: 996, y: 500 });
  assert.deepEqual(rotation.rotationTargets(doc, { ...snaps, enabled: false }), []);
  assert.ok(!rotation.rotationTargets(doc, { ...snaps, anchors: false }).some(t => t.kind === 'anchor'));
});

test('intersection snaps use finite visible path segments and respect their toggle', () => {
  const doc = m.emptyDocument();
  const line = (id, start, end) => ({ ...m.shapeFromDrag('line', start, end, style), id, name: id, layerId: doc.activeLayer, visible: true });
  doc.objects = [line('horizontal', { x: 400, y: 500 }, { x: 600, y: 500 }), line('vertical', { x: 500, y: 400 }, { x: 500, y: 600 })];
  const snaps = { enabled: true, pane: false, anchors: false, centers: false, intersects: true };
  const intersections = rotation.rotationTargets(doc, snaps).filter(t => t.kind === 'intersect');
  assert.equal(intersections.length, 1); close(intersections[0], { x: 500, y: 500 });
  assert.equal(rotation.rotationTargets(doc, { ...snaps, intersects: false }).length, 0);
  assert.equal(rotation.rotationTargets(doc, { ...snaps, enabled: false }).length, 0);
  doc.objects[1].visible = false;
  assert.equal(rotation.rotationTargets(doc, snaps).length, 0);
  doc.objects[1].visible = true;
  doc.objects[1] = line('vertical', { x: 700, y: 400 }, { x: 700, y: 600 });
  assert.equal(rotation.rotationTargets(doc, snaps).length, 0);
});

test('a closed outline does not snap to its ordinary closing join', () => {
  const doc = m.emptyDocument();
  const snaps = { enabled: true, pane: false, anchors: false, centers: false, intersects: true };
  for (const type of ['rectangle', 'ellipse']) {
    doc.objects = [{ ...shape(`join-${type}`, type), layerId: doc.activeLayer }];
    assert.deepEqual(rotation.rotationTargets(doc, snaps), [], `${type} closing join is not an intersection`);
  }
});

test('gear hover uses the same move, trace and inactive regions across all profiles', () => {
  for (const guide of g.GUIDES) for (const roller of g.ROLLERS) {
    const setup = { guide: guide.id, roller: roller.id, teeth: roller.teeth, hole: .68, inside: guide.id === 'circle', scale: 1, x: 500, y: 500 };
    const geom = g.gearGeometry(setup, false);
    assert.equal(g.gearInteraction(geom, setup, geom.pose(.2).center, .2), 'trace');
    assert.equal(g.gearInteraction(geom, setup, setup, .2), 'place');
    assert.equal(g.gearInteraction(geom, setup, { x: -2000, y: -2000 }, .2), 'none');
  }
});

test('artwork repaint and transforms reuse bitmaps, composites and clipped outlines under cache pressure', async () => {
  const originalDocument = globalThis.document, originalPath = globalThis.Path2D;
  let rasters = 0, composites = 0;
  const context = () => ({ scale() {}, translate() {}, rotate() {}, save() {}, restore() {}, clearRect() {}, fill() {}, stroke() { rasters++; }, drawImage() { composites++; } });
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => context() }; } };
  globalThis.Path2D = class { moveTo() {} lineTo() {} bezierCurveTo() {} closePath() {} };
  try {
    const source = (await readFile(new URL('../_1-about/notes/drawing-artwork.js', import.meta.url), 'utf8')).replace("'./drawing-model.js'", JSON.stringify(modelURL));
    const { createArtworkCache } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const cache = createArtworkCache(), shapes = Array.from({ length: 8 }, (_, i) => ({ ...shape(`cache${i}`), width: 1800, height: 1800 })), destination = context();
    cache.compose(destination, shapes, 1, .5); assert.equal(rasters, 16); const painted = composites;
    const outline = cache.outline(shapes[0]); assert.equal(cache.outline(shapes[0]), outline);
    cache.compose(destination, shapes, 1, .5); assert.equal(rasters, 16); assert.equal(composites, painted + 1);
    shapes[0].rotation += .2; cache.compose(destination, shapes, 1, .5); assert.equal(rasters, 16);
    assert.notEqual(cache.outline(shapes[0]), outline);
    shapes[0].width = 1400; cache.invalidate(shapes[0]); cache.compose(destination, shapes, 1, .5); assert.equal(rasters, 18);
    cache.dispose();
  } finally { globalThis.document = originalDocument; globalThis.Path2D = originalPath; }
});


test('display outlines simplify dense curves before clipping without changing stored artwork', t => {
  let full = 0, display = 0;
  for (let i = 0; i < 16; i++) {
    const setup = { guide: g.GUIDES[i % g.GUIDES.length].id, roller: g.ROLLERS[i % g.ROLLERS.length].id, teeth: g.ROLLERS[i % g.ROLLERS.length].teeth, hole: .9, inside: i % g.GUIDES.length === 0, layout: 'pane', size: 100, x: 500 + 496 * Math.cos(i * Math.PI / 4), y: 500 + 496 * Math.sin(i * Math.PI / 4) };
    const geom = g.gearGeometry(setup), s = shape(`dense${i}`, 'pencil'); s.smoothing = 0; m.normalizePencil(s, geom.points);
    const saved = JSON.stringify(s), raw = m.outsideSegments(s), simplified = m.outsideSegments(s, 1.5); full += raw.length; display += simplified.length;
    assert.equal(JSON.stringify(s), saved);
    assert.ok(simplified.every(([a, b]) => Math.hypot((a.x + b.x) / 2 - 500, (a.y + b.y) / 2 - 500) >= m.RADIUS - 1e-7));
  }
  t.diagnostic(`${full} original clipped segments; ${display} simplified segments in the 16-trace fixture`);
  assert.ok(display < full * .65, `${display} displayed segments vs ${full} original segments`);
});

test('dense off-pane outlines have a strict display budget and stable cached fallback', async () => {
  const source = await readFile(new URL('../_1-about/notes/drawing-outline.js', import.meta.url), 'utf8');
  const { limitOutlineSegments } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const paths = Array.from({ length: 300 }, (_, j) => ({ color: '#56d9ed', segments: Array.from({ length: 200 }, (_, i) => [{ x: i, y: j }, { x: i + 1, y: j }]) }));
  const shown = limitOutlineSegments(paths);
  assert.ok(shown.reduce((n, p) => n + p.segments.length, 0) <= 6000); assert.equal(shown.length, paths.length);
  assert.ok(shown.every(p => p.segments.length > 0));
  assert.equal(limitOutlineSegments(paths)[0].segments, shown[0].segments); assert.equal(paths[0].segments.length, 200);
});


test('Smart rotate keeps its visible control geometry bounded with many anchors', () => {
  const selected = shape('many-pivots'), targets = Array.from({ length: 10000 }, (_, i) => ({ x: i % 100, y: Math.floor(i / 100), kind: 'anchor', objectId: selected.id }));
  const controls = rotation.rotationPaths([selected], { x: 500, y: 500 }, 18, { x: 50, y: 50 }, targets);
  assert.ok(controls.paths.length <= 102);
  assert.ok(controls.paths.reduce((n, p) => n + p.points.length, 0) < 1500);
  assert.ok(rotation.nearestRotationTarget({ x: 99, y: 99 }, targets, 1));
});

test('rim layout centers the whole assembly and retains exact panel gaps when Layers opens', () => {
  for (const layersOpen of [false, true]) {
    const result = layout.drawingLayout({ width: 1860, left: 540, right: 1320, layersOpen });
    const right = result.uiLeft + 288 + (layersOpen ? 234 : 0);
    assert.equal(result.compact, false); assert.equal(result.zoom, 1);
    assert.ok(Math.abs(result.gearsLeft + right - 1860) < 1e-7);
    assert.equal(result.uiLeft - result.circleRight, 32);
    assert.equal(result.circleLeft - (result.gearsLeft + 264), 32);
    assert.ok(result.gearsLeft >= 12 && right <= 1848);
  }
});

test('overlarge rim layouts fit both screen margins and the General Settings available edge', () => {
  for (const availableRight of [1600, 1300]) {
    const result = layout.drawingLayout({ width: 1860, left: 100, right: 1760, availableRight, layersOpen: true });
    assert.equal(result.compact, false); assert.ok(result.zoom > 0 && result.zoom < 1);
    assert.ok(Math.abs(result.gearsLeft - 12) < 1e-7);
    assert.ok(Math.abs(result.uiLeft + 522 - (availableRight - 12)) < 1e-7);
    assert.ok(result.circleRight - result.circleLeft >= 220);
  }
});

test('narrow screens and restricted settings space use reachable stacked controls', () => {
  for (const [width, availableRight] of [[390, 390], [1280, 828], [680, 680]]) {
    const result = layout.drawingLayout({ width, availableRight, left: 100, right: width - 100, layersOpen: true });
    assert.equal(result.compact, true); assert.equal(result.zoom, 1);
    assert.equal(result.uiLeft, 12); assert.equal(width - result.uiRight, availableRight - 12);
    assert.equal(result.dockLeft, availableRight / 2);
  }
});

test('panel presence waits through incidental focus, enters once and dismisses quickly', () => {
  const gate = createPanelPresence();
  assert.equal(gate.update(1, true).phase, 'waiting'); assert.equal(gate.state.visible, false);
  assert.equal(gate.update(.1, false).phase, 'hidden');
  assert.equal(gate.update(2, true).phase, 'waiting');
  assert.equal(gate.update(.21, true).phase, 'entering'); assert.equal(gate.state.interactive, true);
  assert.equal(gate.update(.7, true).phase, 'open'); assert.equal(gate.update(10, true).phase, 'open');
  assert.equal(gate.update(.01, false).phase, 'leaving'); assert.equal(gate.state.interactive, false);
  assert.equal(gate.update(.15, false).phase, 'hidden');
  assert.equal(gate.update(.1, true).phase, 'waiting'); assert.equal(gate.reset().phase, 'hidden');
});

test('shared side slot preserves wide Layers and reserves the inactive title peek when space is limited', () => {
  const wide = layout.drawingLayout({ width: 1600, left: 550, right: 1050, layersOpen: true });
  assert.equal(wide.stacked, false); assert.equal(wide.compact, false);
  const narrow = layout.drawingLayout({ width: 1000, left: 200, right: 800, layersOpen: true });
  assert.equal(narrow.stacked, true); assert.equal(narrow.compact, false);
  assert.ok(Math.abs(narrow.gearsLeft - 14 - 12) < 1e-7); assert.ok(Math.abs(narrow.uiLeft + 288 - 988) < 1e-7);
  assert.equal(narrow.uiLeft - narrow.circleRight, 32); assert.equal(narrow.circleLeft - narrow.gearsLeft - 264, 32);
  const phone = layout.drawingLayout({ width: 390, left: 30, right: 360, layersOpen: true });
  assert.equal(phone.stacked, true); assert.equal(phone.compact, true);
  assert.equal(layout.drawingLayout({ width: 1000, left: 200, right: 800, layersOpen: false }).stacked, false);
});

test('alignment uses pane bounds for a single root and selection bounds for multiple roots', () => {
  const doc = m.emptyDocument(), layerId = doc.activeLayer;
  const a = { ...shape('align1'), layerId, x: 400, y: 450, width: 100, height: 80 };
  const b = { ...shape('align2'), layerId, x: 650, y: 550, width: 60, height: 40 }; doc.objects = [a, b];
  const checks = { left: ['left', 4], 'center-x': ['x', 500], right: ['right', 996], bottom: ['bottom', 996], 'center-y': ['y', 500], top: ['top', 4] };
  for (const [mode, [field, value]] of Object.entries(checks)) assert.equal(m.boundsOf(transforms.alignedObjects(doc, new Set([a.id]), mode))[field], value);
  const aligned = transforms.alignedObjects(doc, new Set([a.id, b.id]), 'left');
  assert.equal(m.boundsOf([aligned[0]]).left, 350); assert.equal(m.boundsOf([aligned[1]]).left, 350);
  const group = d.groupSelection(doc, new Set([a.id, b.id])); assert.ok(group);
  const together = transforms.alignedObjects(doc, new Set([a.id, b.id]), 'center-x');
  assert.equal(m.boundsOf(together).x, 500); assert.equal(together[1].x - together[0].x, 250);
  assert.deepEqual(transforms.ALIGNMENTS.map(a => a[0]), ['left', 'center-x', 'right', 'bottom', 'center-y', 'top']);
});

test('move snapping places centers and edges exactly on the pane north point and releases with hysteresis', () => {
  const doc = m.emptyDocument(), circle = { ...shape('snap1', 'ellipse'), layerId: doc.activeLayer, x: 500, y: 500, width: 100, height: 100 }; doc.objects = [circle];
  const snaps = { enabled: true, pane: true, centers: false, anchors: false }, index = transforms.moveSnapIndex(doc, [circle], circle, snaps);
  const north = transforms.snappedMove(index, { x: 3, y: -492 }, 8);
  assert.ok(Math.abs(circle.x + north.delta.x - 500) < 1e-7); assert.equal(circle.y + north.delta.y, 4);
  const edge = transforms.snappedMove(index, { x: 2, y: -444 }, 8);
  assert.equal(circle.y + edge.delta.y - circle.height / 2, 4);
  const retained = transforms.snappedMove(index, { x: 9, y: -486 }, 8, north); assert.ok(Math.abs(retained.delta.x) < 1e-7); assert.equal(retained.delta.y, -496);
  const free = transforms.snappedMove(index, { x: 25, y: -470 }, 8, north); assert.equal(free.x, null); assert.equal(free.y, null);
  const disabled = transforms.moveSnapIndex(doc, [circle], circle, { ...snaps, enabled: false });
  assert.deepEqual(transforms.snappedMove(disabled, { x: 3, y: -492 }, 8).delta, { x: 3, y: -492 });
  assert.ok(transforms.moveSnapPaths(north, 7).length <= 6);
});

test('move snaps exclude selected geometry, honor target toggles and use indexed searches', () => {
  const doc = m.emptyDocument(), a = { ...shape('snap1'), layerId: doc.activeLayer }, b = { ...shape('snap2'), layerId: doc.activeLayer, x: 700, y: 600 }; doc.objects = [a, b];
  const index = transforms.moveSnapIndex(doc, [a], a, { enabled: true, pane: false, centers: true, anchors: false });
  assert.equal(index.x.length, 1); assert.equal(index.x[0].objectId, b.id);
  const anchors = transforms.moveSnapIndex(doc, [a], a, { enabled: true, pane: false, centers: false, anchors: true });
  assert.equal(anchors.x.length, 4); assert.ok(anchors.x.every(t => t.objectId === b.id));
  let reads = 0; const targets = Array.from({ length: 10000 }, (_, i) => ({ get x() { reads++; return i; }, get y() { reads++; return i; } }));
  transforms.snappedMove({ points: [{ x: 0, y: 0 }], x: targets, y: targets }, { x: 5000.2, y: 8000.2 }, 1);
  assert.ok(reads < 100, `expected binary search, got ${reads} coordinate reads`);
});

test('zero-offset copies preserve two-level groups and repeat transformations accumulate around the same pivot', () => {
  const doc = m.emptyDocument(); doc.objects = [shape('copy1'), shape('copy2')].map(s => ({ ...s, layerId: doc.activeLayer }));
  const selected = new Set(doc.objects.map(s => s.id)); d.groupSelection(doc, selected);
  const before = JSON.stringify(doc.objects), ids = d.duplicateSelection(doc, selected, { x: 0, y: 0 });
  assert.equal(ids.size, 2); assert.equal(JSON.stringify(doc.objects.slice(0, 2)), before);
  assert.equal(doc.objects[2].x, doc.objects[0].x); assert.notEqual(doc.objects[2].groupId, doc.objects[0].groupId);
  let originals = [{ ...shape('repeat1'), x: 500, y: 600, rotation: 0 }];
  const operation = { kind: 'rotate', pivot: { x: 500, y: 500 }, angle: Math.PI / 2, copy: true };
  for (const expected of [{ x: 400, y: 500 }, { x: 500, y: 400 }, { x: 600, y: 500 }]) {
    originals = transforms.repeatedTransform(originals, originals[0], operation); close(originals[0], expected);
  }
  const s = { ...shape('repeat2'), width: 100, height: 80, rotation: .4 };
  const resize = { kind: 'resize', handle: 5, sx: 1.5, sy: 1, scaleStrokes: false, proportional: false, opposite: true };
  const once = transforms.repeatedTransform([s], s, resize)[0], twice = transforms.repeatedTransform([once], once, resize)[0];
  assert.ok(Math.abs(twice.width - 225) < 1e-7); assert.equal(twice.height, 80);
  close(m.toWorld({ x: -s.width / 2, y: 0 }, s), m.toWorld({ x: -twice.width / 2, y: 0 }, twice));
});


test('arc, torus and pacman retain editable depth geometry and round-trip storage',()=>{
  for(const type of ['arc','torus','pacman'])for(const depth of [0,.5,1]) {
    const s={...shape(type,type),depth,fill:'#ff9fda'};const anchors=m.shapeAnchors(s),points=m.flattenShape(s);
    assert.ok(anchors.length>=3);assert.ok(points.length<200);assert.ok(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
    const doc=m.emptyDocument();doc.objects=[s];assert.equal(m.restoreDocument(doc).objects[0]?.type,type);
    const scaled=m.scaledShape(s,1.8,.7,true);assert.equal(scaled.depth,depth);
  }
  const ring=shape('ring','torus');const points=m.flattenShape(ring);assert.equal(points.filter(p=>p.move).length,2);
  assert.equal(m.pointInPolygon({x:ring.x,y:ring.y},points),false,'ring center stays hollow');
  assert.ok(m.pointInPolygon({x:ring.x+ring.width*.4,y:ring.y},points));
  const anchors=m.shapeAnchors(ring),split=m.splitCurve(anchors,3,.5,true);assert.equal(split[4].contour,0);assert.equal(split[5].contour,1);
});

test('group isolation resolves selectable roots one level at a time',()=>{
  const doc=m.emptyDocument();doc.groups=[{id:'outer',layerId:'pane-1'},{id:'inner',parentId:'outer',layerId:'pane-1'}];
  const a={...shape('a'),groupId:'inner'},b={...shape('b'),groupId:'outer'},outside=shape('outside');doc.objects=[a,b,outside];
  assert.equal(d.isolationRoot(doc,a).id,'outer');assert.equal(d.isolationRoot(doc,a,'outer').id,'inner');assert.equal(d.isolationRoot(doc,a,'inner').id,'a');
  assert.ok(d.inIsolation(doc,a,'outer'));assert.ok(d.inIsolation(doc,a,'inner'));assert.equal(d.inIsolation(doc,b,'inner'),false);assert.equal(d.inIsolation(doc,outside,'outer'),false);
  doc.objects.push({...shape('second'),groupId:'inner'});assert.equal(d.groupContext(doc,new Set(['a','second']),'inner'),null,'isolation cannot create a third group level');
});
