import { SIZE, RADIUS, distance, shapeAnchors, toWorld, add, subtract, rotate, flattenShape } from './drawing-model.js';
import { nodeVisible } from './drawing-document.js';

export function rotationTargets(doc, snaps) {
  if (!snaps.enabled) return [];
  const targets = [], seen = new Set();
  function addTarget(point, label, kind, objectId = null) {
    const key = `${point.x.toFixed(4)},${point.y.toFixed(4)}`;
    if (!seen.has(key)) { seen.add(key); targets.push({ x: point.x, y: point.y, label, kind, objectId }); }
  }
  if (snaps.pane) {
    addTarget({ x: SIZE / 2, y: SIZE / 2 }, 'Pane center', 'pane');
    ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'].forEach((label, i) => addTarget({ x: SIZE / 2 + RADIUS * Math.cos(i * Math.PI / 4), y: SIZE / 2 + RADIUS * Math.sin(i * Math.PI / 4) }, label, 'pane'));
  }
  for (const shape of doc.objects.filter(s => nodeVisible(doc, s))) {
    if (snaps.centers) addTarget(shape, `${shape.name} center`, 'center', shape.id);
    if (snaps.anchors && shape.type !== 'pencil') shapeAnchors(shape).forEach((point, i) => addTarget(toWorld(point, shape), `${shape.name} anchor ${i + 1}`, 'anchor', shape.id));
  }
  if (snaps.intersects) {
    // A fixed geometry budget keeps gear outlines and long pencil strokes from
    // turning target preparation into an unbounded pairwise search.
    const segments = [], limit = 1200;
    const visible = doc.objects.filter(s => nodeVisible(doc, s));
    const priority = shape => shape.type === 'line' ? 0 : shape.type === 'pencil' ? 2 : 1;
    for (const shape of visible.sort((a, b) => priority(a) - priority(b))) {
      if (segments.length >= limit) break;
      const budget = Math.min(300, limit - segments.length);
      let points;
      if (shape.type === 'pencil') {
        const raw = shape.points || [], step = Math.max(1, Math.ceil((raw.length - 1) / budget));
        points = [];
        for (let i = 0; i < raw.length; i += step) points.push({ ...toWorld(raw[i], shape), move: i === 0 });
        if (raw.length > 1 && (raw.length - 1) % step) points.push(toWorld(raw.at(-1), shape));
      } else {
        const anchorCount = shapeAnchors(shape).length;
        points = flattenShape(shape, Math.max(1, Math.min(8, Math.floor(budget / Math.max(1, anchorCount)))));
      }
      const stride = Math.max(1, Math.ceil((points.length - 1) / budget));
      let previous = null, index = 0, contour = -1;
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (point.move) {
          if (segments.at(-1)?.shapeId === shape.id) segments.at(-1).last = true;
          previous = point; index = 0; contour++; continue;
        }
        if (i % stride && i !== points.length - 1) continue;
        if (previous && distance(previous, point) > .001) segments.push({ a: previous, b: point, shapeId: shape.id, contour, index, first: index === 0 });
        index++;
        previous = point;
        if (segments.length >= limit) break;
      }
      if (segments.at(-1)?.shapeId === shape.id) segments.at(-1).last = true;
    }
    const buckets = new Map(), checked = new Set(), cell = 80;
    let comparisons = 0, intersections = 0;
    for (let i = 0; i < segments.length && comparisons < 120000 && intersections < 256; i++) {
      const segment = segments[i], minX = Math.max(-1, Math.floor(Math.min(segment.a.x, segment.b.x) / cell)), maxX = Math.min(13, Math.floor(Math.max(segment.a.x, segment.b.x) / cell));
      const minY = Math.max(-1, Math.floor(Math.min(segment.a.y, segment.b.y) / cell)), maxY = Math.min(13, Math.floor(Math.max(segment.a.y, segment.b.y) / cell));
      for (let x = minX; x <= maxX && comparisons < 120000 && intersections < 256; x++) for (let y = minY; y <= maxY && comparisons < 120000 && intersections < 256; y++) {
        const key = `${x},${y}`, bucket = buckets.get(key) || [];
        for (const j of bucket) {
          if (comparisons >= 120000 || intersections >= 256) break;
          const pair = `${j},${i}`;
          if (checked.has(pair)) continue;
          checked.add(pair);
          const other = segments[j];
          if (other.shapeId === segment.shapeId && other.contour === segment.contour &&
            (Math.abs(other.index - segment.index) <= 1 ||
              other.first && segment.last && distance(other.a, segment.b) < .001 ||
              segment.first && other.last && distance(segment.a, other.b) < .001)) continue;
          comparisons++;
          const ax = segment.b.x - segment.a.x, ay = segment.b.y - segment.a.y;
          const bx = other.b.x - other.a.x, by = other.b.y - other.a.y;
          const denominator = ax * by - ay * bx;
          if (Math.abs(denominator) < 1e-8) continue;
          const dx = other.a.x - segment.a.x, dy = other.a.y - segment.a.y;
          const t = (dx * by - dy * bx) / denominator, u = (dx * ay - dy * ax) / denominator;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          addTarget({ x: segment.a.x + t * ax, y: segment.a.y + t * ay }, 'Intersection', 'intersect');
          intersections++;
          if (intersections >= 256) break;
        }
        bucket.push(i); buckets.set(key, bucket);
      }
    }
  }
  return targets;
}
export function nearestRotationTarget(point, targets, tolerance) {
  if (!point) return null;
  let nearest = null, closest = tolerance;
  for (const target of targets) { const d = distance(point, target); if (d <= closest) { nearest = target; closest = d; } }
  return nearest;
}
export function rotateShapesAround(originals, pivot, angle) {
  return originals.map(shape => ({ ...shape, ...add(pivot, rotate(subtract(shape, pivot), angle)), rotation: shape.rotation + angle }));
}
export const angleStep = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export function rotationPaths(shapes, pivot, unit, hover, targets, dragging = null) {
  const paths = [], circle = (p, r, color, steps = 12) => paths.push({ color, points: Array.from({ length: steps + 1 }, (_, i) => ({ x: p.x + r * Math.cos(i * Math.PI * 2 / steps), y: p.y + r * Math.sin(i * Math.PI * 2 / steps) })) });
  const selectedIds = new Set(shapes.map(s => s.id));
  const pane = [], near = [], centers = [], anchors = [], reach = unit * unit * 25;
  for (const target of targets) {
    if (target.kind === 'pane') pane.push(target);
    else if (hover && (target.x - hover.x) ** 2 + (target.y - hover.y) ** 2 <= reach) { if (near.length < 96) near.push(target); }
    else if (selectedIds.has(target.objectId)) { const list = target.kind === 'center' ? centers : anchors; if (list.length < 96) list.push(target); }
  }
  for (const target of [...pane, ...near, ...centers, ...anchors].slice(0, 96)) circle(target, unit * (target.kind === 'pane' ? .45 : .25), '#9fc9d2');
  const radius = Math.max(unit * 4, ...shapes.map(s => distance(s, pivot) + Math.hypot(s.width, s.height) / 2 + unit));
  circle(pivot, radius, '#6d9da9', 96);
  const candidate = nearestRotationTarget(hover, targets, unit * 1.4);
  if (candidate && !dragging) circle(candidate, unit * .9, '#c7fff2');
  circle(pivot, unit * .85, '#ffd16b');
  paths.push({ color: '#ffd16b', points: [{ x: pivot.x - unit * 1.4, y: pivot.y }, { x: pivot.x + unit * 1.4, y: pivot.y }] }, { color: '#ffd16b', points: [{ x: pivot.x, y: pivot.y - unit * 1.4 }, { x: pivot.x, y: pivot.y + unit * 1.4 }] });
  if (dragging && hover) paths.push({ color: '#ffd16b', points: [pivot, hover] });
  return { paths, candidate };
}
