export const PAGE_IDS = new Set(['start', 'about', 'videos', 'graphics', 'games', 'music', 'docs']);
export const STORAGE_KEY = 'site.sticky-notes.v1';
import { DEFAULT_NOTE_FONT, noteFontId, noteRotation } from './note-appearance.js';

const MAX_NOTES = 300;
const MAX_TEXT = 1200;
const MAX_BYTES = 500000;

const finite = (value, min, max) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const plain = value =>
  typeof value === 'string' && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);

export function inkFor(hex) {
  const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = rgb.map(value =>
    value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
  );
  const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  return luminance > .179 ? '#000000' : '#ffffff';
}

function validateAnchor(anchor) {
  if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor) ||
      !plain(anchor.surface) || anchor.surface.length > 160 ||
      !/^[a-zA-Z0-9:._-]+$/.test(anchor.surface) ||
      !Number.isInteger(anchor.triangle) || anchor.triangle < 0 || anchor.triangle > 10000000 ||
      !Array.isArray(anchor.bary) || anchor.bary.length !== 3 ||
      !anchor.bary.every(value => finite(value, 0, 1)) ||
      Math.abs(anchor.bary.reduce((sum, value) => sum + value, 0) - 1) > .002) {
    throw Error('Invalid sticky note attachment.');
  }
  const plane = anchor.plane;
  if (plane && (!(anchor.surface.startsWith('about:plane:') || anchor.surface.startsWith('book:') ||
        anchor.surface.startsWith('game:') || anchor.surface.startsWith('shelf:') ||
        anchor.surface.startsWith('environment:') || anchor.surface.startsWith('context:')) ||
      !['point', 'normal', 'tangent'].every(key =>
        Array.isArray(plane[key]) && plane[key].length === 3 &&
        plane[key].every(value => finite(value, -10000, 10000))) ||
      Math.hypot(...plane.normal) < .99 || Math.hypot(...plane.normal) > 1.01 ||
      Math.hypot(...plane.tangent) < .99 || Math.hypot(...plane.tangent) > 1.01 ||
      Math.abs(plane.normal.reduce((sum, value, index) => sum + value * plane.tangent[index], 0)) > .05)) {
    throw Error('Invalid sticky note attachment plane.');
  }
  if (plane?.version !== undefined && (plane.version !== 2 || !['displacement', 'clearance'].every(key =>
    Array.isArray(plane[key]) && plane[key].length === 3 && plane[key].every(value => finite(value, -10000, 10000))))) throw Error('Invalid sticky note attachment offsets.');
  return {
    surface: anchor.surface,
    triangle: anchor.triangle,
    bary: [...anchor.bary],
    ...(plane ? {plane: {...Object.fromEntries(['point', 'normal', 'tangent'].map(key => [key, [...plane[key]]])), ...(plane.version === 2 ? {version: 2, displacement: [...plane.displacement], clearance: [...plane.clearance]} : {})}} : {})
  };
}

function validateNote(note, ids) {
  if (!note || typeof note !== 'object' || Array.isArray(note) ||
      !plain(note.id) || !/^[a-zA-Z0-9_-]{8,80}$/.test(note.id) || ids.has(note.id) ||
      !PAGE_IDS.has(note.pageId) || !plain(note.text) || note.text.length > MAX_TEXT ||
      !/^#[0-9a-fA-F]{6}$/.test(note.color) ||
      !finite(note.rotation, -180, 180) || !finite(note.size, .2, 2)) {
    throw Error('Invalid sticky note.');
  }
  ids.add(note.id);
  return {
    id: note.id,
    pageId: note.pageId,
    text: note.text,
    color: note.color,
    rotation: noteRotation(note.rotation),
    font: noteFontId(note.font ?? DEFAULT_NOTE_FONT),
    size: note.size,
    anchor: validateAnchor(note.anchor),
    ...(note.attachment ? { attachment: validateAttachment(note.attachment) } : {})
  };
}
function validateAttachment(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !plain(value.name) || value.name.length < 1 || value.name.length > 160 ||
      typeof value.url !== 'string' || !/^\/_6-docs\/documents\/[a-z0-9-]+\.(pdf|png|jpe?g|webp|docx|pptx|xlsx|odt|odp|ods|rtf|txt|md)$/i.test(value.url)) throw Error('Invalid note attachment.');
  const clean = { name: value.name, url: value.url };
  if (value.pageImages !== undefined) {
    if (!/\.pdf$/i.test(value.url) || !Array.isArray(value.pageImages) || !value.pageImages.length || value.pageImages.length > 120 ||
        !value.pageImages.every(path => typeof path === 'string' && /^\/_6-docs\/documents\/[a-z0-9-]+-page-\d+\.jpg$/i.test(path)) ||
        !Number.isInteger(value.pageCount) || value.pageCount < value.pageImages.length || value.pageCount > 100000) throw Error('Invalid PDF attachment pages.');
    clean.pageImages = [...value.pageImages];
    clean.pageCount = value.pageCount;
    clean.coverFirst = value.coverFirst !== false;
  }
  return clean;
}

export function validateBundle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.version !== 1 || !Array.isArray(value.notes) || value.notes.length > MAX_NOTES) {
    throw Error('Invalid sticky note bundle.');
  }
  const ids = new Set();
  const bundle = {version: 1, notes: value.notes.map(note => validateNote(note, ids))};
  if (JSON.stringify(bundle).length > MAX_BYTES) throw Error('Sticky note bundle is too large.');
  return bundle;
}

export function mergeBundles(current, incoming) {
  const base = validateBundle(current);
  const next = validateBundle(incoming);
  const byId = new Map(base.notes.map(note => [note.id, note]));
  for (const note of next.notes) byId.set(note.id, note);
  return validateBundle({version: 1, notes: [...byId.values()]});
}

export function readLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? validateBundle(JSON.parse(raw)) : null;
}

export function writeLocal(bundle) {
  const valid = validateBundle(bundle);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
  return valid;
}

// Reuse appearance preferences, never another note's words.
export function blankNoteAppearance(appearance = {}) {
  return {text: '', color: appearance.color ?? '#fff2a8', rotation: noteRotation(appearance.rotation), size: appearance.size ?? 1, font: noteFontId(appearance.font)};
}

export function newNote(pageId, anchor) {
  return {
    id: 'note_' + crypto.randomUUID().replaceAll('-', ''),
    pageId,
    ...blankNoteAppearance(),
    anchor
  };
}
