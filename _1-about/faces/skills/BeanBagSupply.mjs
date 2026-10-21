export const BEAN_BAG_LIMIT = 8;
export const BEAN_BAG_WORLD_LIMIT = 1024;
export const BEAN_BAG_STORAGE_KEY = 'about.skills.beanBags.destroyed.v1';

const EXHAUSTED_MESSAGE = "Tut tut! You've destroyed all of your beans, bag.";
const blockedStorageLifetime = new Map();
const validCount = value => Number.isSafeInteger(value) && value >= 0 ? Math.min(BEAN_BAG_WORLD_LIMIT, value) : 0;

/** Four physical slots, each with one replacement after its first bag burns. */
export function createBeanBagSupply({storage, storageKey = BEAN_BAG_STORAGE_KEY} = {}) {
  if (storage === undefined) try { storage = globalThis.localStorage; } catch { storage = null; }
  const listeners = new Set(), available = new Set(), inFlight = new Set();
  let lifetime = blockedStorageLifetime.get(storageKey) || 0, destroyed = 0, focused = false, leftEmpty = false;
  try { lifetime = Math.max(lifetime, validCount(Number(storage?.getItem(storageKey)))); } catch { /* Retain the in-memory count. */ }
  let replacements = 0;
  function startBatch() {
    available.clear();
    const allowance = Math.min(BEAN_BAG_LIMIT, BEAN_BAG_WORLD_LIMIT - lifetime);
    const initial = Math.min(4, allowance);
    for (let id = 0; id < initial; id++) available.add(id);
    replacements = allowance - initial;
    destroyed = 0;
  }
  startBatch();
  const exhausted = () => available.size === 0 && inFlight.size === 0 && replacements === 0;
  const snapshot = () => Object.freeze({availableIds: Object.freeze([...available].sort((a, b) => a - b)), inFlight: Object.freeze([...inFlight].sort((a, b) => a - b)), destroyed, lifetime, worldExhausted: lifetime >= BEAN_BAG_WORLD_LIMIT});
  const emit = (type, message = null) => { const event = {type, message, snapshot: snapshot()}; for (const listener of listeners) listener(event); };
  function persist() {
    blockedStorageLifetime.set(storageKey, Math.max(blockedStorageLifetime.get(storageKey) || 0, lifetime));
    try { storage?.setItem(storageKey, String(lifetime)); } catch { /* Keep enforcing the in-memory limit. */ }
  }
  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    reserve(requestedId = null) {
      if (lifetime >= BEAN_BAG_WORLD_LIMIT) return null;
      const id = requestedId === null ? available.values().next().value : requestedId;
      if (!Number.isInteger(id) || !available.has(id)) return null;
      available.delete(id); inFlight.add(id); emit('reserve'); return id;
    },
    recover(id) {
      if (!inFlight.delete(id)) return false;
      if (lifetime < BEAN_BAG_WORLD_LIMIT) available.add(id);
      emit('recover'); return true;
    },
    destroy(id) {
      if (!inFlight.delete(id)) return false;
      let stored = 0;
      try { stored = validCount(Number(storage?.getItem(storageKey))); } catch { /* blocked storage */ }
      lifetime = Math.min(BEAN_BAG_WORLD_LIMIT, Math.max(lifetime, stored, blockedStorageLifetime.get(storageKey) || 0) + 1);
      destroyed++;
      if (id < 4 && replacements > 0 && lifetime < BEAN_BAG_WORLD_LIMIT) {
        available.add(id + 4);
        replacements--;
      }
      if (lifetime >= BEAN_BAG_WORLD_LIMIT) { available.clear(); replacements = 0; }
      persist();
      emit('destroy', lifetime >= BEAN_BAG_WORLD_LIMIT ? 'There are no bean bags left in the world.' : exhausted() ? EXHAUSTED_MESSAGE : null);
      return true;
    },
    /** A refill requires genuine exhaustion and a leave/return focus edge. */
    visit(isFocused) {
      const next = Boolean(isFocused);
      if (focused && !next && exhausted()) leftEmpty = true;
      if (!focused && next && leftEmpty && exhausted() && lifetime < BEAN_BAG_WORLD_LIMIT) {
        startBatch(); leftEmpty = false; emit('refill', 'I guess you can have more');
      }
      focused = next;
    }
  };
}
