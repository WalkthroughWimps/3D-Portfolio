// History owns immutable geometry. The live document always receives a fresh copy.
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function same(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => same(a[key], b[key]));
}

export function createDrawingHistory({ maxEntries = 40, geometryBudget = 180000 } = {}) {
  const undo = [], redo = [];

  function geometryCount() {
    const arrays = new Set(); let count = 0;
    for (const state of [...undo, ...redo]) for (const shape of state.doc.objects) {
      for (const field of ['points', 'anchors']) {
        const array = shape[field];
        if (array && !arrays.has(array)) { arrays.add(array); count += array.length; }
      }
    }
    return count;
  }

  function trim() {
    while (undo.length + redo.length > maxEntries || geometryCount() > geometryBudget && undo.length + redo.length > 1) {
      // The bottom of undo is the oldest past state; the bottom of redo is
      // the furthest future state. Keep the nearest state in either direction.
      if (undo.length > 1 || !redo.length) undo.shift();
      else redo.shift();
    }
  }

  function capture(doc, metadata = {}) {
    const candidates = [...(undo.at(-1)?.doc.objects || []), ...(redo.at(-1)?.doc.objects || [])];
    const byId = new Map(candidates.map(shape => [shape.id, shape]));
    const document = copy({ ...doc, objects: [] });
    document.objects = doc.objects.map(shape => {
      const { points, anchors, ...rest } = shape;
      const metadata = copy(rest), result = {}, previous = byId.get(shape.id);
      for (const field of Object.keys(shape)) {
        if (field !== 'points' && field !== 'anchors') { result[field] = metadata[field]; continue; }
        const source = field === 'points' ? points : anchors;
        result[field] = previous?.[field] && same(source, previous[field]) ? previous[field] : copy(source);
      }
      return result;
    });
    return { doc: document, ...metadata };
  }

  function record(state) { undo.push(state); redo.length = 0; trim(); }
  function travel(direction, current) {
    const from = direction === 'undo' ? undo : redo, to = direction === 'undo' ? redo : undo;
    if (!from.length) return null;
    to.push(current);
    const state = from.pop();
    trim();
    return { ...state, doc: copy(state.doc), repeatAction: copy(state.repeatAction) };
  }

  return { capture, record, travel, get canUndo() { return undo.length > 0; }, get canRedo() { return redo.length > 0; },
    get stats() { return { undo: undo.length, redo: redo.length, uniqueGeometry: geometryCount() }; } };
}
