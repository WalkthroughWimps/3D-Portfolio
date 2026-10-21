import {ART_SAMPLES, ART_FILES, SAMPLE_LINES} from './sample-art.js';

const KEY = 'site.about.picture-library.v1';
const DB_NAME = 'site-about-picture-assets-v1';
const STORE = 'images';
const clone = value => JSON.parse(JSON.stringify(value));
const BUILTINS = Object.freeze(Object.keys(ART_SAMPLES).map(id => ({
  id, name: ART_SAMPLES[id], lines: [...SAMPLE_LINES[id]], asset: `builtin:${id}`, revision: 1
})));
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
const validAsset = asset => asset === null || typeof asset === 'string'
  && (/^builtin:[a-zA-Z0-9_-]{1,80}$/.test(asset) || /^local:[a-f0-9-]{36}$/.test(asset));

export function normalizeCaption(value) {
  const lines = String(value ?? '').replace(/\r/g, '').split('\n').map(line => line.trim());
  while (lines.at(-1) === '') lines.pop();
  if (lines.length > 3) throw new RangeError('Use up to three caption lines.');
  if (lines.some(line => line.length > 100)) throw new RangeError('Keep each caption line within 100 characters.');
  return lines;
}
function validEntry(raw) {
  if (!raw || !validId(raw.id) || typeof raw.name !== 'string' || !raw.name.trim()
    || raw.name.length > 80 || !validAsset(raw.asset) || !Number.isInteger(raw.revision)
    || raw.revision < 1 || !Array.isArray(raw.lines)) return null;
  try {
    const lines = normalizeCaption(raw.lines.join('\n'));
    if (lines.length !== raw.lines.length) return null;
    return {id: raw.id, name: raw.name.trim(), lines, asset: raw.asset, revision: raw.revision};
  } catch {return null;}
}
function normalizeEntries(value, strict = false) {
  if (!Array.isArray(value) || !value.length || value.length > 100) {
    if (strict) throw new TypeError('Invalid picture collection.');
    return clone(BUILTINS);
  }
  const seen = new Set(), entries = [];
  for (const item of value) {
    const entry = validEntry(item);
    if (!entry || seen.has(entry.id)) {
      if (strict) throw new TypeError('Invalid picture collection entry.');
      return clone(BUILTINS);
    }
    seen.add(entry.id); entries.push(entry);
  }
  return entries;
}
function openDB() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {reject(new Error('Browser image storage is unavailable.')); return;}
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {request.result.createObjectStore(STORE);};
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open browser image storage.'));
  });
}
async function storeBlob(key, blob) {
  const db = await openDB();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(blob, key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not save image.'));
      transaction.onabort = () => reject(transaction.error || new Error('Image save was cancelled.'));
    });
  } finally {db.close();}
}
async function readBlob(key) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Could not read saved image.'));
    });
  } finally {db.close();}
}
export async function prepareImage(file) {
  if (!file || !/^image\/(png|jpeg|webp|avif|gif)$/i.test(file.type))
    throw new TypeError('Choose a PNG, JPEG, WebP, AVIF, or GIF image.');
  if (file.size > 25 * 1024 * 1024) throw new RangeError('Choose an image under 25 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value =>
      value ? resolve(value) : reject(new Error('Could not encode the imported image.')), 'image/webp', .9));
    return blob;
  } finally {bitmap.close();}
}
async function decodeURL(url, revoke = false) {
  const image = new Image();
  image.src = url;
  try {await image.decode(); return image;}
  finally {if (revoke) URL.revokeObjectURL(url);}
}
export function createPictureLibrary() {
  let entries;
  try {entries = normalizeEntries(JSON.parse(localStorage.getItem(KEY) || 'null'));}
  catch {entries = clone(BUILTINS);}
  const persist = next => {localStorage.setItem(KEY, JSON.stringify(next)); entries = next;};
  const list = () => clone(entries);
  const get = id => {const entry = entries.find(item => item.id === id); return entry ? clone(entry) : null;};
  const snapshot = id => get(id);
  return {
    list, get, snapshot,
    has: id => entries.some(item => item.id === id),
    add() {
      if (entries.length >= 100) throw new Error('Keep the picture collection to 100 entries or fewer.');
      const id = `picture_${crypto.randomUUID().replaceAll('-', '')}`;
      const entry = {id, name: 'New picture', lines: [], asset: null, revision: 1};
      persist([...entries, entry]); return clone(entry);
    },
    update(id, fields) {
      const index = entries.findIndex(item => item.id === id);
      if (index < 0) throw new Error('Picture no longer exists.');
      const candidate = {...entries[index], ...fields, revision: entries[index].revision + 1};
      const entry = validEntry(candidate);
      if (!entry) throw new Error('Picture name, caption, or image reference is invalid.');
      const next = [...entries]; next[index] = entry; persist(next); return clone(entry);
    },
    remove(id) {
      if (entries.length <= 1) throw new Error('Keep at least one picture.');
      persist(entries.filter(item => item.id !== id));
    },
    move(id, offset) {
      const index = entries.findIndex(item => item.id === id), target = index + offset;
      if (index < 0 || target < 0 || target >= entries.length) return false;
      const next = [...entries]; [next[index], next[target]] = [next[target], next[index]];
      persist(next); return true;
    },
    validateMetadata: value => {normalizeEntries(value, true); return true;},
    applyMetadata(value) {const next = normalizeEntries(value, true); persist(next); return list();},
    async saveImage(blob) {
      const asset = `local:${crypto.randomUUID()}`;
      await storeBlob(asset, blob);
      return asset;
    },
    async imageFor(entry) {
      if (!entry?.asset) return null;
      if (entry.asset.startsWith('builtin:')) {
        const id = entry.asset.slice(8), file = ART_FILES[id];
        if (!file) throw new Error('Built-in picture is unavailable.');
        return decodeURL(new URL(`./assets/4-perspectives/${file}`, import.meta.url).href);
      }
      const blob = await readBlob(entry.asset);
      if (!blob) throw new Error('This picture image is stored on another device or was cleared. Reimport it here.');
      return decodeURL(URL.createObjectURL(blob), true);
    }
  };
}
