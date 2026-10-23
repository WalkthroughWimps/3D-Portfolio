import { restoreDocument } from './drawing-model.js';

const DB_NAME = 'site.about.notes.library';
const WORKING_DB_NAME = 'site.about.notes.working';
const STORE = 'drawings';
const CATALOG = 'catalog';
const WORKING = 'working';
const FORMAT = 'notes-drawing';
const MAX_BYTES = 32 * 1024 * 1024;

export function validateDrawing(value) {
  if (!value || value.format !== FORMAT || value.version !== 1 ||
      typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 ||
      !value.document || value.document.version !== 2 ||
      !Array.isArray(value.document.objects) || value.document.objects.length > 300 ||
      !Array.isArray(value.document.groups) || value.document.groups.length > 300 ||
      !Array.isArray(value.document.layers) || !value.document.layers.length || value.document.layers.length > 3 ||
      !Array.isArray(value.document.gears) || value.document.gears.length > 3) throw new Error('This is not a valid Notes drawing file.');
  const document = restoreDocument(value.document);
  if (document.objects.length !== value.document.objects.length ||
      document.groups.length !== value.document.groups.length ||
      document.layers.length !== value.document.layers.length ||
      document.gears.length !== value.document.gears.length ||
      !document.layers.some(layer => layer.id === value.document.activeLayer) ||
      document.objects.some((shape, i) => shape.layerId !== value.document.objects[i].layerId || shape.groupId !== (value.document.objects[i].groupId || null)) ||
      document.groups.some((group, i) => group.parentId !== (value.document.groups[i].parentId || null))) {
    throw new Error('The drawing contains unsupported or damaged objects.');
  }
  return { name: value.name.trim(), document };
}

export function drawingFile(name, document) { return { format: FORMAT, version: 1, name, document }; }

export function fileName(name, extension) {
  return `${String(name || 'Notes drawing').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 70) || 'Notes drawing'}.${extension}`;
}

export async function parseDrawingFile(file) {
  if (!file || file.size > MAX_BYTES) throw new Error('Drawing files must be 32 MB or smaller.');
  let value;
  try { value = JSON.parse(await file.text()); } catch { throw new Error('The drawing file is not valid JSON.'); }
  return validateDrawing(value);
}

function openDatabase(targetVersion) {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Drawing storage is unavailable in this browser.')); return; }
    const request = targetVersion ? indexedDB.open(DB_NAME, targetVersion) : indexedDB.open(DB_NAME);
    let settled = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
      if (!request.result.objectStoreNames.contains(CATALOG)) {
        const catalog = request.result.createObjectStore(CATALOG, { keyPath: 'id' });
        request.transaction.objectStore(STORE).openCursor().onsuccess = event => {
          const cursor = event.target.result;
          if (cursor) { const { id, name, updatedAt } = cursor.value; catalog.put({ id, name, updatedAt }); cursor.continue(); }
        };
      }
    };
    request.onsuccess = () => {
      if (settled) request.result.close();
      else if (!request.result.objectStoreNames.contains(CATALOG)) {
        const nextVersion = request.result.version + 1;
        request.result.close(); settled = true;
        openDatabase(nextVersion).then(resolve, reject);
      }
      else {
        settled = true;
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      }
    };
    request.onerror = () => reject(request.error || new Error('Could not open drawing storage.'));
    request.onblocked = () => { settled = true; reject(new Error('Drawing storage is blocked by another tab.')); };
  });
}

function openWorkingDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Working drawing storage is unavailable in this browser.')); return; }
    const request = indexedDB.open(WORKING_DB_NAME, 1);
    let settled = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WORKING)) request.result.createObjectStore(WORKING, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      if (settled) request.result.close();
      else { settled = true; request.result.onversionchange = () => request.result.close(); resolve(request.result); }
    };
    request.onerror = () => reject(request.error || new Error('Could not open working drawing storage.'));
    request.onblocked = () => { settled = true; reject(new Error('Working drawing storage is blocked by another tab.')); };
  });
}

export function createDrawingLibrary() {
  let dbPromise, workingDbPromise;
  const db = () => dbPromise ||= openDatabase().catch(error => { dbPromise = null; throw error; });
  const workingDb = () => workingDbPromise ||= openWorkingDatabase().catch(error => { workingDbPromise = null; throw error; });
  async function request(stores, mode, operation, source = db) {
    const database = await source();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(stores, mode);
      const action = operation(transaction);
      let result;
      action.onsuccess = () => { result = action.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error('Drawing storage failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Drawing storage was interrupted.'));
    });
  }
  return {
    async list() { return (await request([CATALOG], 'readonly', tx => tx.objectStore(CATALOG).getAll())).sort((a, b) => b.updatedAt - a.updatedAt); },
    get(id) { return request([STORE], 'readonly', tx => tx.objectStore(STORE).get(id)); },
    getWorking() { return request([WORKING], 'readonly', tx => tx.objectStore(WORKING).get('current'), workingDb); },
    putWorking({ document, selectedDrawingId, name, updatedAt }) {
      return request([WORKING], 'readwrite', tx => tx.objectStore(WORKING).put({
        id: 'current', document, selectedDrawingId: selectedDrawingId || null, name: name || '', updatedAt
      }), workingDb);
    },
    async put({ id = crypto.randomUUID(), name, document }) {
      const record = { id, ...drawingFile(name, document), updatedAt: Date.now() };
      record.document = validateDrawing(record).document;
      const database = await db();
      await new Promise((resolve, reject) => {
        const tx = database.transaction([STORE, CATALOG], 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.objectStore(CATALOG).put({ id, name, updatedAt: record.updatedAt });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Drawing storage failed.'));
        tx.onabort = () => reject(tx.error || new Error('Drawing storage was interrupted.'));
      });
      return record;
    },
    dispose() {
      dbPromise?.then(database => database.close()).catch(() => {});
      workingDbPromise?.then(database => database.close()).catch(() => {});
    }
  };
}

export function createDownloadManager() {
  const urls = new Map();
  function revoke(url) { clearTimeout(urls.get(url)); urls.delete(url); URL.revokeObjectURL(url); }
  return {
    download(blob, name) {
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      urls.set(url, setTimeout(() => revoke(url), 30000));
      link.href = url; link.download = name; link.style.display = 'none'; document.body.append(link);
      try { link.click(); } finally { link.remove(); }
    },
    dispose() { for (const url of urls.keys()) revoke(url); }
  };
}
