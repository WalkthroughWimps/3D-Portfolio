const PAGE_SHORTCUTS = {
  start: [
    ['A', 'Audio settings'], ['V', 'Visual settings'], ['Arrow keys', 'Adjust the selected control']
  ],
  about: [
    ['Face shortcuts', 'Only the face facing you handles its editing keys. Text fields retain normal typing.'],
    ['Space / Delete or Backspace', 'Oddio: Play or stop / Remove selected clip'],
    ['Ctrl/Cmd + C / X / V', 'Oddio: Copy / Cut / Paste at playhead on selected voice'],
    ['Ctrl/Cmd + D', 'Oddio: Duplicate into the next free space on the same voice'],
    ['Ctrl/Cmd + Z / Shift + Z / Y', 'Oddio: Undo / Redo / Redo'],
    ['Left/Right / Shift + Left/Right', 'Oddio: Wind ±5 seconds / ±1 second; hold shuttle keys for smooth spooling'],
    ['Home / End / S', 'Oddio: Reel start / Reel end / Split selected clip at playhead'],
    ['Z / C', 'Notes: Face forward / Toggle Turn cube'],
    ['V', 'Notes: Select'], ['N / P / L', 'Notes: Pencil / Pen / Line'],
    ['R / E / O', 'Notes: Rectangle / Ellipse / Polygon'], ['D / H / S', 'Notes: Diamond / Heart / Star'], ['U / I / J', 'Notes: Arc / Torus / Pacman'],
    ['Double-click group / empty glass; Esc', 'Notes: Enter a group / Leave one isolation level'],
    ['Shift + T / Shift + Q', 'Notes: Smart rotate / Toggle snaps'],
    ['Click / drag in Smart rotate', 'Notes: Set a pivot / Rotate around it'],
    ['A / F7 / G', 'Notes: Shape edit mode / Layers / Gear art'], ['Shift + click / drag', 'Notes: Toggle objects in the selection'],
    ['Shift + line / rotation', 'Notes: Snap to 15 degree increments'], ['Shift + resize', 'Notes: Preserve proportions'],
    ['Drag resize handle / Ctrl or Cmd + drag', 'Notes: Scale around center / Keep the opposite edge or corner fixed'],
    ['Side midpoint handles', 'Notes: Adjust width or height; Shift preserves proportions'],
    ['Ctrl/Cmd + G / Shift + G', 'Notes: Group / Ungroup (up to two group levels)'],
    ['Ctrl/Cmd + A / D', 'Notes: Select all / Duplicate'], ['Shift + D or Ctrl/Cmd + J', 'Notes: Alternate Duplicate shortcuts'], ['Ctrl/Cmd + Z / Shift + Z', 'Notes: Undo / Redo (also Ctrl/Cmd+Y)'],
    ['Alt + transform drag / Alt + arrows', 'Notes: Copy while moving, resizing or rotating; copies also work in Smart rotate'],
    ['Shift + F4', 'Notes: Repeat the last transform, including its copy behavior'],
    ['Alignment icons', 'Notes: Left, horizontal center, right, bottom, vertical center, top; one root aligns to the pane, multiple roots align within their bounds'],
    ['Arrow keys / Shift + arrows', 'Notes: Nudge / Larger nudge'], ['Delete', 'Notes: Delete selected anchors or objects'],
    ['Enter / Ctrl/Cmd + Enter', 'Notes Pen: Finish open / Close path'],
    ['Double-click edge / anchor', 'Notes Shape edit: Add an anchor / Toggle curve handles'],
    ['Alt + drag anchor / handle', 'Notes Shape edit: Pull curve handles / Move one handle independently'],
    ['K / X / F / /', 'Notes: Scale strokes / Stroke color / Fill color / No color'],
    ['Shift + W / Shift + H', 'Notes: Focus selected artwork Width / Height'],
    ['W / Q / B / M / T', 'Notes: Focus Weight / Sides / Depth / Smoothing / Rotation; arrows adjust'],
    ['Alt + Shift + 1…9 / 0 / -', 'Notes: Choose palette colors in order'],
    ['Clear pane (Layers)', 'Notes: Clear active pane with Undo'],
    ['Ctrl/Cmd + Alt + N', 'Layers: Add pane (maximum three)'],
    ['Alt + 1 / 2 / 3', 'Layers: Activate pane'],
    ['Ctrl/Cmd + Alt + 1 / 2 / 3', 'Layers: Move selection to pane'],
    ['Shift + V / Shift + K', 'Layers: Toggle active pane visibility / lock'],
    ['Ctrl/Cmd + ] / [', 'Layers: Raise / lower selection'],
    ['F2', 'Layers: Rename selection or active pane'],
    ['Arrow keys / Enter or Space in tree', 'Layers: Browse / expand or collapse / select tree items'],
    ['[ / ]', 'Gears: Previous / next large guide'],
    [', / .', 'Gears: Previous / next small roller'],
    ['1…9 / 0', 'Gears: Choose one of ten spiral pin holes'],
    ['F8 / Shift + C', 'Notes: Fit gear setup to pane / Show clipped art'],
    ['I / J / Y / U', 'Gears: Inside circle / Preview / Focus size / Focus auto speed'],
    ['Space / Ctrl/Cmd + Enter / Enter', 'Gears: Auto-draw or pause / Finish / Keep partial'],
    ['Shift + R / Shift + Delete', 'Gears: Restart / Remove setup'],
    ['Esc', 'Notes: Cancel a drag or clear the selection; leave Gear art mode']
  ],
  videos: [
    ['P', 'Play the intro when ready'], ['S', 'Skip the intro'],
    ['K or Space', 'Play / pause the selected video'], ['J / L', 'Back / forward 10 seconds'],
    ['M', 'Mute / unmute'], ['F', 'Fullscreen'], ['C', 'Captions when available'],
    ['Esc', 'Leave the player']
  ],
  graphics: [
    ['L / R', 'Move the camera left / right'], ['U / D', 'Move the camera up / down'],
    ['I / O', 'Zoom in / out']
  ],
  games: [
    ['K or Space', 'Play / pause a video'], ['J / L', 'Back / forward 10 seconds'],
    ['M', 'Mute / unmute'], ['F', 'Toggle the cabinet view'], ['Esc', 'Return to the menu']
  ],
  music: [
    ['QWERTY keys', 'Play piano notes'], ['Space', 'Hold the sustain pedal'],
    ['Tab', 'Move to instruments, video controls, and settings']
  ],
  docs: [
    ['A', 'Flip all cards'], ['F', 'Flip selected cards'],
    ['L / R', 'Turn the card face left / right']
  ]
};

