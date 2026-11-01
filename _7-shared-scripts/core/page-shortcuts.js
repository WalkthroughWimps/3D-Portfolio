import { mountCollapsibleSections } from '../panel-assembly/CollapsibleSections.mjs';
import { createKeyboardActions, isInteractiveKeyboardTarget } from './keyboard-actions.js';

// One action per row. | separates alternatives; + joins a chord.
const PAGE_SHORTCUTS = {
  start: [
    { title: 'Settings', rows: [
      ['Open audio settings', 'A'], ['Open visual settings', 'V'],
      ['Adjust the selected control', 'Arrow keys']
    ] }
  ],
  about: [
    { title: 'Cube', note: 'Mouse controls work on the cube. Editing keys work only on the face facing you.', rows: [
      ['Focus a point', 'Middle click'], ['Pan', 'Middle drag'], ['Reset focus', 'Double middle click'],
      ['Rotate', 'Right drag'], ['Face the cube left or right', 'L | R'],
      ['Face the cube up or down', 'U | D'], ['Face the cube upright', 'Double right click'],
      ['Zoom', 'Wheel']
    ] },
    { title: 'Oddio face', note: 'Available while Oddio faces you and its controls are unlocked.', rows: [
      ['Play or stop', 'Space'], ['Remove selected clip', 'Delete | Backspace'],
      ['Copy', 'Mod + C'], ['Cut', 'Mod + X'], ['Paste at playhead', 'Mod + V'],
      ['Duplicate on the same voice', 'Mod + D'], ['Undo', 'Mod + Z'],
      ['Redo', 'Mod + Shift + Z | Mod + Y'], ['Wind five seconds', 'Left | Right'],
      ['Wind one second', 'Shift + Left | Shift + Right'], ['Reel start', 'Home'],
      ['Reel end', 'End'], ['Split selected clip', 'S']
    ] },
    { title: 'Oddio face · clip gestures', note: 'Available while Oddio faces you and its controls are unlocked.', rows: [
      ['Move a clip; Shift widens the snap range', 'Drag clip | Shift + drag'],
      ['Copy a clip while moving it', 'Alt + drag clip'],
      ['Trim or stretch an edge', 'Drag edge | Shift + drag edge'],
      ['Cancel a clip drag', 'Esc']
    ] },
    { title: 'About face · editor', note: 'Available while the editor canvas has focus.', rows: [
      ['Nudge the selected element one pixel', 'Arrow keys'],
      ['Nudge ten pixels', 'Shift + Arrow keys'],
      ['Cancel the current edit gesture', 'Esc']
    ] },
    { title: 'Skills face · beanbag', rows: [
      ['Toggle beanbag mode', 'B'], ['Cancel the current pose', 'Esc']
    ] },
    { title: 'Notes face · selection', rows: [
      ['Face the pane', 'Z'], ['Toggle Turn cube', 'C'], ['Select tool', 'V'],
      ['Add or remove from selection', 'Shift + click | Shift + drag'],
      ['Select all', 'Mod + A'], ['Duplicate', 'Shift + D | Mod + J'],
      ['Group', 'Mod + G'], ['Ungroup', 'Mod + Shift + G'],
      ['Enter a group', 'Double click group'], ['Leave a group', 'Esc'],
      ['Nudge', 'Arrow keys'], ['Nudge farther', 'Shift + Arrow keys'],
      ['Delete selected art or anchors', 'Delete'], ['Undo', 'Mod + Z'],
      ['Redo', 'Mod + Shift + Z | Mod + Y']
    ] },
    { title: 'Notes face · drawing and transforms', advanced: true, rows: [
      ['Pencil', 'N'], ['Pen', 'P'], ['Line', 'L'], ['Rectangle', 'R'],
      ['Ellipse', 'E'], ['Polygon', 'O'], ['Diamond', 'D'], ['Heart', 'H'],
      ['Star', 'S'], ['Arc', 'U'], ['Torus', 'I'], ['Pacman', 'J'],
      ['Smart rotate', 'Shift + T'], ['Toggle snapping', 'Shift + Q'],
      ['Set a Smart rotate pivot', 'Click'], ['Rotate around the pivot', 'Drag'],
      ['Snap line or rotation to 15°', 'Shift + drag'],
      ['Keep proportions while resizing', 'Shift + drag'],
      ['Resize around center', 'Drag resize handle'],
      ['Keep the opposite edge fixed', 'Mod + drag'],
      ['Copy while transforming', 'Alt + drag | Alt + Arrow keys'],
      ['Repeat the last transform', 'Mod + D | Shift + F4']
    ] },
    { title: 'Notes face · appearance', advanced: true, rows: [
      ['Scale strokes', 'K'], ['Stroke color', 'X'], ['Fill color', 'F'],
      ['No color', '/'], ['Focus artwork width', 'Shift + W'],
      ['Focus artwork height', 'Shift + H'],
      ['Focus stroke weight', 'W'], ['Focus sides', 'Q'],
      ['Focus depth', 'B'], ['Focus smoothing', 'M'], ['Focus angle', 'T'],
      ['Adjust the focused value', 'Arrow keys'],
      ['Choose a palette color', 'Alt + Shift + 1–9 | Alt + Shift + 0 | Alt + Shift + -']
    ] },
    { title: 'Notes face · Pen and shape edit', advanced: true, rows: [
      ['Finish an open path', 'Enter'], ['Close a path', 'Mod + Enter'],
      ['Enter shape edit', 'A'], ['Add an anchor', 'Double click edge'],
      ['Toggle curve handles', 'Double click anchor'],
      ['Pull curve handles', 'Alt + drag anchor'],
      ['Move one handle independently', 'Alt + drag handle']
    ] },
    { title: 'Notes face · Layers', advanced: true, rows: [
      ['Add a pane (up to three)', 'Mod + Alt + N'],
      ['Activate a pane', 'Alt + 1–3'], ['Move selection to a pane', 'Mod + Alt + 1–3'],
      ['Toggle pane visibility', 'Shift + V'], ['Toggle pane lock', 'Shift + K'],
      ['Raise selection', 'Mod + ]'], ['Lower selection', 'Mod + ['],
      ['Rename selection or pane', 'F2'], ['Browse the layer tree', 'Arrow keys'],
      ['Expand, collapse, or select in tree', 'Enter | Space']
    ] },
    { title: 'Notes face · Gear art mode', advanced: true, rows: [
      ['Enter Gear art mode', 'G'], ['Previous or next large guide', '[ | ]'],
      ['Previous or next small roller', ', | .'], ['Choose a spiral pin hole', '1–9 | 0'],
      ['Fit setup to pane', 'F8'], ['Show clipped art', 'Shift + C'],
      ['Inside circle', 'I'], ['Preview', 'J'], ['Focus size', 'Y'],
      ['Focus auto speed', 'U'], ['Auto-draw or pause', 'Space'],
      ['Finish', 'Mod + Enter'], ['Keep partial drawing', 'Enter'],
      ['Restart', 'Shift + R'], ['Remove setup', 'Shift + Delete'],
      ['Leave Gear art mode', 'Esc']
    ] }
  ],
  videos: [
    { title: 'Intro', rows: ['videos.intro.play', ['Skip', 'S']] },
    { title: 'Video player', rows: [
      ['Play or pause', 'K | Space'], ['Back ten seconds', 'J'],
      ['Forward ten seconds', 'L'], ['Mute or unmute', 'M'],
      ['Toggle player view', 'F'], ['Captions, when available', 'C'],
      ['Leave the player', 'Esc']
    ] }
  ],
  graphics: [
    { title: 'Shelf', rows: [
      ['Skip the current animation', 'S'], ['Put the current item away', 'Esc'],
      ['Turn a focused book page', 'Left | Right'], ['Turn book pages', 'Shift + wheel'],
      ['Zoom', 'Wheel'], ['Focus an object', 'Middle click'], ['Pan', 'Middle drag'],
      ['Reset pan', 'Double middle click'], ['Rotate', 'Right drag'],
      ['Reset rotation and zoom', 'Double right click'],
      ['Choose an item or navigation', 'Tab'], ['Activate it', 'Enter'],
      'graphics.manual.left', 'graphics.manual.right', 'graphics.manual.up',
      'graphics.manual.down', 'graphics.manual.scale-in', 'graphics.manual.scale-out'
    ] }
  ],
  games: [
    { title: 'Cabinet', rows: [
      ['Zoom cabinet view', 'F'], ['Leave the current game, reel, or view', 'Esc']
    ] },
    { title: 'Video player', rows: [
      ['Play or pause', 'K | Space'], ['Back ten seconds', 'J'],
      ['Forward ten seconds', 'L'], ['Mute or unmute', 'M']
    ] }
  ],
  music: [
    { title: 'Piano', note: 'While the piano is active.', rows: [
      ['Play notes', 'QWERTY keys'], ['Hold sustain pedal', 'Space']
    ] },
    { title: 'Active video', note: 'Video keys apply while the video player is open.', rows: [
      ['Play or pause', 'K | Space'], ['Back ten seconds', 'J'],
      ['Forward ten seconds', 'L'], ['Back five seconds', 'Left'],
      ['Forward five seconds', 'Right'], ['Adjust volume', 'Up | Down'],
      ['Mute or unmute', 'M']
    ] },
    { title: 'Navigation', rows: [['Move among instruments, video controls, and settings', 'Tab']] }
  ],
  docs: [
    { title: 'Document desk', rows: [
      ['Rotate the desk view', 'Drag'], ['Zoom the view', 'Wheel'],
      ['Open a document', 'Click a paper or list item'], ['Close a document', 'Esc']
    ] }
  ]
};

