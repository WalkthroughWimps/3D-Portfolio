import { SIZE, RADIUS, add, boundsOf, shapeAnchors, toWorld, onGlass, RESIZE_HANDLES, resizeShapes } from './drawing-model.js';
import { rotationTargets, rotateShapesAround } from './drawing-rotation.js';
import { selectionRoots, leaves } from './drawing-document.js';

export const ALIGNMENTS = [
  ['left', 'Align left', 'M4 3v18 M8 6h12v4H8z M8 14h8v4H8z'],
  ['center-x', 'Align horizontal centers', 'M12 2v20 M4 6h16v4H4z M7 14h10v4H7z'],
  ['right', 'Align right', 'M20 3v18 M4 6h12v4H4z M8 14h8v4H8z'],
  ['bottom', 'Align bottom', 'M3 20h18 M6 4h4v12H6z M14 8h4v8h-4z'],
  ['center-y', 'Align vertical centers', 'M2 12h20 M6 4h4v16H6z M14 7h4v10h-4z'],
  ['top', 'Align top', 'M3 4h18 M6 8h4v12H6z M14 8h4v8h-4z']
];

export function alignedObjects(doc, selection, mode) {
  const sets = selectionRoots(doc, selection).map(root => leaves(doc, root));
  if (!sets.length) return [];
  const all = sets.flat(), target = sets.length === 1 ? { left: SIZE / 2 - RADIUS, right: SIZE / 2 + RADIUS, top: SIZE / 2 - RADIUS, bottom: SIZE / 2 + RADIUS, x: SIZE / 2, y: SIZE / 2 } : boundsOf(all);
  return sets.flatMap(members => {
    const box = boundsOf(members), delta = { x: 0, y: 0 };
    if (mode === 'left' || mode === 'right') delta.x = target[mode] - box[mode];
    if (mode === 'top' || mode === 'bottom') delta.y = target[mode] - box[mode];
    if (mode === 'center-x') delta.x = target.x - box.x;
    if (mode === 'center-y') delta.y = target.y - box.y;
    return members.map(shape => ({ ...shape, ...add(shape, delta) }));
  });
}

export function moveSnapIndex(doc, originals, frame, snaps) {
  const ids = new Set(originals.map(s => s.id));
  const targets = rotationTargets({ ...doc, objects: doc.objects.filter(s => !ids.has(s.id)) }, snaps).filter(onGlass);
  const points = [{ x: frame.x, y: frame.y }, ...RESIZE_HANDLES.map(([x, y]) => toWorld({ x: x * frame.width / 2, y: y * frame.height / 2 }, frame))];
  if (snaps.anchors && originals.length === 1 && originals[0].type !== 'pencil') points.push(...shapeAnchors(originals[0]).map(p => toWorld(p, originals[0])));
  return { points, x: [...targets].sort((a, b) => a.x - b.x), y: [...targets].sort((a, b) => a.y - b.y) };
}
function axisSnap(axis, index, delta, tolerance, previous) {
  if (previous && Math.abs(previous.target[axis] - previous.source[axis] - delta[axis]) <= tolerance * 1.5) return previous;
  const targets = index[axis]; let best = null, closest = tolerance;
  for (const source of index.points) {
    const value = source[axis] + delta[axis]; let low = 0, high = targets.length;
    while (low < high) { const middle = (low + high) >>> 1; if (targets[middle][axis] < value) low = middle + 1; else high = middle; }
    for (const i of [low - 1, low]) {
      const target = targets[i]; if (!target) continue;
      const distance = Math.abs(target[axis] - value);
      if (distance < closest) { closest = distance; best = { source, target }; }
    }
  }
  return best;
}
export function snappedMove(index, delta, tolerance, previous = null) {
  const x = axisSnap('x', index, delta, tolerance, previous?.x), y = axisSnap('y', index, delta, tolerance, previous?.y);
  return { x, y, delta: { x: x ? x.target.x - x.source.x : delta.x, y: y ? y.target.y - y.source.y : delta.y } };
}
export function moveSnapPaths(snap, unit) {
  if (!snap) return [];
  return ['x', 'y'].filter(axis => snap[axis]).flatMap(axis => {
    const { source, target } = snap[axis], moved = add(source, snap.delta), r = unit * .65;
    return [{ color: '#ffd16b', points: [moved, target] }, { color: '#c7fff2', points: [{ x: target.x - r, y: target.y }, { x: target.x + r, y: target.y }] }, { color: '#c7fff2', points: [{ x: target.x, y: target.y - r }, { x: target.x, y: target.y + r }] }];
  });
}

export function repeatedTransform(originals, frame, operation) {
  if (operation.kind === 'move') return originals.map(shape => ({ ...shape, ...add(shape, operation.delta) }));
  if (operation.kind === 'rotate') return rotateShapesAround(originals, operation.pivot, operation.angle);
  if (operation.kind === 'resize') {
    const [x, y] = RESIZE_HANDLES[operation.handle], fixed = operation.opposite ? toWorld({ x: -x * frame.width / 2, y: -y * frame.height / 2 }, frame) : frame;
    const span = operation.opposite ? 1 : .5, point = toWorld({ x: x * frame.width * operation.sx * span, y: y * frame.height * operation.sy * span }, { ...frame, x: fixed.x, y: fixed.y });
    return resizeShapes(originals, frame, operation.handle, point, operation.scaleStrokes, operation.proportional, operation.opposite);
  }
  return originals;
}
