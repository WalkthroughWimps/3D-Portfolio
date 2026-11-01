const ARTWORK_CATALOG_URL = '/_1-about/faces/about/assets/artwork/index.json';

const KEY = 'site.about.picture-library.v2';
const DB_NAME = 'site-about-picture-assets-v1';
const STORE = 'images';
const clone = value => JSON.parse(JSON.stringify(value));
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
const validAsset = asset => asset === null || typeof asset === 'string'
  && (/^local:[a-f0-9-]{36}$/.test(asset) || /^folder:[^/\\\x00-\x1f]{1,240}$/.test(asset));

export function normalizeCaption(value) {
  const lines = String(value ?? '').replace(/\r/g, '').split('\n').map(line => line.trim());
  while (lines.at(-1) === '') lines.pop();
  if (lines.length > 3) throw new RangeError('Use up to three caption lines.');
  if (lines.some(line => line.length > 100)) throw new RangeError('Keep each caption line within 100 characters.');
  return lines;
}
function validEntry(raw) {
  if (!raw || !validId(raw.id) || typeof raw.name !== 'string' || !raw.name.trim()
    || raw.name.length > 240 || !validAsset(raw.asset) || !Number.isInteger(raw.revision)
    || raw.revision < 1 || !Array.isArray(raw.lines)) return null;
  try {
    const lines = normalizeCaption(raw.lines.join('\n'));
    if (lines.length !== raw.lines.length) return null;
    return {id: raw.id, name: raw.name.trim(), lines, asset: raw.asset, revision: raw.revision};
  } catch {return null;}
}
function normalizeEntries(value) {
  if (!Array.isArray(value) || value.length > 100) throw new TypeError('Invalid picture collection.');
  const seen = new Set(), entries = [];
  for (const item of value) {
    const entry = validEntry(item);
    if (!entry || seen.has(entry.id) || entry.asset?.startsWith('folder:'))
      throw new TypeError('Invalid picture collection entry.');
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
  let custom = [];
  try {custom = normalizeEntries(JSON.parse(localStorage.getItem(KEY) || '[]'));} catch {custom = [];}
  let folder = [];
  let overrides = {};
  try {overrides = JSON.parse(localStorage.getItem(`${KEY}.folder-captions`) || '{}') || {};} catch {overrides = {};}
  const persist = () => localStorage.setItem(KEY, JSON.stringify(custom));
  const entries = () => [...folder, ...custom];
  const list = () => clone(entries());
  const get = id => {const entry = entries().find(item => item.id === id); return entry ? clone(entry) : null;};
  return {
    list, get, snapshot: get,
    has: id => entries().some(item => item.id === id),
    isFolder: id => folder.some(item => item.id === id),
    async loadFolder() {
      const response = await fetch(ARTWORK_CATALOG_URL, {cache: 'no-store'});
      if (!response.ok) throw new Error('Could not read the About artwork folder.');
      const catalog = await response.json();
      if (catalog?.version !== 1 || !Array.isArray(catalog.files) || catalog.files.length > 100)
        throw new Error('Invalid About artwork catalog.');
      const seen = new Set();
      folder = catalog.files.map(file => {
        if (!validId(file.id) || typeof file.name !== 'string' || !/\.(?:jpe?g|png|webp|gif)$/i.test(file.name)
          || !validAsset(`folder:${file.name}`) || !Number.isInteger(file.revision) || file.revision < 1
          || seen.has(file.id)) throw new Error('Invalid About artwork file.');
        seen.add(file.id);
        const lines = Array.isArray(overrides[file.id]) ? normalizeCaption(overrides[file.id].join('\n')) : [];
        return {id: file.id, name: file.name.replace(/\.[^.]+$/, ''), lines,
          asset: `folder:${file.name}`, revision: file.revision};
      });
      return list();
    },
    add() {
      if (entries().length >= 100) throw new Error('Keep the picture collection to 100 entries or fewer.');
      const id = `picture_${crypto.randomUUID().replaceAll('-', '')}`;
      const entry = {id, name: 'New picture', lines: [], asset: null, revision: 1};
      custom.push(entry); persist(); return clone(entry);
    },
    update(id, fields) {
      const collection = folder.some(item => item.id === id) ? folder : custom;
      const index = collection.findIndex(item => item.id === id);
      if (index < 0) throw new Error('Picture no longer exists.');
      const candidate = {...collection[index], ...fields, revision: collection[index].revision + 1};
      const entry = validEntry(candidate);
      if (!entry) throw new Error('Picture name, caption, or image reference is invalid.');
      collection[index] = entry;
      if (collection === folder) {
        overrides[id] = entry.lines;
        localStorage.setItem(`${KEY}.folder-captions`, JSON.stringify(overrides));
      } else persist();
      return clone(entry);
    },
    remove(id) {
      if (folder.some(item => item.id === id)) throw new Error('Remove this image from the artwork folder, then refresh.');
      custom = custom.filter(item => item.id !== id); persist();
    },
    move(id, offset) {
      const index = custom.findIndex(item => item.id === id), target = index + offset;
      if (index < 0 || target < 0 || target >= custom.length) return false;
      [custom[index], custom[target]] = [custom[target], custom[index]]; persist(); return true;
    },
    exportMetadata: () => clone(custom),
    validateMetadata: value => {normalizeEntries(value); return true;},
    applyMetadata(value) {custom = normalizeEntries(value); persist(); return list();},
    async saveImage(blob) {
      const asset = `local:${crypto.randomUUID()}`;
      await storeBlob(asset, blob);
      return asset;
    },
    async imageFor(entry) {
      if (!entry?.asset) return null;
      if (entry.asset.startsWith('folder:')) {
        const file = entry.asset.slice(7);
        if (!folder.some(item => item.id === entry.id && item.asset === entry.asset))
          throw new Error('This artwork file is no longer in the folder.');
        const base = new URL('./assets/artwork/', import.meta.url);
        return decodeURL(new URL(encodeURIComponent(file), base).href);
      }
      const blob = await readBlob(entry.asset);
      if (!blob) throw new Error('This picture image is stored on another device or was cleared. Reimport it here.');
      return decodeURL(URL.createObjectURL(blob), true);
    }
  };
}