const VIDEO_SHORTCUTS = [
  { title: 'Playback', rows: [
    ['Play or pause', 'Space | K'], ['Back ten seconds', 'J'],
    ['Forward ten seconds', 'L'], ['Back five seconds', 'Left'],
    ['Forward five seconds', 'Right'], ['Volume up', 'Up'], ['Volume down', 'Down'],
    ['Mute or unmute', 'M'], ['Start or end', 'Home | End'],
    ['Toggle player view', 'F'], ['Exit player', 'Esc']
  ] },
  { title: 'When the player is active', rows: [
    ['Decrease or increase playback speed', 'Shift + , | Shift + .'],
    ['Previous or next frame while paused', ', | .'], ['Seek by percentage', '0–9'],
    ['Show this guide', '?']
  ] }
];

const GRAPHICS_KEYS = { left: 'L', right: 'R', up: 'U', down: 'D', 'scale-in': 'I', 'scale-out': 'O' };
const GRAPHICS_LABELS = {
  left: 'Move manual control left', right: 'Move manual control right',
  up: 'Move manual control up', down: 'Move manual control down',
  'scale-in': 'Scale manual control in', 'scale-out': 'Scale manual control out'
};
let guideSerial = 0;

function isVisible(element) {
  return !!element && element.getClientRects().length > 0 && !element.closest('[hidden], [inert]');
}

