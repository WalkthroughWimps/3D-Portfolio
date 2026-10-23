export const BEAN_BAG_LIMIT = 4;
export const BEAN_BAG_WORLD_LIMIT = Infinity;
export const BEAN_BAG_STORAGE_KEY = 'about.skills.beanBags.destroyed.v1';

/** Four decorative bags remain in the tray; each toss gets its own transient bag. */
export function createBeanBagSupply() {
  const listeners = new Set(), inFlight = new Set();
  let nextId = 4, destroyed = 0;
  const snapshot = () => Object.freeze({
    availableIds: Object.freeze([0, 1, 2, 3]),
    inFlight: Object.freeze([...inFlight]), destroyed, lifetime: destroyed, worldExhausted: false
  });
  const emit = type => { const event = {type, message: null, snapshot: snapshot()}; for (const listener of listeners) listener(event); };
  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    reserve() { const id = nextId++; inFlight.add(id); emit('reserve'); return id; },
    recover(id) { if (!inFlight.delete(id)) return false; emit('recover'); return true; },
    destroy(id) { if (!inFlight.delete(id)) return false; destroyed++; emit('destroy'); return true; },
    visit() {}
  };
}
