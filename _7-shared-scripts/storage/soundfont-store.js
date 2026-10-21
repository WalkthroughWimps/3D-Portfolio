import { assessPackage, chargedBytes, DEFAULT_BUDGET_BYTES, packageBytes } from './soundfont-budget.js';

const DB_NAME = 'site-soundfonts';
const DB_VERSION = 1;
const RESERVATION_MS = 120000;
const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const fail = (code, message, cause) => Object.assign(new Error(message), { code, cause });
const keyOf = pkg => `${pkg.id}@${pkg.version}`;
const fileKey = (key, path) => `${key}:${path}`;
const aborted = signal => { if (signal?.aborted) throw fail('cancelled', 'Saving was cancelled'); };
function openDatabase(indexedDB) {
  if (!indexedDB) return Promise.reject(fail('unsupported', 'IndexedDB is unavailable'));
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, DB_VERSION);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      for (const name of ['packages', 'files', 'selections', 'meta']) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(fail('unsupported', 'Could not open the soundfont store', opening.error));
    opening.onblocked = () => reject(fail('unsupported', 'Another tab must close an older soundfont store'));
  });
}
async function transaction(db, names, mode, work) {
  const tx = db.transaction(names, mode);
  const completion = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || fail('quota', 'Soundfont transaction was aborted'));
    tx.onerror = () => reject(tx.error || fail('quota', 'Soundfont transaction failed'));
  });
  let result;
  try { result = await work(tx); }
  catch (error) { try { tx.abort(); } catch { /* already finished */ } await completion.catch(() => {}); throw error; }
  await completion;
  return result;
}
function hex(buffer) { return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.packages)) throw fail('integrity', 'Unsupported soundfont manifest');
  const packages = new Map(), instruments = new Map();
  for (const pkg of manifest.packages) {
    if (!pkg.id || !pkg.version || !Array.isArray(pkg.files) || !pkg.files.length) throw fail('integrity', 'Incomplete soundfont package metadata');
    if (packages.has(pkg.id)) throw fail('integrity', `Duplicate package ${pkg.id}`);
    for (const file of pkg.files) if (!/^soundfonts\/[^?#]+$/i.test(file.path) || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/i.test(file.sha256)) throw fail('integrity', `Invalid file metadata in ${pkg.id}`);
    packages.set(pkg.id, pkg);
    for (const id of pkg.instruments || []) {
      if (instruments.has(id)) throw fail('integrity', `Duplicate instrument ${id}`);
      instruments.set(id, pkg);
    }
  }
  return { packages, instruments };
}

export function createSoundfontStore({ manifest, indexedDB = globalThis.indexedDB,
  fetcher = (...args) => fetch(...args), resolveUrl = key => new URL(`../../${key}`, import.meta.url).href,
  cryptoApi = globalThis.crypto, navigatorObject = globalThis.navigator, budgetBytes = manifest?.applicationBudgetBytes || DEFAULT_BUDGET_BYTES,
  channelFactory = name => typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null
} = {}) {
  const catalog = validateManifest(manifest);
  const listeners = new Set();
  const channel = channelFactory(DB_NAME);
  let opening, disposed = false;
  const db = () => opening ||= openDatabase(indexedDB);
  const notify = () => { for (const listener of [...listeners]) listener(); };
  const changed = () => { notify(); channel?.postMessage({ type: 'changed' }); };
  if (channel) channel.onmessage = event => { if (event.data?.type === 'changed') notify(); };
  async function rows(name) { return transaction(await db(), [name], 'readonly', tx => request(tx.objectStore(name).getAll())); }
  async function usage() {
    const packages = await rows('packages');
    const payloadBytes = packages.reduce((sum, pkg) => sum + pkg.bytes, 0);
    const charged = packages.reduce((sum, pkg) => sum + chargedBytes(pkg.bytes), 0);
    return { payloadBytes, usedBytes: charged, budgetBytes, packages: packages.length };
  }
  async function list() {
    const [selected, saved, files] = await Promise.all([rows('selections'), rows('packages'), rows('files')]);
    const byKey = new Map(saved.map(pkg => [pkg.key, pkg]));
    const fileKeys = new Set(files.map(file => file.key));
    return selected.map(selection => {
      const pkg = byKey.get(selection.packageKey);
      const complete = !!pkg && pkg.files.every(file => fileKeys.has(fileKey(pkg.key, file.path)));
      return { ...selection, status: complete ? 'saved' : 'missing', packageId: pkg?.id || selection.packageId };
    });
  }
  async function reserve(pkg, token) {
    const key = keyOf(pkg), bytes = assessPackage(pkg).requiredBytes;
    return transaction(await db(), ['packages', 'files', 'meta'], 'readwrite', async tx => {
      const meta = tx.objectStore('meta');
      const packages = tx.objectStore('packages');
      const files = tx.objectStore('files');
      const [existing, ready, allPackages, allMeta] = await Promise.all([
        request(meta.get(`reservation:${key}`)), request(packages.get(key)), request(packages.getAll()), request(meta.getAll())
      ]);
      if (ready) {
        const records = await Promise.all(ready.files.map(file => request(files.get(fileKey(key, file.path)))));
        if (records.every(Boolean)) return false;
        // A broken package cannot be used or counted as ready. Drop its
        // remaining records before reserving a complete replacement.
        for (const file of ready.files) files.delete(fileKey(key, file.path));
        packages.delete(key);
      }
      const now = Date.now();
      if (existing && existing.expiresAt > now && existing.token !== token) throw fail('busy', 'Another tab is saving this package');
      const used = allPackages.filter(row => !ready || row.key !== key).reduce((sum, row) => sum + chargedBytes(row.bytes), 0) + allMeta
        .filter(row => row?.kind === 'reservation' && row.expiresAt > now && row.key !== key).reduce((sum, row) => sum + row.bytes, 0);
      if (used + bytes > budgetBytes) throw fail('budget', `Saving ${pkg.id} requires ${used + bytes} bytes; budget is ${budgetBytes}`, { requiredBytes: used + bytes, budgetBytes });
      meta.put({ kind: 'reservation', key, token, bytes, expiresAt: now + RESERVATION_MS }, `reservation:${key}`);
      return true;
    });
  }
  async function releaseReservation(pkg, token) {
    const key = keyOf(pkg);
    await transaction(await db(), ['meta'], 'readwrite', async tx => {
      const store = tx.objectStore('meta');
      const item = await request(store.get(`reservation:${key}`));
      if (item?.token === token) store.delete(`reservation:${key}`);
    });
  }
  async function renewReservation(pkg, token) {
    const key = keyOf(pkg);
    await transaction(await db(), ['meta'], 'readwrite', async tx => {
      const meta = tx.objectStore('meta');
      const current = await request(meta.get(`reservation:${key}`));
      if (current?.token !== token) throw fail('busy', 'Save reservation was taken by another tab');
      meta.put({ ...current, expiresAt: Date.now() + RESERVATION_MS }, `reservation:${key}`);
    });
  }
  async function download(pkg, signal) {
    const files = [];
    for (const file of pkg.files) {
      aborted(signal);
      let response;
      try { response = await fetcher(resolveUrl(file.path), { mode: 'cors', credentials: 'omit', signal }); }
      catch (error) { throw signal?.aborted ? fail('cancelled', 'Saving was cancelled', error) : fail('network', `Could not download ${file.path}`, error); }
      if (!response.ok || response.status === 206 || response.type === 'opaque') throw fail('network', `Full readable response required for ${file.path}`);
      const length = response.headers.get('content-length');
      if (length !== null && Number(length) !== file.size) throw fail('integrity', `Length mismatch for ${file.path}`);
      const blob = await response.blob();
      if (blob.size !== file.size) throw fail('integrity', `Size mismatch for ${file.path}`);
      aborted(signal);
      // Digesting uses one ArrayBuffer staging copy; a browser memory failure is
      // reported as quota and never produces a ready package.
      let digest;
      try { digest = hex(await cryptoApi.subtle.digest('SHA-256', await blob.arrayBuffer())); }
      catch (error) { throw fail('quota', `Could not stage ${file.path} for verification`, error); }
      if (digest.toLowerCase() !== file.sha256.toLowerCase()) throw fail('integrity', `Digest mismatch for ${file.path}`);
      files.push({ key: fileKey(keyOf(pkg), file.path), path: file.path, size: file.size, digest, blob });
    }
    return files;
  }
  async function commit(pkg, files, instrumentIds, token) {
    const key = keyOf(pkg);
    return transaction(await db(), ['packages', 'files', 'selections', 'meta'], 'readwrite', async tx => {
      const packages = tx.objectStore('packages'), fileStore = tx.objectStore('files');
      const selections = tx.objectStore('selections'), meta = tx.objectStore('meta');
      const [reservation, allPackages, allSelections] = await Promise.all([
        request(meta.get(`reservation:${key}`)), request(packages.getAll()), request(selections.getAll())
      ]);
      if (reservation?.token !== token || reservation.expiresAt <= Date.now()) throw fail('busy', 'Save reservation expired');
      const used = allPackages.reduce((sum, row) => sum + chargedBytes(row.bytes), 0);
      const next = used + chargedBytes(packageBytes(pkg));
      if (next > budgetBytes) throw fail('budget', `Saving ${pkg.id} requires ${next} bytes; budget is ${budgetBytes}`);
      for (const file of files) fileStore.put(file, file.key);
      packages.put({ key, id: pkg.id, version: pkg.version, bytes: packageBytes(pkg), files: pkg.files, savedAt: Date.now() }, key);
      for (const id of instrumentIds) selections.put({ instrumentId: id, packageId: pkg.id, packageKey: key }, id);
      const selectedIds = new Set(instrumentIds);
      const referenced = new Set(allSelections.filter(row => !selectedIds.has(row.instrumentId)).map(row => row.packageKey));
      referenced.add(key);
      for (const old of allPackages) if (!referenced.has(old.key)) {
        for (const file of old.files) fileStore.delete(fileKey(old.key, file.path));
        packages.delete(old.key);
      }
      meta.delete(`reservation:${key}`);
    });
  }
  async function saveSelections(ids, { signal } = {}) {
    if (disposed) throw fail('unsupported', 'Store is disposed');
    const selected = [...new Set(ids)];
    const groups = new Map();
    for (const id of selected) {
      const pkg = catalog.instruments.get(id);
      if (!pkg) throw fail('missing', `Unknown instrument ${id}`);
      if (!groups.has(pkg.id)) groups.set(pkg.id, { pkg, ids: [] });
      groups.get(pkg.id).ids.push(id);
    }
    for (const { pkg, ids: instrumentIds } of groups.values()) {
      aborted(signal);
      const alone = assessPackage(pkg, 0, budgetBytes);
      if (!alone.fits) throw fail('budget', `Saving ${pkg.id} requires ${alone.requiredBytes} bytes; budget is ${budgetBytes}`, alone);
      const token = cryptoApi.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const needed = await reserve(pkg, token);
      if (!needed) {
        await transaction(await db(), ['selections'], 'readwrite', tx => {
          const store = tx.objectStore('selections');
          for (const id of instrumentIds) store.put({ instrumentId: id, packageId: pkg.id, packageKey: keyOf(pkg) }, id);
        });
        changed(); continue;
      }
      let renewalError = null;
      let renewal = Promise.resolve();
      const timer = setInterval(() => {
        renewal = renewal.then(() => renewReservation(pkg, token)).catch(error => { renewalError = error; });
      }, RESERVATION_MS / 4);
      try {
        const estimate = await navigatorObject?.storage?.estimate?.();
        const neededBytes = assessPackage(pkg).requiredBytes + 16777216;
        if (estimate?.quota && estimate?.usage && estimate.quota - estimate.usage < neededBytes) throw fail('quota', `Browser storage headroom is below ${neededBytes} bytes`);
        const files = await download(pkg, signal);
        aborted(signal);
        await renewal;
        if (renewalError) throw renewalError;
        await renewReservation(pkg, token);
        await commit(pkg, files, instrumentIds, token);
        changed();
      } finally {
        clearInterval(timer);
        await renewal;
        await releaseReservation(pkg, token).catch(() => {});
      }
    }
    return list();
  }
  async function removeSelections(ids) {
    await transaction(await db(), ['packages', 'files', 'selections'], 'readwrite', async tx => {
      const packages = tx.objectStore('packages'), files = tx.objectStore('files'), selections = tx.objectStore('selections');
      const removed = new Set(ids);
      const allSelections = await request(selections.getAll());
      const allPackages = await request(packages.getAll());
      for (const id of removed) selections.delete(id);
      const remaining = new Set(allSelections.filter(row => !removed.has(row.instrumentId)).map(row => row.packageKey));
      for (const pkg of allPackages) if (!remaining.has(pkg.key)) {
        for (const file of pkg.files) files.delete(fileKey(pkg.key, file.path));
        packages.delete(pkg.key);
      }
    });
    changed(); return list();
  }
  async function removePackage(packageId) {
    const selected = await rows('selections');
    return removeSelections(selected.filter(row => row.packageId === packageId).map(row => row.instrumentId));
  }
  async function readFile(packageId, path, version) {
    const pkg = catalog.packages.get(packageId);
    if (!pkg) throw fail('missing', 'Package file is not listed');
    const key = `${packageId}@${version || pkg.version}`;
    return transaction(await db(), ['packages', 'files'], 'readonly', async tx => {
      const ready = await request(tx.objectStore('packages').get(key));
      if (!ready) throw fail('missing', 'Saved package is missing; download it again');
      if (!ready.files.some(file => file.path === path)) throw fail('missing', 'Package file is not listed');
      const all = await Promise.all(ready.files.map(item => request(tx.objectStore('files').get(fileKey(key, item.path)))));
      if (all.some(item => !item)) throw fail('missing', 'Saved package is incomplete; download it again');
      const file = all.find(item => item.path === path);
      if (!file) throw fail('missing', 'Saved package is missing; download it again');
      return file.blob;
    });
  }
  function subscribe(listener, { signal, immediate = false } = {}) {
    if (disposed || typeof listener !== 'function') return () => {};
    listeners.add(listener);
    const stop = () => { listeners.delete(listener); signal?.removeEventListener('abort', stop); };
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop(); else if (immediate) listener();
    return stop;
  }
  return { list, saveSelections, removeSelections, removePackage, usage, readFile, subscribe,
    async dispose() { if (disposed) return; disposed = true; listeners.clear(); channel?.close(); (await opening?.catch(() => null))?.close(); }
  };
}
