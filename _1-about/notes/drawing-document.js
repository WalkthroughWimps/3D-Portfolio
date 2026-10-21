import { boundsOf, clone, intersectsGlass } from './drawing-model.js';

export function children(doc, layerId, parentId = null) {
  return [...doc.groups.filter(g => g.layerId === layerId && (g.parentId || null) === parentId).map(g => ({ ...g, kind: 'group' })),
    ...doc.objects.filter(s => s.layerId === layerId && (s.groupId || null) === parentId).map(s => ({ ...s, kind: 'object' }))].sort((a, b) => a.order - b.order);
}
export function leaves(doc, node) {
  if (!node) return [];
  if (node.kind === 'object' || doc.objects.some(s => s.id === node.id)) return doc.objects.filter(s => s.id === node.id);
  return children(doc, node.layerId, node.id).flatMap(child => leaves(doc, child));
}
export function orderedObjects(doc) { return doc.layers.flatMap(l => children(doc, l.id).flatMap(n => leaves(doc, n))); }
export function layerEditable(doc, id) { const l = doc.layers.find(l => l.id === id); return Boolean(l?.visible && !l.locked); }
export function nodeVisible(doc, node) {
  if (!node || node.visible === false || !doc.layers.find(l => l.id === node.layerId)?.visible) return false;
  let parentId = node.groupId || node.parentId, guard = 0;
  while (parentId && guard++ < 3) {
    const parent = doc.groups.find(g => g.id === parentId);
    if (!parent || parent.visible === false) return false;
    parentId = parent.parentId;
  }
  return !parentId;
}
export const objectEditable = (doc, shape) => layerEditable(doc, shape.layerId) && nodeVisible(doc, shape);
export function rootForObject(doc, shape) {
  let node = { ...shape, kind: 'object' }, guard = 0;
  while ((node.groupId || node.parentId) && guard++ < 3) {
    const parent = doc.groups.find(g => g.id === (node.groupId || node.parentId)); if (!parent) break;
    node = { ...parent, kind: 'group' };
  }
  return node;
}
export function inIsolation(doc, shape, id) {
  if(!id)return true;if(!shape)return false;
  let parent=shape.groupId||shape.parentId;
  for(let i=0;parent&&i<3;i++){if(parent===id)return true;parent=doc.groups.find(g=>g.id===parent)?.parentId;}
  return false;
}
export function isolationRoot(doc, shape, id=null) {
  if(!id)return rootForObject(doc,shape);
  let node={...shape,kind:'object'};
  for(let i=0;i<3;i++) {const parent=node.groupId||node.parentId;if(!parent||parent===id)break;const group=doc.groups.find(g=>g.id===parent);if(!group)break;node={...group,kind:'group'};}
  return node;
}
export function selectionRoots(doc, selection, scope = null) {
  const result = [];
  function visit(node) {
    const items = leaves(doc, node);
    if (items.length && items.every(s => selection.has(s.id))) result.push(node);
    else if (node.kind === 'group') children(doc, node.layerId, node.id).forEach(visit);
  }
  if(scope){const group=doc.groups.find(g=>g.id===scope);if(group)children(doc,group.layerId,scope).forEach(visit);}else doc.layers.forEach(l => children(doc, l.id).forEach(visit));
  return result;
}
export function recoverOffPane(doc, originals, selection) {
  const before = new Map(originals.map(s => [s.id, s])), restored = [];
  for (const root of selectionRoots(doc, selection)) {
    const members = leaves(doc, root).filter(s => before.has(s.id));
    if (!members.length || members.some(s => nodeVisible(doc, s) && intersectsGlass(s))) continue;
    for (const shape of members) { Object.assign(shape, clone(before.get(shape.id))); restored.push(shape); }
  }
  return restored;
}
function subtreeDepth(doc, node) {
  return node.kind !== 'group' ? 0 : 1 + Math.max(0, ...children(doc, node.layerId, node.id).map(n => subtreeDepth(doc, n)));
}
export function groupContext(doc, selection, scope = null) {
  const roots = selectionRoots(doc, selection, scope);
  if (roots.length < 2) return null;
  const layerId = roots[0].layerId, parentId = roots[0].parentId || roots[0].groupId || null;
  if (!layerEditable(doc, layerId) || roots.some(n => n.layerId !== layerId || (n.parentId || n.groupId || null) !== parentId)) return null;
  let ancestors = 0, ancestor = parentId;
  while(ancestor && ancestors < 3) { ancestors++; ancestor=doc.groups.find(g=>g.id===ancestor)?.parentId; }
  if (ancestors + 1 + Math.max(...roots.map(n => subtreeDepth(doc, n))) > 2) return null;
  return { roots, layerId, parentId };
}
export function groupSelection(doc, selection, scope = null) {
  const context = groupContext(doc, selection, scope); if (!context) return null;
  const group = { id: crypto.randomUUID(), name: 'Group', layerId: context.layerId, parentId: context.parentId, order: Math.max(...context.roots.map(n => n.order)) };
  doc.groups.push(group);
  for (const node of context.roots) {
    if (node.kind === 'group') doc.groups.find(g => g.id === node.id).parentId = group.id;
    else doc.objects.find(s => s.id === node.id).groupId = group.id;
  }
  return group;
}
export function ungroupSelection(doc, selection, scope = null) {
  const roots = selectionRoots(doc, selection, scope).filter(n => n.kind === 'group');
  for (const node of roots) {
    children(doc, node.layerId, node.id).forEach(child => {
      if (child.kind === 'group') doc.groups.find(g => g.id === child.id).parentId = node.parentId;
      else doc.objects.find(s => s.id === child.id).groupId = node.parentId;
    });
    doc.groups = doc.groups.filter(g => g.id !== node.id);
  }
  return roots.length > 0;
}
export function pruneGroups(doc) {
  for (let i = 0; i < 3; i++) doc.groups = doc.groups.filter(g => children(doc, g.layerId, g.id).length);
}
export function selectionBounds(doc, selection) { return boundsOf(doc.objects.filter(s => selection.has(s.id))); }
export function moveSelectionToLayer(doc, selection, layerId) {
  if (!layerEditable(doc, layerId)) return false;
  const roots = selectionRoots(doc, selection);
  const offset = Math.max(0, ...children(doc, layerId).map(n => n.order)) + 1;
  roots.forEach((node, i) => {
    const members = leaves(doc, node);
    members.forEach(s => { s.layerId = layerId; });
    if (node.kind === 'object') { const s = doc.objects.find(s => s.id === node.id); s.groupId = null; s.order = offset + i; }
    else {
      const group = doc.groups.find(g => g.id === node.id); group.layerId = layerId; group.parentId = null; group.order = offset + i;
      doc.groups.filter(g => g.parentId === node.id).forEach(g => { g.layerId = layerId; });
    }
  });
  pruneGroups(doc); return true;
}
export function duplicateSelection(doc, selection, offset = { x: 20, y: 20 }, scope = null) {
  const roots = selectionRoots(doc, selection, scope), mapping = new Map(), added = [];
  if (doc.objects.length + doc.objects.filter(s => selection.has(s.id)).length > 300) return selection;
  function copy(node, parentId = null) {
    if (node.kind === 'group') {
      const group = clone(doc.groups.find(g => g.id === node.id)); group.id = crypto.randomUUID(); mapping.set(node.id, group.id);
      group.parentId = parentId; group.name += ' copy'; group.order += .5; doc.groups.push(group);
      children(doc, node.layerId, node.id).forEach(child => copy(child, group.id));
    } else {
      const s = clone(doc.objects.find(s => s.id === node.id)); s.id = crypto.randomUUID(); s.name += ' copy'; s.x += offset.x; s.y += offset.y;
      s.groupId = parentId; s.order += .5; doc.objects.push(s); added.push(s.id);
    }
  }
  roots.forEach(root => copy(root, root.parentId || root.groupId || null));
  return new Set(added);
}
export function reorderNode(doc, node, direction) {
  const siblings = children(doc, node.layerId, node.parentId || node.groupId || null), index = siblings.findIndex(n => n.id === node.id), other = siblings[index + direction];
  if (!other) return;
  const find = n => n.kind === 'group' ? doc.groups.find(g => g.id === n.id) : doc.objects.find(s => s.id === n.id);
  const orders = siblings.map((_, i) => i); siblings.forEach((s, i) => { find(s).order = orders[i]; });
  const a = find(node), b = find(other), order = a.order; a.order = b.order; b.order = order;
}

