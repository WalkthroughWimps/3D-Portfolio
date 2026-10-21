const ACTIONS = { 'shape-edit': ['A', 'A'], layers: ['F7', 'F7'], gears: ['G', 'G'], undo: ['Ctrl+Z', 'Control+Z Meta+Z'], redo: ['Ctrl+Shift+Z', 'Control+Shift+Z Meta+Shift+Z'], duplicate: ['Shift+D', 'Shift+D Control+J Meta+J'], delete: ['Del', 'Delete Backspace'] };
export function installShortcutLabels(panel) {
  for (const [name, [text, aria]] of Object.entries(ACTIONS)) {
    const button = panel.querySelector(`[data-action="${name}"]`); if (!button) continue;
    if (!button.querySelector('kbd')) { const badge = document.createElement('kbd'); badge.textContent = text; button.append(badge); }
    button.setAttribute('aria-keyshortcuts', aria); button.title = `${button.childNodes[0].textContent.trim()} (${text}; Ctrl also supports Cmd)`;
  }
  const duplicate = panel.querySelector('[data-action="duplicate"]');
  duplicate.title = 'Duplicate (Shift+D or Ctrl/Cmd+J)';
  panel.querySelector('[data-field="scale"]').setAttribute('aria-keyshortcuts', 'K');
  for (const [field, shortcut] of Object.entries({ weight: 'W', sides: 'Q', depth: 'B', smoothing: 'M', width: 'Shift+W', height: 'Shift+H', angle: 'T' })) {
    const input = panel.querySelector(`[data-field="${field}"]`);
    input.setAttribute('aria-keyshortcuts', shortcut); input.title = `${input.getAttribute('aria-label')} (${shortcut}; use arrow keys)`;
  }
  for (const [target, shortcut] of [['stroke', 'X'], ['fill', 'F']]) {
    const button = panel.querySelector(`[data-color-target="${target}"]`); button.title = `${target === 'stroke' ? 'Stroke' : 'Fill'} (${shortcut})`; button.setAttribute('aria-keyshortcuts', shortcut);
  }
  panel.querySelector('[data-color="none"]').title = 'No color (/)'; panel.querySelector('[data-color="none"]').setAttribute('aria-keyshortcuts', '/');
  const paletteKeys = '1234567890-'; panel.querySelectorAll('[data-color]:not([data-color="none"])').forEach((b, i) => { b.title += ` (Alt+Shift+${paletteKeys[i]})`; b.setAttribute('aria-keyshortcuts', `Alt+Shift+${paletteKeys[i]}`); });
}
export function handleEditorShortcut(event, api) {
  const { panel, doc, selection, layers, layerAction, action, chosen, single } = api;
  const command = event.ctrlKey || event.metaKey, key = event.key.toLowerCase(), active = doc.layers.find(l => l.id === doc.activeLayer);
  if (event.target?.closest?.('.notes-layer-tree') && !command && !event.altKey && layers.keydown(event)) return true;
  if (command && event.altKey && key === 'n') { layerAction('add'); return true; }
  if (event.altKey && !event.shiftKey && /^[1-3]$/.test(key)) { const layer = doc.layers[Number(key) - 1]; if (layer) layerAction(command ? 'move-layer' : 'activate', { id: layer.id }); return true; }
  if (command && ['[', ']'].includes(key)) { for (const node of layers.selectedRoots()) layerAction('reorder', { node, direction: key === ']' ? 1 : -1 }); return true; }
  if (event.key === 'F2') { if (panel.querySelector('[data-action="layers"]').getAttribute('aria-pressed') !== 'true') action('layers'); layers.rename(selection); return true; }
  if (!command && !event.altKey && event.shiftKey && key === 'k') { if (active) layerAction('lock', { id: active.id }); return true; }
  if (!command && !event.altKey && event.shiftKey && key === 'v') { if (active) layerAction('visibility', { id: active.id }); return true; }
  if (!command && !event.altKey && event.shiftKey && ['w', 'h'].includes(key)) {
    const field = key === 'w' ? 'width' : 'height', input = panel.querySelector(`[data-field="${field}"]`);
    if (!input.disabled) { panel.dataset.shortcutFocus = field; input.focus(); input.select(); if (document.activeElement === input) delete panel.dataset.shortcutFocus; } return true;
  }
  if (event.altKey && event.shiftKey && !command) {
    const index = '1234567890-'.indexOf(event.code.replace('Digit', '').replace('Minus', '-'));
    if (index !== -1) { const button = panel.querySelectorAll('[data-color]:not([data-color="none"])')[index]; if (button && !button.disabled) button.click(); return true; }
  }
  if (command || event.altKey || event.shiftKey) return false;
  if (key === 'k') { api.setScale(); return true; }
  if (key === 'x' || key === 'f') { if (key === 'x' || chosen().some(s => !['pencil', 'line'].includes(s.type)) || !single()) api.color(key === 'x' ? 'stroke' : 'fill'); return true; }
  if (key === '/') { api.noColor(); return true; }
  const field = { w: 'weight', q: 'sides', b: 'depth', m: 'smoothing', t: 'angle' }[key];
  if (field) { const input = panel.querySelector(`[data-field="${field}"]`); if (!input.disabled) { panel.dataset.shortcutFocus = field; input.focus(); if (document.activeElement === input) delete panel.dataset.shortcutFocus; if (input.type === 'number') input.select(); } return true; }
  return false;
}
