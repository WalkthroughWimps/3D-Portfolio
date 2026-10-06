// A guarded storage adapter. An unsuccessful write remains authoritative in this
// document until it is retried or explicitly discarded.
export function createPreferences(getStorage = () => globalThis.localStorage) {
  const overlay = new Map();
  const failed = new Set();
  function read(key) {
    key = String(key);
    if (overlay.has(key)) return overlay.get(key);
    try { return getStorage().getItem(key); }
    catch { failed.add(key); return null; }
  }
  function write(key, value) {
    key = String(key);
    value = String(value);
    try { getStorage().setItem(key, value); overlay.delete(key); failed.delete(key); return true; }
    catch { overlay.set(key, value); failed.add(key); return false; }
  }
  function remove(key) {
    key = String(key);
    try { getStorage().removeItem(key); overlay.delete(key); failed.delete(key); return true; }
    catch { overlay.set(key, null); failed.add(key); return false; }
  }
  return {
    getItem: read, setItem: write, removeItem: remove,
    readPersisted(key) { try { return getStorage().getItem(key); } catch { failed.add(String(key)); return null; } },
    get failedKeys() { return [...failed]; },
    get pendingKeys() { return [...overlay.keys()]; },
    retry() {
      for (const [key, value] of [...overlay]) value === null ? remove(key) : write(key, value);
      return { failedKeys: [...failed], pendingKeys: [...overlay.keys()] };
    },
    discard(keys = [...overlay.keys()]) { for (const key of keys) { overlay.delete(key); failed.delete(key); } }
  };
}