// beforeId is the next entry in the displayed (top-to-bottom) stack; null
// appends at the bottom. Pane-header drops pass the first root as beforeId.
export function placeNodes(doc, ids, { layerId, parentId = null, beforeId = null }) {
  if (!layerEditable(doc, layerId) || !ids.length) return false;
  const lookup = id => { const group = doc.groups.find(g => g.id === id); return group ? { ...group, kind: 'group' } : doc.objects.find(s => s.id === id) ? { ...doc.objects.find(s => s.id === id), kind: 'object' } : null; };
  const nodes = ids.map(lookup); if (nodes.some(n => !n || !layerEditable(doc, n.layerId))) return false;
  const moving = new Set(ids); let ancestor = parentId, depth = 0;
  while (ancestor) { const group = doc.groups.find(g => g.id === ancestor); if (!group || group.layerId !== layerId || moving.has(ancestor) || depth++ >= 2) return false; ancestor = group.parentId; }
  if (nodes.some(n => depth + subtreeDepth(doc, n) > 2)) return false;
  // Reject overlapping source roots; moving a group already carries its children.
  if (nodes.some(n => { let p = n.parentId || n.groupId; while (p) { if (moving.has(p)) return true; p = doc.groups.find(g => g.id === p)?.parentId; } return false; })) return false;
  const peers = children(doc, layerId, parentId).reverse().filter(n => !moving.has(n.id));
  const index = beforeId ? peers.findIndex(n => n.id === beforeId) : peers.length;
  if (index < 0) return false;
  const before = JSON.stringify([doc.objects, doc.groups]);
  function moveTree(node) {
    if (node.kind === 'group') {
      const group = doc.groups.find(g => g.id === node.id), nested = children(doc, group.layerId, group.id); group.layerId = layerId; nested.forEach(moveTree);
    } else doc.objects.find(s => s.id === node.id).layerId = layerId;
  }
  nodes.forEach(node => { moveTree(node); if (node.kind === 'group') doc.groups.find(g => g.id === node.id).parentId = parentId; else doc.objects.find(s => s.id === node.id).groupId = parentId; });
  peers.splice(index, 0, ...nodes);
  peers.forEach((n, i) => { const record = n.kind === 'group' ? doc.groups.find(g => g.id === n.id) : doc.objects.find(s => s.id === n.id); record.order = peers.length - i; });
  pruneGroups(doc); return before !== JSON.stringify([doc.objects, doc.groups]);
}
