export const NOTE_FONTS = Object.freeze([
  { id: 'matt', label: 'Matt Handwriting', family: 'Sticky Matt', file: 'MattHandwriting.otf' },
  { id: 'caveat', label: 'Caveat', family: 'Sticky Caveat', file: 'Caveat.ttf' },
  { id: 'kalam', label: 'Kalam', family: 'Sticky Kalam', file: 'Kalam-Regular.ttf' },
  { id: 'system', label: 'Plain / system', family: 'system-ui' }
]);
export const DEFAULT_NOTE_FONT = 'matt';
const byId = new Map(NOTE_FONTS.map(font => [font.id, font]));
const loads = new Map();
export function noteFontId(value) { return byId.has(value) ? value : DEFAULT_NOTE_FONT; }
export function noteFontFamily(value) { return `"${byId.get(noteFontId(value)).family}", system-ui, sans-serif`; }
export function noteCanvasFont(value, pixels) { return `${pixels}px ${noteFontFamily(value)}`; }
export function noteRotation(value) { return Math.max(-10, Math.min(10, Number(value) || 0)); }
export function loadNoteFont(value) {
  const font = byId.get(noteFontId(value));
  if (!font.file || typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve(false);
  if (!loads.has(font.id)) {
    const url = new URL(`../../assets/fonts/sticky-notes/${font.file}`, import.meta.url);
    const face = new FontFace(font.family, `url("${url.href}")`);
    loads.set(font.id, face.load().then(loaded => { document.fonts.add(loaded); return true; }).catch(() => false));
  }
  return loads.get(font.id);
}
export function makeNoteFontSelect(root = document) {
  const select = root.createElement('select');
  for (const font of NOTE_FONTS) select.add(new Option(font.label, font.id));
  return select;
}