function hasOtherModal(dialog) {
  return [...dialog.ownerDocument.querySelectorAll('dialog[open], [aria-modal="true"]:not([hidden])')]
    .some(other => other !== dialog && !other.contains(dialog));
}

function renderKeys(root, expression) {
  const keys = root.createElement('span');
  keys.className = 'site-shortcuts-keys';
  const mod = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || '') ? '⌘' : 'Ctrl';
  expression.split(' | ').forEach((option, index) => {
    if (index) {
      const or = root.createElement('span');
      or.className = 'site-shortcuts-or';
      or.textContent = 'or';
      keys.append(or);
    }
    const chord = root.createElement('span');
    chord.className = 'site-shortcuts-chord';
    option.split(' + ').forEach((part, partIndex) => {
      if (partIndex) {
        const plus = root.createElement('span');
        plus.className = 'site-shortcuts-plus';
        plus.textContent = '+';
        chord.append(plus);
      }
      const kbd = root.createElement('kbd');
      kbd.textContent = part === 'Mod' ? mod : part;
      chord.append(kbd);
    });
    keys.append(chord);
  });
  return keys;
}

export function createShortcutGuide({ root = document, title = 'Keyboard shortcuts', sections = [], description = 'Shortcuts work when you are not typing in a field.', id, onClose, actions } = {}) {
  const dialog = root.createElement('dialog');
  dialog.className = 'site-shortcuts-dialog site-shortcuts-guide';
  dialog.id = id || `site-shortcuts-guide-${++guideSerial}`;
  const header = root.createElement('header');
  header.className = 'site-shortcuts-header';
  const heading = root.createElement('h2');
  heading.id = `site-shortcuts-title-${++guideSerial}`;
  heading.tabIndex = -1;
  heading.textContent = title;
  dialog.setAttribute('aria-labelledby', heading.id);
  const close = root.createElement('button');
  close.type = 'button';
  close.className = 'site-shortcuts-close';
  close.textContent = 'Close';
  close.addEventListener('click', () => dialog.close());
  header.append(heading, close);
  const body = root.createElement('div');
  body.className = 'site-shortcuts-body';
  body.dataset.panel = 'guide';
  if (description) {
    const intro = root.createElement('p');
    intro.className = 'site-shortcuts-intro';
    intro.textContent = description;
    body.append(intro);
  }
  const registeredRows = [];
  const sectionIds = new Map();
  for (const { id: sectionId, title: sectionTitle, note, rows, advanced } of [...sections, { id: 'help', title: 'Help', rows: actions ? ['guide.toggle', 'settings.toggle', 'debug.toggle'] : [['Show or hide this guide', '?']] }]) {
    const section = root.createElement('details');
    section.className = 'site-shortcuts-section';
    section.open = !advanced;
    const base = sectionId || sectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const index = sectionIds.get(base) || 0;
    sectionIds.set(base, index + 1);
    section.dataset.sectionId = index ? `${base}-${index}` : base;
    const sectionHeading = root.createElement('summary');
    const sectionLabel = root.createElement('h3');
    sectionLabel.textContent = sectionTitle;
    sectionHeading.append(sectionLabel);
    section.append(sectionHeading);
    if (note) {
      const explanation = root.createElement('p');
      explanation.className = 'site-shortcuts-note';
      explanation.textContent = note;
      section.append(explanation);
    }
    const list = root.createElement('dl');
    for (const row of rows) {
      const registered = typeof row === 'string' ? actions?.get(row) : null;
      if (typeof row === 'string' && !registered) continue;
      const [action, expression] = registered ? [registered.label, registered.keys] : row;
      const term = root.createElement('dt');
      term.textContent = action;
      const detail = root.createElement('dd');
      detail.append(renderKeys(root, expression));
      list.append(term, detail);
      if (registered) registeredRows.push({ action: registered, term, detail });
    }
    section.append(list);
    body.append(section);
  }
  dialog.append(header, body);
  // Capture keys before page and player listeners so an open guide cannot control the page.
  dialog.addEventListener('keydown', event => {
    // Native Escape still cancels the dialog. Stop page/player shortcut listeners.
    event.stopPropagation();
    if (event.key === '?' || (event.code === 'Slash' && event.shiftKey)) {
      event.preventDefault();
      dialog.close();
    }
  });
  dialog.addEventListener('close', () => onClose?.());
  root.body.append(dialog);
  const folds = mountCollapsibleSections(dialog, { scope: `shortcuts:${id || title}`, headings: false, reorder: false });
  return {
    dialog,
    body,
    open() {
      if (dialog.open || hasOtherModal(dialog)) return false;
      for (const { action, term, detail } of registeredRows) {
        const target = action.target?.();
        const available = !action.target || (isVisible(target) && !target.disabled);
        term.hidden = detail.hidden = !available;
        term.style.display = detail.style.display = available ? '' : 'none';
      }
      body.scrollTop = 0;
      dialog.showModal();
      heading.focus({ preventScroll: true });
      return true;
    },
    close() { if (dialog.open) dialog.close(); },
    remove() { if (dialog.open) dialog.close(); folds.dispose(); dialog.remove(); }
  };
}

