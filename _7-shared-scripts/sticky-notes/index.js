import {validateBundle, mergeBundles, readLocal, writeLocal, newNote, inkFor, blankNoteAppearance} from './data.js';
import {getSettingsArchive} from '../panel-assembly/SettingsArchive.mjs';
import {initPanelShell} from '../../debug/panel-shell.js';
import {createDOMStickyAdapter} from './scene-adapter.js';
import {makeNoteFontSelect, noteFontFamily, noteFontId, noteRotation, loadNoteFont} from './note-appearance.js';
import {trackFloatingViewport} from '../core/floating-viewport.js';

const adapters = new Map();
const mounts = new Map();

export function registerStickySceneAdapter(pageId, adapter) {
  adapters.set(pageId, adapter);
  mounts.get(pageId)?.replaceAdapter(adapter);
  return () => {
    if (adapters.get(pageId) === adapter) adapters.delete(pageId);
  };
}

function composePageAnchors(adapter, pageRenderer, pageId) {
  const surface = `context:${pageId}:dom`;
  return {
    setHandlers(value) { adapter.setHandlers?.(value); pageRenderer.setHandlers(value); },
    setNotes(notes, dismissed = new Set()) { pageRenderer.setNotes(notes, dismissed); adapter.setNotes?.(notes.filter(note => note.anchor.surface !== surface), dismissed); },
    setPlacing(value) { adapter.setPlacing?.(value); },
    setEditingFocused(value) { adapter.setEditingFocused?.(value); },
    setNotesShown(value) { adapter.setNotesShown?.(value); pageRenderer.setNotesShown(value); },
    visibleCount() { return (adapter.visibleCount?.() || 0) + pageRenderer.visibleCount(); },
    unresolvedCount() { return adapter.unresolvedCount?.() || 0; },
    isVisible(id) { return !!adapter.isVisible?.(id) || pageRenderer.isVisible(id); },
    getAnchorRect(id) { return adapter.getAnchorRect?.(id) || pageRenderer.getAnchorRect(id); },
    previewIconDrag(event) { adapter.previewIconDrag?.(event); },
    placeFromIcon(event) { adapter.placeFromIcon?.(event); }
  };
}

