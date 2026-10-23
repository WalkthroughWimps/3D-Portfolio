// Original uploads stay on this device. Portable archives carry only compact previews.
const DB_NAME = 'refs-plate-picture-sources';
const STORE = 'originals';
const MAX_SOURCES = 64;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Local picture storage unavailable')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, {keyPath: 'id'});
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onblocked = () => { blocked = true; reject(new Error('Local picture storage is busy')); };
    request.onerror = () => reject(request.error);
  });
}

async function transaction(mode, work) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      let request;
      try {
        const tx = db.transaction(STORE, mode);
        request = work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      } catch (error) { reject(error); }
    });
  } finally { db.close(); }
}

export async function getRefsOriginal(id) {
  if (!id) return null;
  try { return (await transaction('readonly', store => store.get(id)))?.blob ?? null; }
  catch { return null; }
}

export async function saveRefsOriginal(blob, protectedIds = []) {
  const id = globalThis.crypto?.randomUUID?.() ??
    `refs-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    await transaction('readwrite', store => store.put({id, blob, savedAt: Date.now()}));
  } catch { return ''; }
  try {
    // Inactive plate references are protected too. A copied archive whose old
    // source is absent still has its portable preview for a labeled fallback.
    const records = await transaction('readonly', store => store.getAll());
    const keep = new Set([...protectedIds, id]);
    const removable = records.filter(record => !keep.has(record.id))
      .sort((a, b) => a.savedAt - b.savedAt);
    for (const record of removable.slice(0, Math.max(0, records.length - MAX_SOURCES)))
      await transaction('readwrite', store => store.delete(record.id));
  } catch { /* Keep the saved original when maintenance is unavailable. */ }
  return id;
}

export function sampleRefsOriginalPixel(picture, x, y, canvas = document.createElement('canvas')) {
  const width = picture.naturalWidth || picture.width;
  const height = picture.naturalHeight || picture.height;
  if (!width || !height) throw new RangeError('Picture has no pixels');
  const px = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const py = Math.max(0, Math.min(height - 1, Math.floor(y)));
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', {willReadFrequently: true, colorSpace: 'srgb'});
  ctx.clearRect(0, 0, 1, 1);
  ctx.drawImage(picture, px, py, 1, 1, 0, 0, 1, 1);
  const rgb = ctx.getImageData(0, 0, 1, 1).data;
  return {hex: '#' + Array.from(rgb.slice(0, 3), channel =>
    channel.toString(16).padStart(2, '0')).join(''), alpha: rgb[3]};
}

export function compactRefsPreview(picture, canvas = document.createElement('canvas')) {
  const iw = picture.naturalWidth || picture.width;
  const ih = picture.naturalHeight || picture.height;
  let data = '';
  for (const size of [384, 256, 192, 128]) {
    const scale = Math.min(size / iw, size / ih);
    canvas.width = Math.max(1, Math.round(iw * scale));
    canvas.height = Math.max(1, Math.round(ih * scale));
    const context = canvas.getContext('2d');
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    for (const quality of [.78, .65, .5]) {
      data = canvas.toDataURL('image/webp', quality);
      if (data.length <= 70000) return data;
    }
  }
  throw new RangeError('Picture is too detailed for a plate.');
}