const GRAPHICS_ACTIONS = { l: 'left', r: 'right', u: 'up', d: 'down', i: 'scale-in', o: 'scale-out' };

function isTypingTarget(target) {
  return !!target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]');
}

function isVisible(element) {
  return !!element && element.getClientRects().length > 0 && !element.closest('[hidden], [inert]');
}

export function mountPageShortcuts({ pageId, root = document, scope }) {
  const rows = PAGE_SHORTCUTS[pageId] || [];
  const trigger = root.createElement('button');
  trigger.type = 'button';
  trigger.className = 'site-shortcuts-trigger';
  trigger.textContent = 'Shortcuts (?)';
  trigger.setAttribute('aria-keyshortcuts', 'Shift+/');
  const dialog = root.createElement('dialog');
  dialog.className = 'site-shortcuts-dialog';
  dialog.setAttribute('aria-label', `${pageId[0].toUpperCase()}${pageId.slice(1)} keyboard shortcuts`);
  const heading = root.createElement('h2');
  heading.textContent = 'Keyboard shortcuts';
  const description = root.createElement('p');
  description.textContent = 'Shortcuts work when you are not typing in a field. Tab and Enter work on every link and button.';
  const list = root.createElement('dl');
  for (const [key, label] of [...rows, ['?', 'Show or hide this guide']]) {
    const term = root.createElement('dt');
    const kbd = root.createElement('kbd');
    kbd.textContent = key;
    term.appendChild(kbd);
    const detail = root.createElement('dd');
    detail.textContent = label;
    list.append(term, detail);
  }
  const close = root.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  dialog.append(heading, description, list, close);
  root.body.append(trigger, dialog);
  if (pageId === 'about') {
    const note = root.querySelector('.page-note--nav');
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
      scope.listen(textButton, 'click', () => textDialog.showModal());
      scope.listen(textClose, 'click', () => textDialog.close());
      scope.listen(textDialog, 'close', () => textButton.focus());
      launchers.append(textButton);
      scope.defer(() => { if (textDialog.open) textDialog.close(); textDialog.remove(); alternative.hidden = false; });
    }
    launchers.append(trigger);
    note?.before(launchers);
    scope.defer(() => launchers.remove());
  }

  function toggle() {
    if (dialog.open) dialog.close();
    else dialog.showModal();
  }
  scope.listen(trigger, 'click', toggle);
  scope.listen(close, 'click', () => dialog.close());
  scope.listen(dialog, 'close', () => trigger.focus());

  if (pageId === 'graphics') {
    for (const [key, action] of Object.entries(GRAPHICS_ACTIONS)) {
      const button = root.querySelector(`#manual-controls button[data-action="${action}"]`);
      if (!button) continue;
      button.dataset.shortcut = key.toUpperCase();
      button.setAttribute('aria-keyshortcuts', key.toUpperCase());
    }
  }
  if (pageId === 'videos') {
    const play = root.getElementById('introPlay');
    if (play) {
      play.dataset.shortcut = 'P';
      play.setAttribute('aria-keyshortcuts', 'P');
    }
    const skip = root.getElementById('introSkip');
    if (skip) skip.setAttribute('aria-keyshortcuts', 'S');
  }

  scope.listen(globalThis, 'keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey || isTypingTarget(event.target)) return;
    const helpKey = event.key === '?' || (event.code === 'Slash' && event.shiftKey);
    if (helpKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggle();
      return;
    }
    if (dialog.open || root.querySelector('dialog[open], [aria-modal="true"]:not([hidden])')) return;
    if (event.shiftKey || event.repeat) return;
    const key = event.key.toLowerCase();
    if (pageId === 'graphics' && GRAPHICS_ACTIONS[key]) {
      const button = root.querySelector(`#manual-controls button[data-action="${GRAPHICS_ACTIONS[key]}"]`);
      if (isVisible(button) && !button.disabled) {
        event.preventDefault();
        event.stopImmediatePropagation();
        button.click();
      }
    }
    if (pageId === 'videos' && key === 'p') {
      const button = root.getElementById('introPlay');
      if (isVisible(button) && !button.disabled) {
        event.preventDefault();
        event.stopImmediatePropagation();
        button.click();
      }
    }
  }, { capture: true });
  scope.defer(() => { if (dialog.open) dialog.close(); dialog.remove(); trigger.remove(); });
  return { show: () => dialog.showModal() };
}
