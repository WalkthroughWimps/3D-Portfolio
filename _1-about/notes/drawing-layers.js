import { reorderSlot } from '../../_7-shared-scripts/panel-assembly/StableReorder.mjs';
import { children, leaves, groupContext, selectionRoots, layerEditable, nodeVisible, inIsolation, objectEditable } from './drawing-document.js';

export function createLayersPanel({ getDocument, getSelection, getIsolation = () => null, onSelect, onAction }) {
  const panel = document.createElement('section'); panel.className = 'notes-layers'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Drawing layers');
  panel.innerHTML = '<header><h2>Layers</h2><div class="notes-layer-header-actions"><button class="notes-layer-add" type="button" data-layer-action="add">+ Pane</button><button type="button" data-layer-action="close" aria-label="Close layers">×</button></div></header><div class="notes-layer-tree" role="tree" aria-label="Glass panes and objects"></div><footer><div class="notes-layer-actions"><button type="button" data-layer-action="group" title="Group (Ctrl/Cmd+G)">Group</button><button type="button" data-layer-action="ungroup" title="Ungroup (Ctrl/Cmd+Shift+G)">Ungroup</button></div><button type="button" class="notes-clear" data-layer-action="clear">Clear pane</button></footer>';
  const expanded = new Set(), collapsedPanes = new Set(), tree = panel.querySelector('.notes-layer-tree'), panes = tree; let signature = '', pendingRename = false, pointer = null, suppressClick = false;
  const control = new AbortController();
  const toolbar = document.createElement('div'); toolbar.className = 'notes-layer-toolbar'; toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', 'Active pane and selection');
  for (const [action, label, shortcut] of [['active-visibility', 'Visibility', 'Shift+V'], ['active-lock', 'Lock', 'Shift+K'], ['rename', 'Rename', 'F2'], ['active-delete', 'Remove pane', '']]) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.layerAction = action; b.append(document.createTextNode(label)); const kbd = document.createElement('kbd'); kbd.textContent = shortcut; b.append(kbd); b.setAttribute('aria-keyshortcuts', shortcut.replace('Ctrl', 'Control')); b.title = shortcut ? `${label} (${shortcut})` : label; kbd.remove(); toolbar.append(b);
  }
  panel.querySelector('footer').before(toolbar);
  function button(text, label, callback, disabled = false) {
    const el = document.createElement('button'); el.type = 'button'; el.textContent = text; el.title = label; el.setAttribute('aria-label', label); el.disabled = disabled;
    el.addEventListener('click', event => { event.stopPropagation(); callback(); }); return el;
  }
  function nameField(parent, record, kind) {
    const span = document.createElement('span'); span.className = 'notes-layer-name'; span.textContent = record.name; span.title = record.name;
    span.addEventListener('dblclick', event => {
      event.stopPropagation(); const field = document.createElement('input'); field.className = 'notes-layer-name'; field.value = record.name; field.maxLength = 60;
      field.setAttribute('aria-label', `Rename ${record.name}`); field.addEventListener('click', e => e.stopPropagation());
      let escaped = false;
      field.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); field.blur(); } if (e.key === 'Escape') { escaped = true; e.preventDefault(); field.blur(); } });
      field.addEventListener('blur', () => { const value = field.value.trim().slice(0, 60) || record.name; if (!escaped && value !== record.name) onAction('rename', { kind, id: record.id, name: value }); signature = ''; update(); });
      span.replaceWith(field); field.focus(); field.select();
    }); parent.append(span);
  }
  function update() {
    const doc = getDocument(), selection = getSelection();
    const active = doc.layers.find(l => l.id === doc.activeLayer);
    toolbar.querySelector('[data-layer-action="active-visibility"]').setAttribute('aria-pressed', String(active?.visible));
    toolbar.querySelector('[data-layer-action="active-lock"]').setAttribute('aria-pressed', String(active?.locked));
    toolbar.querySelector('[data-layer-action="active-delete"]').disabled = doc.layers.length <= 1;
    panel.querySelector('[data-layer-action="add"]').disabled = doc.layers.length >= 3;
    panel.querySelector('[data-layer-action="group"]').disabled = !groupContext(doc, selection, getIsolation());
    panel.querySelector('[data-layer-action="ungroup"]').disabled = !selectionRoots(doc, selection, getIsolation()).some(n => n.kind === 'group');
    panel.querySelector('[data-layer-action="clear"]').disabled = !layerEditable(doc, doc.activeLayer) || !doc.objects.some(s => s.layerId === doc.activeLayer);
    tree.querySelectorAll('.notes-layer-row').forEach(row => {
      const ids = JSON.parse(row.dataset.members || '[]'), selected = ids.length > 0 && ids.every(id => selection.has(id));
      row.classList.toggle('is-selected', selected); row.classList.toggle('is-isolation-muted', Boolean(getIsolation() && !JSON.parse(row.dataset.members||'[]').some(id=>inIsolation(doc,doc.objects.find(s=>s.id===id),getIsolation())))); row.parentElement.setAttribute('aria-selected', String(selected));
    });
    const next = JSON.stringify({ layers: doc.layers, active: doc.activeLayer, groups: doc.groups, objects: doc.objects.map(s => [s.id, s.name, s.layerId, s.groupId, s.order, s.visible]), isolation:getIsolation(), expanded: [...expanded], collapsedPanes: [...collapsedPanes] });
    if (pointer?.dragging || next === signature || panel.querySelector('.notes-layer-name:focus')?.tagName === 'INPUT') { if (pendingRename) renameNow(); return; }
    const focusedVisibility = tree.contains(document.activeElement) ? document.activeElement.dataset.visibilityId : null;
    signature = next; tree.replaceChildren();
    function renderNode(node, depth, container) {
      const wrap = document.createElement('div'); wrap.className = 'notes-tree-node'; wrap.tabIndex = 0; wrap.dataset.nodeId = node.id; wrap.setAttribute('role', 'treeitem'); wrap.setAttribute('aria-level', String(depth + 1));
      const members = leaves(doc, node), selected = members.length && members.every(s => selection.has(s.id)); wrap.setAttribute('aria-selected', String(Boolean(selected)));
      const row = document.createElement('div'); row.className = 'notes-layer-row'; row.style.setProperty('--depth', depth);
      row.dataset.nodeId = node.id; row.dataset.layerId = node.layerId; row.dataset.parentId = node.parentId || node.groupId || '';
      row.dataset.members = JSON.stringify(members.map(s => s.id));
      row.classList.toggle('is-selected', Boolean(selected)); row.classList.toggle('is-isolation-muted', Boolean(getIsolation() && !members.some(s=>inIsolation(doc,s,getIsolation())))); row.classList.toggle('is-locked', !layerEditable(doc, node.layerId));
      row.classList.toggle('is-hidden', !nodeVisible(doc, node));
      if (node.kind === 'group') {
        wrap.setAttribute('aria-expanded', String(expanded.has(node.id)));
        const disclosure=button('', `${expanded.has(node.id) ? 'Collapse' : 'Expand'} ${node.name}`, () => { expanded.has(node.id) ? expanded.delete(node.id) : expanded.add(node.id); update(); });disclosure.className='notes-group-disclosure';disclosure.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${expanded.has(node.id)?'M5 8l7 7 7-7':'M8 5l7 7-7 7'}"/></svg>`;row.append(disclosure);
      } else { const spacer = document.createElement('span'); spacer.className = 'notes-layer-spacer'; spacer.setAttribute('aria-hidden', 'true'); row.append(spacer); }
      nameField(row, node, node.kind);
      const visibility = button(node.visible === false ? '○' : '◉', `${node.visible === false ? 'Show' : 'Hide'} ${node.name}`, () => onAction('node-visibility', { kind: node.kind, id: node.id }));
      visibility.className = 'notes-entity-visibility'; visibility.dataset.visibilityId = node.id; visibility.setAttribute('aria-pressed', String(node.visible !== false)); row.append(visibility);
      row.addEventListener('click', event => { if (layerEditable(doc, node.layerId)) onSelect(members.filter(s => objectEditable(doc, s)).map(s => s.id), event.shiftKey); });
      wrap.append(row);
      if (node.kind === 'group' && expanded.has(node.id)) { const nested = document.createElement('div'); nested.setAttribute('role', 'group'); children(doc, node.layerId, node.id).reverse().forEach(child => renderNode(child, depth + 1, nested)); wrap.append(nested); }
      container.append(wrap);
    }
    [...doc.layers].reverse().forEach(layer => {
      const section = document.createElement('section'); section.className = 'notes-pane'; section.dataset.layerId = layer.id; section.setAttribute('aria-label', `${layer.name} contents`); const row = document.createElement('div'); row.className = 'notes-pane-row'; row.dataset.layerId = layer.id; row.classList.toggle('is-active', doc.activeLayer === layer.id);
      row.append(button('▰', `Activate ${layer.name}`, () => onAction('activate', { id: layer.id })));
      const disclosure = button(collapsedPanes.has(layer.id) ? '▸' : '▾', `${collapsedPanes.has(layer.id) ? 'Expand' : 'Collapse'} ${layer.name}`, () => { collapsedPanes.has(layer.id) ? collapsedPanes.delete(layer.id) : collapsedPanes.add(layer.id); update(); }); disclosure.setAttribute('aria-expanded', String(!collapsedPanes.has(layer.id))); row.append(disclosure);
      nameField(row, layer, 'layer');
      const visibility=button(layer.visible?'◉':'○',`${layer.visible?'Hide':'Show'} ${layer.name}`,()=>onAction('visibility',{id:layer.id}));
      const lock=button('',`${layer.locked?'Unlock':'Lock'} ${layer.name}`,()=>onAction('lock',{id:layer.id}));lock.className='notes-pane-lock';lock.setAttribute('aria-pressed',String(layer.locked));
      lock.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path data-lock-body d="M7 10h10a2 2 0 012 2v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7a2 2 0 012-2Z"/><path d="${layer.locked?'M8 10V7a4 4 0 018 0v3':'M8 10V7a4 4 0 018 0'}"/><path d="M12 14v3"/></svg>`;
      const remove=button('×',`Delete ${layer.name}`,()=>onAction('delete-layer',{id:layer.id}),doc.layers.length<=1);remove.className='notes-pane-delete';
      row.append(visibility,lock,remove);
      row.addEventListener('click', () => onAction('activate', { id: layer.id })); section.append(row);
      const contents = document.createElement('div'); contents.className = 'notes-pane-objects'; contents.hidden = collapsedPanes.has(layer.id); contents.setAttribute('role', 'group'); contents.setAttribute('aria-label', `${layer.name} objects`);
      children(doc, layer.id).reverse().forEach(node => renderNode(node, 0, contents));
      if (!contents.children.length) { const empty = document.createElement('div'); empty.className = 'notes-pane-empty'; empty.textContent = 'Empty pane'; contents.append(empty); }
      section.append(contents); tree.append(section);
    });
    panes.querySelectorAll('.notes-pane-row').forEach((row, i) => {
      const index = doc.layers.length - i;
      const buttons = row.querySelectorAll('button');
      [[0, `Alt+${index}`], [2, 'Shift+V'], [3, 'Shift+K'], [4, '']].forEach(([n, shortcut]) => { if (shortcut) buttons[n].title += ` (${shortcut})`; buttons[n].setAttribute('aria-keyshortcuts', shortcut.replace('Ctrl', 'Control')); });
      row.querySelector('.notes-layer-name').title += ' (F2)';
    });
    tree.querySelectorAll('.notes-layer-row .notes-layer-name').forEach(name=>{name.title+=' (F2)';});
    if (pendingRename) renameNow();
    else if (focusedVisibility) [...tree.querySelectorAll('[data-visibility-id]')].find(button => button.dataset.visibilityId === focusedVisibility)?.focus({ preventScroll: true });
  }
  function renameNow() {
    pendingRename = false;
    const name = tree.querySelector('.notes-layer-row.is-selected .notes-layer-name') || panes.querySelector('.notes-pane-row.is-active .notes-layer-name');
    name?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  }
  const footerKeys = { add: 'Ctrl+Alt+N', group: 'Ctrl+G', ungroup: 'Ctrl+Shift+G', close: 'F7' };
  panel.querySelectorAll('[data-layer-action]').forEach(button => { const shortcut = footerKeys[button.dataset.layerAction]; if (!shortcut) return; const badge = document.createElement('kbd'); badge.textContent = shortcut; if (button.dataset.layerAction === 'add') badge.textContent = ''; else if (button.dataset.layerAction !== 'close') button.title = `${button.textContent} (${shortcut})`; button.setAttribute('aria-keyshortcuts', shortcut.replace('Ctrl', 'Control')); button.title = `${button.textContent} (${shortcut}; Ctrl also supports Cmd)`; });
  
  panel.addEventListener('click', event => {
    const action = event.target.closest('[data-layer-action]')?.dataset.layerAction;
    if (action === 'rename') { pendingRename = true; update(); }
    else if (action?.startsWith('active-')) onAction({ 'active-visibility': 'visibility', 'active-lock': 'lock', 'active-delete': 'delete-layer' }[action], { id: getDocument().activeLayer });
    else if (action === 'raise' || action === 'lower') selectionRoots(getDocument(), getSelection()).forEach(node => onAction('reorder', { node, direction: action === 'raise' ? 1 : -1 }));
    else if (action) onAction(action);
  }, { signal: control.signal });

  const rect = row => { const r = row.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height, left: r.left, right: r.right }; };
  panel.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button,input')) return;
    const row = event.target.closest('.notes-layer-row,.notes-pane-row'); if (!row) return;
    const doc = getDocument(); if (row.dataset.nodeId && !layerEditable(doc, row.dataset.layerId)) return;
    pointer = { id: event.pointerId, row, x: event.clientX, y: event.clientY, dragging: false };
  }, { signal: control.signal });
  panel.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId || !(event.buttons & 1)) return;
    if (!pointer.dragging && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6) return;
    if (!pointer.dragging) {
      pointer.dragging = true; suppressClick = true; if(event.isTrusted)pointer.row.setPointerCapture(event.pointerId);
      pointer.rows = [...panel.querySelectorAll('.notes-layer-row,.notes-pane-row')].filter(row => row.getClientRects().length).map(row => ({ row, ...rect(row) }));
      pointer.scroll = tree.scrollTop; pointer.paneDrag = !pointer.row.dataset.nodeId;
      const doc = getDocument(), members = JSON.parse(pointer.row.dataset.members || '[]');
      pointer.ids = members.length && members.every(id => getSelection().has(id)) ? selectionRoots(doc, getSelection()).map(n => n.id) : [pointer.row.dataset.nodeId];
      pointer.row.classList.add('is-dragging');
    }
    event.preventDefault();
    const source = pointer.rows.find(r => r.row === pointer.row), delta = tree.scrollTop - pointer.scroll;
    pointer.row.style.transform = `translateY(${event.clientY - pointer.y + delta}px)`;
    pointer.row.style.pointerEvents = 'none';
    pointer.rows.forEach(r => { if (r.row !== pointer.row) r.row.style.transform = ''; r.row.classList.remove('is-drop-target'); });
    const y = event.clientY, view = tree.getBoundingClientRect(), paneTarget = y >= view.top && y <= view.bottom ? pointer.rows.find(r => !r.row.dataset.nodeId && y + delta >= r.top && y + delta < r.bottom && event.clientX >= r.left && event.clientX <= r.right) : null;
    pointer.drop = null;
    if (pointer.paneDrag) {
      const others = pointer.rows.filter(r => !r.row.dataset.nodeId && r.row !== pointer.row), slot = reorderSlot(others, y + delta);
      pointer.drop = { pane: true, id: pointer.row.dataset.layerId, beforeId: others[slot]?.row.dataset.layerId || null };
      const old = pointer.rows.filter(r => !r.row.dataset.nodeId).indexOf(source);
      others.forEach((r, i) => { const shift = i < slot && r.top > source.top ? -source.height - 4 : i >= slot && r.top < source.top ? source.height + 4 : 0; r.row.style.transform = shift ? `translateY(${shift}px)` : ''; });
      if (slot === old) pointer.drop = null;
    } else if (paneTarget) {
      const layerId = paneTarget.row.dataset.layerId, top = children(getDocument(), layerId).reverse().find(n => !pointer.ids.includes(n.id));
      pointer.drop = { ids: pointer.ids, layerId, parentId: null, beforeId: top?.id || null }; paneTarget.row.classList.add('is-drop-target');
    } else {
      const hit = pointer.rows.filter(r => r.row.dataset.nodeId && !pointer.ids.includes(r.row.dataset.nodeId));
      const nearest = hit.find(r => y + delta < r.bottom) || hit.at(-1);
      if (nearest && event.clientX >= nearest.left && event.clientX <= nearest.right && y >= tree.getBoundingClientRect().top && y <= tree.getBoundingClientRect().bottom) {
        const peers = hit.filter(r => r.row.dataset.layerId === nearest.row.dataset.layerId && r.row.dataset.parentId === nearest.row.dataset.parentId), slot = reorderSlot(peers, y + delta);
        pointer.drop = { ids: pointer.ids, layerId: nearest.row.dataset.layerId, parentId: nearest.row.dataset.parentId || null, beforeId: peers[slot]?.row.dataset.nodeId || null };
        peers.forEach((r, i) => { const shift = r.top > source.top && i < slot ? -source.height : r.top < source.top && i >= slot ? source.height : 0; r.row.style.transform = shift ? `translateY(${shift}px)` : ''; });
        nearest.row.classList.add('is-drop-target');
      }
    }
    const bounds = tree.getBoundingClientRect(); if (y > bounds.bottom - 20 && y < bounds.bottom + 10) tree.scrollTop += 8; else if (y < bounds.top + 20 && y > bounds.top - 10) tree.scrollTop -= 8;
  }, { signal: control.signal });
  function finishDrop(cancel = false) {
    if (!pointer) return; const current = pointer; pointer = null;
    if (!current.dragging) return;
    current.rows?.forEach(({ row }) => { row.style.transform = ''; row.style.pointerEvents = ''; row.classList.remove('is-dragging', 'is-drop-target'); });
    if (current.row.hasPointerCapture?.(current.id)) current.row.releasePointerCapture(current.id);
    if (!cancel && current.drop) onAction(current.drop.pane ? 'reorder-pane' : 'drop-nodes', current.drop);
    signature = ''; update(); setTimeout(() => { suppressClick = false; }, 0);
  }
  panel.addEventListener('pointerup', () => finishDrop(), { signal: control.signal });
  panel.addEventListener('pointercancel', () => finishDrop(true), { signal: control.signal });
  panel.addEventListener('lostpointercapture', () => finishDrop(true), { signal: control.signal });
  panel.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); } }, { capture: true, signal: control.signal });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape' && pointer) { finishDrop(true); event.preventDefault(); event.stopPropagation(); } }, { signal: control.signal });
  return { panel, update, rename() { pendingRename = true; update(); }, selectedRoots() { return selectionRoots(getDocument(), getSelection()); },
    keydown(event) {
      const item = event.target.closest('.notes-tree-node'); if (!item) return false;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        const toggle = item.querySelector('.notes-layer-row button');
        if (item.hasAttribute('aria-expanded') && (item.getAttribute('aria-expanded') === 'true') !== (event.key === 'ArrowRight')) toggle.click();
        return true;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const items = [...tree.querySelectorAll('.notes-tree-node')], next = items[items.indexOf(item) + (event.key === 'ArrowDown' ? 1 : -1)]; next?.focus(); return true;
      }
      if (event.key === 'Enter' || event.code === 'Space') { item.querySelector('.notes-layer-row').click(); return true; }
      return false;
    }, dispose() { finishDrop(true); control.abort(); panel.remove(); } };
}