export function createVideoShortcutGuide(options = {}) {
  const sections = VIDEO_SHORTCUTS.map(section => ({ ...section, rows: section.rows.filter(([label]) =>
    (options.playerView === true || label !== 'Toggle player view') &&
    (options.exit !== false || label !== 'Exit player')) }));
  if (options.captions || options.tabletView) sections[0].rows.push(
    ...(options.captions ? [['Toggle captions', 'C']] : []),
    ...(options.tabletView ? [['Toggle tablet view', 'T']] : []));
  return createShortcutGuide({ ...options, title: 'Video keyboard shortcuts', sections,
    description: 'These shortcuts work while the video player is active.' });
}

export function mountPageShortcuts({ pageId, root = document, scope, getPanels = () => null }) {
  const actions = createKeyboardActions();
  const trigger = root.createElement('button');
  trigger.type = 'button';
  trigger.className = 'site-shortcuts-trigger';
  trigger.textContent = 'Shortcuts';
  let guide;
  if (pageId === 'about') {
    const navWrap = root.querySelector('.nav-wrap');
    const launchers = root.createElement('div');
    launchers.className = 'about-header-launchers';
    const alternative = root.querySelector('.scene-alternative');
    if (alternative) {
      const textButton = root.createElement('button');
      textButton.type = 'button';
      textButton.className = 'about-text-trigger';
      textButton.textContent = 'About text';
      const textDialog = root.createElement('dialog');
      textDialog.className = 'site-shortcuts-dialog about-text-dialog';
      textDialog.setAttribute('aria-label', 'About text and links');
      const textHeading = root.createElement('h2');
      textHeading.textContent = 'About text and links';
      const content = alternative.querySelector('.scene-alternative-content')?.cloneNode(true);
      const textClose = root.createElement('button');
      textClose.type = 'button'; textClose.textContent = 'Close';
      textDialog.append(textHeading, content || root.createElement('p'), textClose);
      root.body.append(textDialog);
      alternative.hidden = true;
      scope.listen(textButton, 'click', () => { if (!hasOtherModal(textDialog)) textDialog.showModal(); });
      scope.listen(textClose, 'click', () => textDialog.close());
      scope.listen(textDialog, 'close', () => textButton.focus());
      launchers.append(textButton);
      scope.defer(() => { if (textDialog.open) textDialog.close(); textDialog.remove(); alternative.hidden = false; });
    }
    launchers.append(trigger);
    (navWrap || root.body).prepend(launchers);
    scope.defer(() => launchers.remove());
  } else root.body.append(trigger);

  function toggle() {
    if (guide.dialog.open) { guide.close(); return true; }
    return guide.open();
  }
  scope.listen(trigger, 'click', toggle);

  actions.register({
    id: 'guide.toggle', scope: pageId, label: 'Show or hide this guide', keys: '?', ariaKeys: 'Shift+/',
    priority: 100, target: () => trigger,
    match: event => event.key === '?' || (event.code === 'Slash' && event.shiftKey),
    enabled: () => guide.dialog.open || !hasOtherModal(guide.dialog),
    run: () => toggle()
  });
  for (const [id, key, label, method] of [
    ['settings.toggle', 's', 'Show or hide Settings', 'toggleSettings'],
    ['debug.toggle', 'd', 'Show or hide Debug', 'toggleDebug']
  ]) actions.register({
    id, scope: pageId, label, keys: `Alt + Shift + ${key.toUpperCase()}`,
    ariaKeys: `Alt+Shift+${key.toUpperCase()}`, priority: 110,
    match: event => !event.repeat && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === key,
    enabled: () => !!getPanels()?.[method],
    run: () => { const panel = getPanels(); if (!panel?.[method]) return false; panel[method](); return true; }
  });
  if (pageId === 'graphics') {
    for (const [name, key] of Object.entries(GRAPHICS_KEYS)) {
      const target = () => root.querySelector(`#manual-controls button[data-action="${name}"]`);
      actions.register({
        id: `graphics.manual.${name}`, scope: pageId, label: GRAPHICS_LABELS[name], keys: key,
        ariaKeys: key, target,
        match: event => !event.shiftKey && !event.repeat && event.key.toUpperCase() === key,
        enabled: () => { const button = target(); return isVisible(button) && !button.disabled; },
        run: () => { target().click(); return true; }
      });
    }
  }
  if (pageId === 'videos') {
    const target = () => root.getElementById('introPlay');
    actions.register({
      id: 'videos.intro.play', scope: pageId, label: 'Play when ready', keys: 'P', ariaKeys: 'P', target,
      match: event => !event.shiftKey && !event.repeat && event.key.toLowerCase() === 'p',
      enabled: () => { const button = target(); return isVisible(button) && !button.disabled; },
      run: () => { target().click(); return true; }
    });
    const skip = root.getElementById('introSkip');
    if (skip) skip.setAttribute('aria-keyshortcuts', 'S');
  }

  for (const action of actions.list(pageId)) {
    const target = action.target?.();
    if (!target) continue;
    const previousAria = target.getAttribute('aria-keyshortcuts');
    const previousHint = target.getAttribute('data-shortcut');
    target.setAttribute('aria-keyshortcuts', action.ariaKeys || action.keys);
    target.dataset.shortcut = action.keys;
    scope.defer(() => {
      if (previousAria === null) target.removeAttribute('aria-keyshortcuts');
      else target.setAttribute('aria-keyshortcuts', previousAria);
      if (previousHint === null) target.removeAttribute('data-shortcut');
      else target.setAttribute('data-shortcut', previousHint);
    });
  }
  guide = createShortcutGuide({ root, id: `site-shortcuts-${pageId}`,
    sections: PAGE_SHORTCUTS[pageId] || [], actions, onClose: () => trigger.focus() });

  scope.listen(globalThis, 'keydown', event => {
    const panelChord = event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey &&
      ['s', 'd'].includes(event.key.toLowerCase());
    const inputTarget = event.target?.closest?.('input');
    const typingInput = inputTarget && !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'image', 'color', 'file', 'hidden'].includes(inputTarget.type);
    const textTarget = typingInput || event.target?.isContentEditable ||
      event.target?.closest?.('textarea, select, [role="textbox"], [role="combobox"], [role="spinbutton"]');
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey ||
        (event.altKey && !panelChord) || (panelChord ? !!textTarget : isInteractiveKeyboardTarget(event.target))) return;
    if (!guide.dialog.open && hasOtherModal(guide.dialog)) return;
    if (guide.dialog.open && !(event.key === '?' || (event.code === 'Slash' && event.shiftKey))) return;
    if (actions.dispatch(event, pageId)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, { capture: true });
  scope.defer(() => { actions.dispose(); guide.remove(); trigger.remove(); });
  return { show: guide.open, actions };
}