export async function mountStickyNotes({pageId, root = document, settings, signal, authoringEnabled = pageId === 'graphics' || pageId === 'docs'} = {}) {
  if (mounts.has(pageId)) return mounts.get(pageId).api;
  const style = root.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./sticky-notes.css', import.meta.url).href;
  root.head.append(style);

  let published = {version: 1, notes: []};
  let bundle;
  let storeError = '';
  try {
    const response = await fetch(new URL('../../assets/annotations/sticky-notes.json', import.meta.url), {signal});
    if (!response.ok) throw Error('Published sticky notes unavailable.');
    published = validateBundle(await response.json());
  } catch (error) {
    if (signal?.aborted) {
      style.remove();
      throw new DOMException('Sticky notes mount cancelled.', 'AbortError');
    }
    storeError = `Published notes unavailable: ${error.message}. Local notes and imports remain usable.`;
  }
  if (signal?.aborted) {
    style.remove();
    throw new DOMException('Sticky notes mount cancelled.', 'AbortError');
  }
  try {
    bundle = readLocal() || published;
  } catch (error) {
    bundle = published;
    storeError += ` Saved notes could not be read: ${error.message}. They were left untouched.`;
  }

  const dismissedKey = `site.sticky-notes.dismissed.${pageId}`;
  let readHistory = {};
  try {
    const value = JSON.parse(localStorage.getItem(dismissedKey) || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) readHistory = value;
  } catch { /* Keep notes readable. */ }
  const fingerprint = note => JSON.stringify([
    note.text, note.color, note.font, note.rotation, note.size, note.anchor, note.attachment
  ]);
  const dismissed = () => new Set(
    pageNotes().filter(note => readHistory[note.id] === fingerprint(note)).map(note => note.id)
  );

  let adapter = null;
  let placing = false;
  let notesShown = true;
  let activeId = null;
  let disposed = false;
  let stopArchive = () => {};
  const archive = getSettingsArchive();
  const host = root.querySelector('.header-mouse-controls') || root.body;
  const icon = root.createElement('button');
  icon.type = 'button';
  icon.className = 'sticky-notes-icon';
  icon.setAttribute('aria-label', 'Sticky notes');
  icon.disabled = true;
  icon.hidden = true;
  const hint = root.createElement('span');
  hint.className = 'sticky-notes-hint';
  hint.textContent = 'Click to view';
  icon.append(hint);
  const reset = host.querySelector('.header-mouse-reset-hint');
  if (reset) reset.after(icon);
  else host.append(icon);
  const defaultView = root.defaultView;
  const hostVisibilityTargets = [];
  for (let node = host; node && node !== root.body; node = node.parentElement) hostVisibilityTargets.push(node);
  function positionIcon() {
    const hostUnavailable = host === root.body || hostVisibilityTargets.some(node => {
      if (node.hidden || node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true') return true;
      const style = defaultView?.getComputedStyle(node);
      return style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.contentVisibility === 'hidden');
    });
    if (hostUnavailable) {
      icon.classList.add('sticky-notes-fallback');
      root.body.append(icon);
    } else {
      icon.classList.remove('sticky-notes-fallback');
      if (reset) reset.after(icon);
      else host.append(icon);
    }
  }
  positionIcon();
  defaultView?.addEventListener('site:header-layout-change', positionIcon);
  defaultView?.addEventListener('resize', positionIcon);
  const hostVisibilityObserver = defaultView && hostVisibilityTargets.length
    ? new defaultView.MutationObserver(() => positionIcon()) : null;
  for (const node of hostVisibilityTargets) hostVisibilityObserver?.observe(node, {attributes: true, attributeFilter: ['class', 'style', 'hidden', 'inert', 'aria-hidden']});
  const dialog = root.createElement('dialog');
  dialog.className = 'sticky-notes-reader';
  dialog.setAttribute('aria-label', 'Sticky note');
  const close = root.createElement('button');
  close.type = 'button';
  close.className = 'sticky-notes-close';
  close.textContent = 'Close';
  close.setAttribute('aria-label', 'Close sticky note');
  const previousNote = root.createElement('button'); previousNote.type = 'button'; previousNote.className = 'sticky-notes-previous'; previousNote.textContent = '←'; previousNote.setAttribute('aria-label', 'Previous sticky note');
  const nextNote = root.createElement('button'); nextNote.type = 'button'; nextNote.className = 'sticky-notes-next'; nextNote.textContent = '→'; nextNote.setAttribute('aria-label', 'Next sticky note');
  const editFocused = root.createElement('button'); editFocused.type = 'button'; editFocused.className = 'sticky-notes-edit'; editFocused.textContent = 'Edit in Constructor';
  const body = root.createElement('div');
  body.className = 'sticky-notes-reader-body';
  const readerControls = root.createElement('div');
  readerControls.className = 'sticky-notes-reader-controls';
  readerControls.append(previousNote, nextNote, editFocused, close);
  dialog.append(readerControls, body);
  let attachmentRequest = 0, pdfAttachmentUrl = null, pdfStart = 0, pdfTwoPages = true, pdfCoverFirst = true;
  function renderFocusedNote(note) {
    const request = ++attachmentRequest;
    const pages = note.attachment?.pageImages;
    if (pdfAttachmentUrl !== note.attachment?.url) { pdfAttachmentUrl = note.attachment?.url || null; pdfStart = 0; pdfTwoPages = true; pdfCoverFirst = note.attachment?.coverFirst !== false; }
    dialog.classList.toggle('sticky-notes-has-pdf', !!pages?.length);
    body.replaceChildren();
    const words = root.createElement('p'); words.textContent = note.text; body.append(words);
    dialog.style.setProperty('--sticky-note-font', noteFontFamily(note.font));
    void loadNoteFont(note.font);
    if (note.attachment) {
      const link = root.createElement('a'); link.href = note.attachment.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = `Open ${note.attachment.name}`; body.append(link);
      if (/\.(png|jpe?g|webp)$/i.test(note.attachment.url)) { const image = root.createElement('img'); image.src = note.attachment.url; image.alt = note.attachment.name; image.className = 'sticky-notes-attachment-preview'; body.append(image); }
      else if (/\.pdf$/i.test(note.attachment.url) && pages?.length) {
        const viewer = root.createElement('section'); viewer.className = 'sticky-notes-pdf-viewer'; viewer.setAttribute('aria-label', 'PDF pages');
        const toolbar = root.createElement('div'); toolbar.className = 'sticky-notes-pdf-toolbar';
        const back = root.createElement('button'), forward = root.createElement('button'), mode = root.createElement('button'), cover = root.createElement('button'), count = root.createElement('span');
        for (const button of [back, forward, mode, cover]) button.type = 'button';
        back.textContent = '← Pages'; forward.textContent = 'Pages →';
        const spread = root.createElement('div'); spread.className = 'sticky-notes-pdf-spread';
        function draw() {
          const coverAlone = pdfTwoPages && pdfCoverFirst && pdfStart === 0;
          const end = Math.min(pages.length, pdfStart + (pdfTwoPages && !coverAlone ? 2 : 1));
          spread.replaceChildren();
          for (let index = pdfStart; index < end; index++) { const image = root.createElement('img'); image.src = pages[index]; image.alt = `Page ${index + 1} of ${note.attachment.pageCount}`; spread.append(image); }
          count.textContent = `Pages ${pdfStart + 1}${end > pdfStart + 1 ? `–${end}` : ''} of ${note.attachment.pageCount}`;
          back.disabled = pdfStart === 0; forward.disabled = end >= pages.length;
          mode.textContent = pdfTwoPages ? 'Single page' : 'Two pages';
          cover.textContent = pdfCoverFirst ? 'Cover first: on' : 'Cover first: off'; cover.hidden = !pdfTwoPages;
        }
        back.addEventListener('click', () => { pdfStart = pdfTwoPages && pdfCoverFirst && pdfStart <= 2 ? 0 : Math.max(0, pdfStart - (pdfTwoPages ? 2 : 1)); draw(); });
        forward.addEventListener('click', () => { pdfStart = pdfTwoPages && pdfCoverFirst && pdfStart === 0 ? 1 : Math.min(pages.length - 1, pdfStart + (pdfTwoPages ? 2 : 1)); draw(); });
        mode.addEventListener('click', () => { pdfTwoPages = !pdfTwoPages; pdfStart = 0; draw(); });
        cover.addEventListener('click', () => { pdfCoverFirst = !pdfCoverFirst; pdfStart = 0; draw(); });
        toolbar.append(back, count, forward, mode, cover); viewer.append(toolbar, spread);
        if (note.attachment.pageCount > pages.length) { const limit = root.createElement('p'); limit.textContent = `Preview includes the first ${pages.length} pages. Open the original for the rest.`; viewer.append(limit); }
        draw(); body.append(viewer);
      }
      else if (/\.pdf$/i.test(note.attachment.url)) { const frame = root.createElement('iframe'); frame.src = note.attachment.url; frame.title = note.attachment.name; frame.className = 'sticky-notes-attachment-preview'; body.append(frame); }
      else if (/\.(txt|md)$/i.test(note.attachment.url)) {
        const preview = root.createElement('pre'); preview.className = 'sticky-notes-attachment-text'; preview.textContent = 'Loading attachment…'; body.append(preview);
        fetch(note.attachment.url).then(response => { if (!response.ok) throw Error('Unavailable'); return response.text(); })
          .then(value => { if (request === attachmentRequest) preview.textContent = value.slice(0, 100000); })
          .catch(() => { if (request === attachmentRequest) preview.textContent = 'Could not load the attachment. Use the original-file link.'; });
      }
    }
    dialog.style.setProperty('--sticky-color', note.color);
    dialog.style.setProperty('--sticky-ink', inkFor(note.color));
    const notes = readerNotes(), index = notes.findIndex(item => item.id === note.id);
    previousNote.disabled = index <= 0; nextNote.disabled = index < 0 || index >= notes.length - 1;
  }
  root.body.append(dialog);
  const stopFloatingViewport = trackFloatingViewport(root, '.sticky-notes-reader, .sticky-notes-create, .sticky-notes-about-create');
  const draftDialog = root.createElement('dialog'); draftDialog.className = 'sticky-notes-create';
  draftDialog.setAttribute('aria-labelledby', `sticky-notes-create-title-${pageId}`);
  const draftForm = root.createElement('form'); draftForm.method = 'dialog';
  const draftHeading = root.createElement('h3'); draftHeading.id = `sticky-notes-create-title-${pageId}`; draftHeading.textContent = 'Place sticky note';
  const draftFields = {};
  for (const [key, label, type, value] of [['text','Text','textarea',''],['color','Color','color','#fff2a8'],['rotation','Rotation (degrees)','number','0'],['size','Size','number','1']]) {
    const wrap = root.createElement('label'); wrap.textContent = label;
    const field = root.createElement(type === 'textarea' ? 'textarea' : 'input'); if (type !== 'textarea') field.type = type;
    field.value = value; field.name = key;
    if (key === 'text') { field.maxLength = 1200; field.rows = 4; }
    if (key === 'rotation') { field.min = '-10'; field.max = '10'; field.step = '1'; }
    if (key === 'size') { field.min = '.2'; field.max = '2'; field.step = '.1'; }
    wrap.append(field); draftForm.append(wrap); draftFields[key] = field;
  }
  draftFields.font = makeNoteFontSelect(root);
  function previewDraftFont() {
    draftDialog.style.setProperty('--sticky-note-font', noteFontFamily(draftFields.font.value));
    draftFields.text.style.font = `1.2rem/1.45 ${noteFontFamily(draftFields.font.value)}`;
    void loadNoteFont(draftFields.font.value);
  }
  draftFields.font.addEventListener('change', previewDraftFont);
  const draftFontWrap = root.createElement('label'); draftFontWrap.textContent = 'Handwriting'; draftFontWrap.append(draftFields.font); draftForm.append(draftFontWrap);
  const draftActions = root.createElement('div'); draftActions.className = 'sticky-notes-create-actions';
  const draftCancel = root.createElement('button'); draftCancel.type = 'button'; draftCancel.textContent = 'Cancel';
  const draftPlace = root.createElement('button'); draftPlace.type = 'submit'; draftPlace.textContent = 'Place note';
  draftActions.append(draftCancel, draftPlace); draftForm.prepend(draftHeading); draftForm.append(draftActions); draftDialog.append(draftForm); root.body.append(draftDialog);

  const editor = root.createElement('section');
  editor.className = 'sticky-notes-constructor';
  const title = root.createElement('h3');
  title.textContent = 'Sticky notes';
  const previewSetting = root.createElement('label');
  previewSetting.className = 'sticky-notes-display-setting';
  const previewToggle = root.createElement('input');
  previewToggle.type = 'checkbox';
  previewToggle.checked = settings?.get?.().stickyNotes?.preview !== false;
  const previewDescription = root.createElement('span');
  previewDescription.textContent = 'Show a small note preview instead of “Click to read”';
  previewSetting.append(previewToggle, previewDescription);
  const status = root.createElement('p');
  status.className = 'sticky-notes-status';
  status.setAttribute('role', 'status');
  const anchorStatus = root.createElement('p');
  anchorStatus.className = 'sticky-notes-anchor-status';
  const instructions = root.createElement('p');
  instructions.textContent = pageId === 'graphics'
    ? 'Choose Place new note, then click a book, box, or shelf surface.'
    : pageId === 'about' ? 'Drag the note icon onto the cube, or choose Place new note and click a visible surface.'
    : 'Add a note to a visible scene surface or the page background.';
  const select = root.createElement('select');
  select.setAttribute('aria-label', 'Select sticky note');
  const text = root.createElement('textarea');
  text.maxLength = 1200;
  text.rows = 4;
  text.setAttribute('aria-label', 'Note text');
  const color = root.createElement('input');
  color.type = 'color';
  color.setAttribute('aria-label', 'Note color');
  const font = makeNoteFontSelect(root); font.setAttribute('aria-label', 'Note handwriting font');
  const rotation = root.createElement('input');
  rotation.type = 'number';
  rotation.min = '-10';
  rotation.max = '10';
  rotation.step = '1';
  rotation.setAttribute('aria-label', 'Note rotation in degrees');
  const size = root.createElement('input');
  size.type = 'number';
  size.min = '.2';
  size.max = '2';
  size.step = '.1';
  size.setAttribute('aria-label', 'Note size');
  const controls = root.createElement('div');
  controls.className = 'sticky-notes-editor-fields';
  for (const [label, field] of [
    ['Text', text], ['Color', color], ['Handwriting', font], ['Rotation', rotation], ['Size', size]
  ]) {
    const wrap = root.createElement('label');
    wrap.textContent = label;
    wrap.append(field);
    controls.append(wrap);
  }
  const appearanceFields = [text, color, font, rotation, size];
  for (const field of appearanceFields) {
    field.addEventListener('focus', () => adapter?.setEditingFocused?.(true));
    field.addEventListener('blur', () => queueMicrotask(() => {
      if (!appearanceFields.includes(root.activeElement)) adapter?.setEditingFocused?.(false);
    }));
  }
  const buttons = root.createElement('div');
  buttons.className = 'sticky-notes-editor-buttons';
  const makeButton = (label, handler) => {
    const button = root.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', handler);
    buttons.append(button);
    return button;
  };
  const report = message => { status.textContent = message; };
  const pageNotes = () => bundle.notes.filter(note => note.pageId === pageId);
  const readerNotes = () => pageNotes();
  const reachedNoteLimit = () => pageId === 'graphics' && pageNotes().length >= 1;
  const selected = () => bundle.notes.find(note => note.id === select.value);
  const attachmentInput = root.createElement('input'); attachmentInput.type = 'file'; attachmentInput.accept = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx,.odt,.odp,.ods,.rtf,.txt,.md'; attachmentInput.setAttribute('aria-label', 'Attach file to selected sticky note');
  const attachmentLabel = root.createElement('label'); attachmentLabel.textContent = 'Import attachment'; attachmentLabel.append(attachmentInput);
  const draftKey = 'site.sticky-notes.draft.v1';
  let draft = blankNoteAppearance();
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
    if (saved && typeof saved.text === 'string' && saved.text.length <= 1200 &&
        /^#[0-9a-fA-F]{6}$/.test(saved.color) &&
        Number.isFinite(saved.rotation) && saved.rotation >= -180 && saved.rotation <= 180 &&
        Number.isFinite(saved.size) && saved.size >= .2 && saved.size <= 2) draft = blankNoteAppearance(saved);
  } catch { /* An unavailable draft never blocks published notes. */ }
  function resetDraftText(appearance) {
    draft = blankNoteAppearance(appearance);
    try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* Keep defaults in memory. */ }
  }
  function readDraft() {
    const next = {
      text: text.value,
      color: color.value,
      rotation: Number(rotation.value),
      size: Number(size.value), font: noteFontId(font.value)
    };
    if (next.text.length > 1200 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(next.text)) {
      throw Error('Note text is invalid or too long.');
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(next.color)) throw Error('Choose a valid note color.');
    if (rotation.value.trim() === '' || !Number.isFinite(next.rotation)) throw Error('Choose a valid rotation.');
    next.rotation = noteRotation(next.rotation);
    if (size.value.trim() === '' || !Number.isFinite(next.size) ||
        next.size < .2 || next.size > 2) throw Error('Size must be between 0.2 and 2.');
    return next;
  }
  function saveDraft() {
    try {
      draft = readDraft();
      try { localStorage.setItem(draftKey, JSON.stringify(draft)); }
      catch { /* The draft remains in memory and can still be placed. */ }
      report(`New note draft ready. Place it on a visible ${pageId === 'about' ? 'cube ' : ''}surface.`);
      return true;
    } catch (error) {
      report(error.message);
      return false;
    }
  }
  function persist(next) {
    try {
      bundle = validateBundle(next);
    } catch (error) {
      report(`Invalid note: ${error.message}`);
      return false;
    }
    try {
      writeLocal(bundle);
      storeError = '';
      report('Saved locally. Export the bundle to publish it.');
    } catch (error) {
      storeError = `Could not save locally: ${error.message}. Edits remain in memory and can be exported.`;
      report(storeError);
    }
    refresh();
    archive.capture('annotations.sticky-notes');
    return true;
  }
  let requestedAnchor = null;
  function closeRequestedDraft() { requestedAnchor = null; if (draftDialog.open) draftDialog.close(); adapter?.setEditingFocused?.(false); }
  function requestDraft(anchor) {
    if (!authoringEnabled || reachedNoteLimit()) return;
    if (!anchor || draftDialog.open) return;
    requestedAnchor = anchor;
    for (const [key, value] of Object.entries(blankNoteAppearance(draft))) draftFields[key].value = String(value);
    previewDraftFont();
    adapter?.setEditingFocused?.(true); draftDialog.showModal(); draftFields.text.focus();
  }
  draftCancel.addEventListener('click', closeRequestedDraft);
  draftDialog.addEventListener('cancel', event => { event.preventDefault(); closeRequestedDraft(); });
  draftForm.addEventListener('submit', event => {
    event.preventDefault();
    const appearance = {text: draftFields.text.value.trim(), color: draftFields.color.value, font: noteFontId(draftFields.font.value), rotation: noteRotation(draftFields.rotation.value), size: Number(draftFields.size.value)};
    if (appearance.text.length > 1200 || !/^#[0-9a-fA-F]{6}$/.test(appearance.color) || !Number.isFinite(appearance.size) || appearance.size < .2 || appearance.size > 2) return;
    if (requestedAnchor) {
      const note = {...newNote(pageId, requestedAnchor), ...appearance};
      if (persist({version: 1, notes: [...bundle.notes, note]})) { resetDraftText(appearance); notesShown = true; select.value = note.id; closeRequestedDraft(); refresh(); }
    }
  });
  function refresh() {
    if (activeId && dialog.open) {
      const focused = bundle.notes.find(item => item.id === activeId);
      if (focused) renderFocusedNote(focused);
      else shut();
    }
    if (pageId === 'graphics') instructions.textContent = adapter
      ? 'Set the note appearance, choose Place new note, then click a book, box, or shelf surface.'
      : 'Graphics is loading. Placement becomes available when the scene is ready.';
    const old = select.value;
    select.replaceChildren();
    const draftOption = root.createElement('option');
    draftOption.value = '';
    draftOption.textContent = 'New note (draft)';
    select.append(draftOption);
    for (const note of pageNotes()) {
      const option = root.createElement('option');
      option.value = note.id;
      option.textContent = note.text.trim().slice(0, 40) || `Untitled ${note.id.slice(-6)}`;
      select.append(option);
    }
    if ([...select.options].some(option => option.value === old)) select.value = old;
    const note = selected();
    const appearance = note || draft;
    editor.style.setProperty('--sticky-note-font', noteFontFamily(appearance.font));
    text.style.font = `1.2rem/1.45 ${noteFontFamily(appearance.font)}`;
    void loadNoteFont(appearance.font);
    if (!appearanceFields.includes(root.activeElement)) {
      text.value = appearance.text; color.value = appearance.color; font.value = noteFontId(appearance.font);
      rotation.value = String(appearance.rotation); size.value = String(appearance.size);
    }
    for (const field of [text, color, font, rotation, size]) field.disabled = false;
    remove.disabled = !note;
    attachmentInput.disabled = !note;
    clearAttachment.disabled = !note?.attachment;
    reposition.disabled = !note || !adapter;
    placeButton.disabled = !adapter || !authoringEnabled || reachedNoteLimit();
    if (adapter) {
      adapter.setNotes(pageNotes(), dismissed());
      adapter.setPlacing(placing);
      adapter.setEditingFocused?.(appearanceFields.includes(root.activeElement));
      adapter.setNotesShown(notesShown);
      showAnchorIssues();
    }
    updateIcon();
    if (storeError) report(storeError);
  }
  const placeButton = makeButton('Place new note', () => {
    if (!adapter) { report('The page is still loading. Try again when it appears.'); return; }
    if (!saveDraft()) return;
    select.value = '';
    refresh();
    startPlacement(true);
    report('Click a visible surface to place the note. Press Escape to cancel.');
  });
  const reposition = makeButton('Reposition selected', () => {
    if (!adapter || !selected()) return;
    startPlacement(select.value);
    report('Click a visible surface to move the note. Press Escape to cancel.');
  });
  const remove = makeButton('Delete selected', () => {
    const note = selected();
    if (note) {
      stopPlacement();
      persist({version: 1, notes: bundle.notes.filter(item => item.id !== note.id)});
    }
  });
  const cancelPlacement = makeButton('Cancel placement', () => stopPlacement('Placement cancelled.'));
  cancelPlacement.hidden = true;
  function startPlacement(value) {
    if (!authoringEnabled || value === true && reachedNoteLimit()) return;
    placing = value;
    cancelPlacement.hidden = false;
    adapter?.setPlacing(value);
  }
  function stopPlacement(message) {
    if (!placing) return;
    placing = false;
    cancelPlacement.hidden = true;
    adapter?.setPlacing(false);
    if (message) report(message);
  }
  function updateIcon() {
    icon.hidden = !adapter;
    const notes = pageNotes();
    icon.disabled = !adapter;
    const hasNotes = notes.length > 0;
    icon.removeAttribute('aria-pressed');
    icon.setAttribute('aria-label', !hasNotes ? 'Add a sticky note' : 'Read sticky note');
    hint.textContent = !hasNotes ? 'Add a note' : previewToggle.checked ? notes[0].text.trim().slice(0, 90) || 'Click to read' : 'Click to read';
    icon.classList.toggle('sticky-notes-icon--preview', previewToggle.checked && hasNotes);
    const first = notes[0];
    if (first) {
      icon.style.setProperty('--sticky-color', first.color);
      icon.style.setProperty('--sticky-ink', inkFor(first.color));
      icon.style.setProperty('--sticky-icon-rotation', `${first.rotation}deg`);
      icon.style.setProperty('--sticky-note-size', String(first.size));
      icon.style.setProperty('--sticky-note-font', noteFontFamily(first.font));
      void loadNoteFont(first.font);
    } else {
      icon.style.removeProperty('--sticky-color');
      icon.style.removeProperty('--sticky-ink');
      icon.style.removeProperty('--sticky-icon-rotation');
      icon.style.removeProperty('--sticky-note-size');
      icon.style.removeProperty('--sticky-note-font');
    }
  }
  const exportButton = makeButton('Export bundle', () => {
    const blob = new Blob([JSON.stringify(validateBundle(bundle), null, 2) + '\n'], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = root.createElement('a');
    link.href = url;
    link.download = 'sticky-notes.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    report('Exported all page notes without read history.');
  });
  const fileLabel = root.createElement('label');
  fileLabel.textContent = 'Import bundle';
  const file = root.createElement('input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.setAttribute('aria-label', 'Import sticky notes bundle');
  fileLabel.append(file);
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    try {
      if (chosen.size > 500000) throw Error('File is too large.');
      const incoming = validateBundle(JSON.parse(await chosen.text()));
      persist(mergeBundles(bundle, incoming));
    } catch (error) {
      report(`Import failed: ${error.message}`);
    } finally {
      file.value = '';
    }
  });
  attachmentInput.addEventListener('change', async () => {
    const note = selected(), chosen = attachmentInput.files?.[0];
    if (!note || !chosen) { attachmentInput.value = ''; return; }
    try {
      if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw Error('Import files from the local review server.');
      if (chosen.size > 20 * 1024 * 1024) throw Error('Files must be 20 MB or smaller.');
      const encoded = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(chosen); });
      const response = await fetch('/__admin/docs/upload', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Docs-Library': '1' }, body: JSON.stringify({ filename: chosen.name, data: encoded }) });
      const result = await response.json(); if (!response.ok) throw Error(result.error || 'Import failed.');
      const attachment = { name: chosen.name.slice(0, 160), url: result.sourceUrl.replace(/^\.\/documents\//, '/_6-docs/documents/') };
      if (result.pageImages?.length) { attachment.pageImages = result.pageImages.map(path => path.replace(/^\.\/documents\//, '/_6-docs/documents/')); attachment.pageCount = result.pageCount; attachment.coverFirst = true; }
      persist({ version: 1, notes: bundle.notes.map(item => item.id === note.id ? { ...item, attachment } : item) });
    } catch (error) { report(`Import failed: ${error.message}`); }
    finally { attachmentInput.value = ''; }
  });
  const clearAttachment = makeButton('Remove attachment', () => { const note = selected(); if (!note?.attachment) return; const next = { ...note }; delete next.attachment; persist({ version: 1, notes: bundle.notes.map(item => item.id === note.id ? next : item) }); });
  editor.append(title, previewSetting, instructions, select, controls, attachmentLabel, buttons, fileLabel, status, anchorStatus);
  previewToggle.addEventListener('change', () => {
    const result = settings?.patch?.({'stickyNotes.preview': previewToggle.checked});
    if (!result?.ok) previewToggle.checked = settings?.get?.().stickyNotes?.preview !== false;
    updateIcon();
  });
  select.addEventListener('change', () => {
    stopPlacement();
    refresh();
  });
  for (const field of [text, color, font, rotation, size]) field.addEventListener('change', () => {
    const note = selected();
    if (!note) { saveDraft(); return; }
    const next = {
      ...note, text: text.value, color: color.value, font: noteFontId(font.value),
      rotation: noteRotation(rotation.value), size: Number(size.value)
    };
    persist({version: 1, notes: bundle.notes.map(item => item.id === note.id ? next : item)});
  });
  function saveDismissed() {
    try {
      localStorage.setItem(dismissedKey, JSON.stringify(readHistory));
    } catch (error) {
      report(`Read history could not be saved: ${error.message}`);
    }
  }
  let returnFocus = null;
  let animation = null;
  let transition = 0;
  let closing = false;
  function open(id, {fromIcon = false} = {}) {
    const note = bundle.notes.find(item => item.id === id);
    if (!note) return;
    const alreadyOpen = dialog.open;
    if (alreadyOpen) { animation?.cancel(); animation = null; }
    transition++;
    closing = false;
    activeId = id;
    previousNote.hidden = nextNote.hidden = editFocused.hidden = false;
    if (!alreadyOpen) returnFocus = root.activeElement;
    renderFocusedNote(note);
    readHistory[id] = fingerprint(note);
    saveDismissed();
    adapter?.setNotes(pageNotes(), dismissed());
    if (!alreadyOpen) dialog.show();
    dialog.classList.add('sticky-notes-open');
    if (!alreadyOpen) { animateDialog(id, true, fromIcon); close.focus(); }
    refresh();
  }
  function stepNote(direction) {
    const notes = readerNotes(), index = notes.findIndex(note => note.id === activeId);
    const target = notes[index + direction];
    if (target) open(target.id);
  }
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches ||
    !!settings?.get?.().accessibility?.reducedMotion;
  function animateDialog(id, opening, fromIcon = false) {
    animation?.cancel();
    animation = null;
    if (reduced()) return;
    const from = opening
      ? fromIcon ? icon.getBoundingClientRect() : adapter?.getAnchorRect(id) || icon.getBoundingClientRect()
      : icon.getBoundingClientRect();
    const to = dialog.getBoundingClientRect();
    if (!from?.width || !to.width) return;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scale = Math.max(.08, Math.min(.6, from.width / to.width));
    const dock = {transform: `translate(${dx}px,${dy}px) scale(${scale})`, opacity: 0};
    const center = {transform: 'translate(0,0) scale(1)', opacity: 1};
    animation = dialog.animate(opening ? [dock, center] : [center, dock], {
      duration: opening ? 300 : 230,
      easing: 'ease-in-out'
    });
  }
  function finishClose(generation) {
    if (generation !== transition || !dialog.open || disposed) return;
    dialog.classList.remove('sticky-notes-open');
    dialog.close();
    activeId = null;
    closing = false;
    const candidate = returnFocus;
    const focusable = candidate?.isConnected && !candidate.disabled &&
      candidate !== root.body && candidate.tagName !== 'CANVAS' &&
      candidate.getClientRects().length > 0 &&
      candidate.matches?.('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (focusable ? candidate : !icon.disabled ? icon : exportButton).focus();
    returnFocus = null;
    adapter?.setNotes(pageNotes(), dismissed());
    refresh();
  }
  function shut() {
    if (!dialog.open || closing) return;
    closing = true;
    const generation = ++transition;
    animation?.cancel();
    animateDialog(activeId, false);
    Promise.resolve(animation?.finished).catch(() => {}).then(() => finishClose(generation));
  }
  const systemReduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finishForReduced = () => {
    if (!reduced() || !animation) return;
    animation.cancel();
    animation = null;
    if (closing) finishClose(transition);
  };
  systemReduced.addEventListener('change', finishForReduced);
  const stopSettings = settings?.subscribe?.(snapshot => {
    finishForReduced();
    previewToggle.checked = snapshot.stickyNotes?.preview !== false;
    updateIcon();
  }) || (() => {});
  close.addEventListener('click', shut);
  previousNote.addEventListener('click', () => stepNote(-1));
  nextNote.addEventListener('click', () => stepNote(1));
  root.addEventListener('pointerdown', event => {
    if (dialog.open && !dialog.contains(event.target) && !event.target.closest?.('#review-panels')) shut();
  }, {capture: true, signal});
  root.addEventListener('keydown', event => {
    if (dialog.open && event.key === 'Escape' && !draftDialog.open) { event.preventDefault(); shut(); }
  }, {capture: true, signal});
  editFocused.addEventListener('click', () => {
    if (!activeId) return;
    select.value = activeId; refresh();
    initPanelShell().openConstructor('general');
    editor.closest('details')?.setAttribute('open', '');
    text.focus();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); shut(); });
  function openList() {
    if (dialog.open) return;
    const visible = pageNotes().filter(note => adapter?.isVisible(note.id));
    if (!visible.length) return;
    activeId = null;
    previousNote.hidden = nextNote.hidden = editFocused.hidden = true;
    closing = false;
    transition++;
    returnFocus = icon;
    body.replaceChildren();
    const list = root.createElement('div');
    list.className = 'sticky-notes-list';
    for (const note of visible) {
      const button = root.createElement('button');
      button.type = 'button';
      button.textContent = (dismissed().has(note.id) ? 'Read: ' : 'Unread: ') +
        (note.text.trim().slice(0, 70) || 'Empty sticky note');
      button.addEventListener('click', event => {
        event.stopPropagation();
        dialog.close();
        open(note.id);
        returnFocus = icon;
      });
      list.append(button);
    }
    body.append(list);
    dialog.style.setProperty('--sticky-color', '#fff2a8');
    dialog.show();
    dialog.classList.add('sticky-notes-open');
    animateDialog(null, true);
    list.querySelector('button')?.focus();
  }
  icon.addEventListener('click', () => {
    if (!pageNotes().length) { initPanelShell().openConstructor('general'); placeButton.focus(); }
    else if (pageNotes().length === 1) open(pageNotes()[0].id, {fromIcon: true});
    else openList();
  });
  icon.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!pageNotes().length) { initPanelShell().openConstructor('general'); placeButton.focus(); }
      else if (pageNotes().length === 1) open(pageNotes()[0].id, {fromIcon: true});
      else openList();
    }
  });
  const onKey = event => {
    if (event.key === 'Escape' && placing) {
      event.preventDefault();
      event.stopImmediatePropagation();
      stopPlacement('Placement cancelled.');
    }
  };
  root.addEventListener('keydown', onKey, true);
  const onStorage = event => {
    if (event.key !== 'site.sticky-notes.v1') return;
    try { bundle = event.newValue ? validateBundle(JSON.parse(event.newValue)) : published; refresh(); }
    catch (error) { report(`Notes changed in another tab but could not be read: ${error.message}`); }
  };
  root.defaultView?.addEventListener('storage', onStorage);
  const importBundle = incoming => persist(mergeBundles(bundle, incoming));
  function showAnchorIssues(){
    const count=adapter?.unresolvedCount?.()||0;
    const message=count?`${count} note attachment${count===1?' is':'s are'} unresolved in this scene. Check the source geometry or reattach the note.`:'';
    if(anchorStatus.textContent!==message)anchorStatus.textContent=message;
  }
  let fallbackAdapter = null, fallbackRenderer = null;
  const instance = {
    api: {constructorElement: editor, readBundle: () => validateBundle(bundle), importBundle, dispose},
    replaceAdapter(next) {
      if (adapter && adapter !== next) {
        adapter.setHandlers?.(null);
        if (adapter === fallbackAdapter) { adapter.dispose?.(); fallbackAdapter = null; }
        if (fallbackRenderer) { fallbackRenderer.setHandlers(null); fallbackRenderer.dispose(); fallbackRenderer = null; }
      }
      if (next !== fallbackAdapter && !next.composesDOMFallback) {
        fallbackRenderer = createDOMStickyAdapter({pageId, root, register: false, visualOnly: true});
        next = composePageAnchors(next, fallbackRenderer, pageId);
      }
      adapter = next;
      adapter.setHandlers({
        open,
        report,
        requestDraft,
        getPlacementAppearance: () => draft,
        selectNote(id) {
          if (!bundle.notes.some(note => note.id === id && note.pageId === pageId)) return;
          stopPlacement();
          select.value = id;
          refresh();
          open(id);
        },
        onPlaceWithAppearance(anchor, appearance) {
          if (!authoringEnabled || reachedNoteLimit()) return false;
          const note = {...newNote(pageId, anchor), ...appearance};
          if (!persist({version: 1, notes: [...bundle.notes, note]})) return false;
          resetDraftText(appearance);
          notesShown = true;
          select.value = note.id;
          refresh();
          report('Note placed. Edit it in Constructor.');
          return true;
        },
        visibilityChanged() {
          updateIcon();
          showAnchorIssues();
        },
        onPlace(anchor) {
          if (!authoringEnabled || !placing) return;
          const old = typeof placing === 'string' ? bundle.notes.find(note => note.id === placing) : null;
          if (!old && reachedNoteLimit()) { stopPlacement('The Graphics page already has its overview note. Edit or reposition it instead.'); return; }
          if (!old && !saveDraft()) return;
          const note = old ? {...old, anchor} : {...newNote(pageId, anchor), ...draft};
          const changed = old
            ? bundle.notes.map(item => item.id === old.id ? note : item)
            : [...bundle.notes, note];
          if (persist({version: 1, notes: changed})) {
            if (!old) resetDraftText(draft);
            stopPlacement();
            notesShown = true;
            select.value = note.id;
            refresh();
            report('Note placed. Edit it in Constructor.');
          }
        }
      });
      refresh();
    },
    connect(next) { this.replaceAdapter(next); }
  };
  function dispose() {
    if (disposed) return;
    disposed = true;
    stopPlacement();
    mounts.delete(pageId);
    transition++;
    animation?.cancel();
    stopArchive();
    stopSettings();
    systemReduced.removeEventListener('change', finishForReduced);
    root.defaultView?.removeEventListener('storage', onStorage);
    defaultView?.removeEventListener('site:header-layout-change', positionIcon);
    defaultView?.removeEventListener('resize', positionIcon);
    hostVisibilityObserver?.disconnect();
    stopFloatingViewport();
    adapter?.setEditingFocused?.(false);
    adapter?.setHandlers(null);
    fallbackRenderer?.dispose(); fallbackRenderer = null;
    if (adapter === fallbackAdapter) adapter.dispose?.();
    if (adapters.get(pageId) === fallbackAdapter) adapters.delete(pageId);
    root.removeEventListener('keydown', onKey, true);
    signal?.removeEventListener('abort', dispose);
    if (dialog.open) dialog.close();
    if (draftDialog.open) draftDialog.close();
    icon.remove();
    dialog.remove();
    draftDialog.remove();
    editor.remove();
    style.remove();
  }
  stopArchive = archive.register('annotations.sticky-notes', {
    page: 'general',
    read: () => validateBundle(bundle),
    apply: importBundle,
    validate(value) {
      try { validateBundle(value); return true; }
      catch { return false; }
    },
    restore: false
  });
  mounts.set(pageId, instance);
  signal?.addEventListener('abort', dispose, {once: true});
  if (adapters.has(pageId)) instance.connect(adapters.get(pageId));
  else {
    fallbackAdapter = createDOMStickyAdapter({pageId, root, register: false});
    instance.connect(fallbackAdapter);
    adapters.set(pageId, fallbackAdapter);
  }
  refresh();
  return instance.api;
}
