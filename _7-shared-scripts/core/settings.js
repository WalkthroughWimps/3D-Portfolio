import { createPreferences } from './preferences.js';
import { A11Y_KEY, SCHEMA_KEY, SCHEMA_VERSION, SETTINGS_FIELDS, SETTINGS_KEYS, flattenPatch } from './settings-schema.js';

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const readObject = raw => {
  try { const value = JSON.parse(raw); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { return {}; }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createSettingsStore({ preferences = createPreferences(), target = globalThis.window, matchMedia = globalThis.matchMedia } = {}) {
  const listeners = new Set();
  const fieldNames = Object.keys(SETTINGS_FIELDS);
  let disposed = false;
  let snapshot;
  let futureVersion = null;
  let conflicts = [];
  const status = () => preferences.pendingKeys?.length ? (preferences.failedKeys?.length ? 'session' : 'partial') : (preferences.failedKeys?.length ? 'partial' : 'persistent');
  function rawRead() {
    const raw = new Map();
    for (const key of SETTINGS_KEYS) raw.set(key, preferences.getItem(key));
    return raw;
  }
  function choose(field, raw, a11y) {
    const sources = field.prop ? [a11y[field.prop]] : [raw.get(field.key), ...(field.legacy || []).map(key => key.startsWith('a11y:') ? a11y[key.slice(5)] : raw.get(key))];
    for (const source of sources) {
      const parsed = field.parse(source);
      if (parsed !== undefined) return parsed;
    }
    return field.default;
  }
  function build(raw) {
    const a11y = readObject(raw.get(A11Y_KEY));
    const result = { schemaVersion: SCHEMA_VERSION, audio: {}, accessibility: {}, scene: {}, start: { look: {} }, media: {}, music: {}, persistence: status(), futureSchemaVersion: futureVersion, conflicts: [...conflicts] };
    for (const [path, field] of Object.entries(SETTINGS_FIELDS)) {
      const parts = path.split('.');
      let cursor = result;
      for (const part of parts.slice(0, -1)) cursor = cursor[part] ||= {};
      cursor[parts.at(-1)] = choose(field, raw, a11y);
    }
    if (result.accessibility.reducedMotion === null) result.accessibility.reducedMotion = !!matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    return freeze(result);
  }
  function valueAt(source, path) { return path.split('.').reduce((value, part) => value?.[part], source); }
  function emit(next, source, previous = snapshot) {
    const changed = previous ? fieldNames.filter(path => !Object.is(valueAt(previous, path), valueAt(next, path))) : [];
    snapshot = next;
    if (!changed.length && previous && same(previous.persistence, next.persistence) && same(previous.conflicts, next.conflicts)) return;
    const change = freeze({ changed, source, failedKeys: [...(preferences.failedKeys || [])] });
    for (const listener of [...listeners]) listener(snapshot, change);
  }
  function refresh({ source = 'system', migrate = false } = {}) {
    if (disposed) return snapshot;
    const raw = rawRead();
    const version = Number(raw.get(SCHEMA_KEY));
    futureVersion = Number.isFinite(version) && version > SCHEMA_VERSION ? version : null;
    if (migrate && !futureVersion) {
      const a11y = readObject(raw.get(A11Y_KEY));
      for (const [path, field] of Object.entries(SETTINGS_FIELDS)) {
        if (field.prop) continue;
        const canonical = field.parse(raw.get(field.key));
        const chosen = choose(field, raw, a11y);
        if (canonical === undefined && chosen !== null && !(path === 'scene.lighting')) preferences.setItem(field.key, String(chosen));
      }
      if (raw.get(SCHEMA_KEY) === null) preferences.setItem(SCHEMA_KEY, String(SCHEMA_VERSION));
    }
    emit(build(rawRead()), source);
    return snapshot;
  }
  function writeA11y(patch) {
    const current = readObject(preferences.getItem(A11Y_KEY));
    const next = { ...current, ...patch };
    return preferences.setItem(A11Y_KEY, JSON.stringify(next));
  }
  function patch(input) {
    if (disposed) return { ok: false, snapshot, errors: [{ code: 'disposed' }] };
    const values = flattenPatch(input);
    const errors = [];
    if (!values) errors.push({ code: 'invalid-patch' });
    else for (const [path, value] of Object.entries(values)) {
      const field = SETTINGS_FIELDS[path];
      if (!field) errors.push({ path, code: 'unknown-field' });
      else if (field.parse(value) === undefined) errors.push({ path, code: 'invalid-value' });
    }
    if (errors.length) return { ok: false, snapshot, errors };
    const savedA11y = readObject(preferences.getItem(A11Y_KEY));
    const changed = Object.entries(values).filter(([path, value]) => {
      const field = SETTINGS_FIELDS[path];
      const parsed = field.parse(value);
      return !Object.is(valueAt(snapshot, path), parsed) ||
        (field.prop && !Object.hasOwn(savedA11y, field.prop));
    });
    if (!changed.length) return { ok: true, snapshot, errors: [] };
    const a11y = {};
    for (const [path, value] of changed) {
      const field = SETTINGS_FIELDS[path];
      const parsed = field.parse(value);
      if (field.prop) a11y[field.prop] = parsed;
      else preferences.setItem(field.key, String(parsed));
      if (path === 'audio.volume') a11y.masterVolume = parsed;
      if (path === 'audio.muted') a11y.mute = parsed;
      if (path === 'audio.syncMs') a11y.audioSyncMs = parsed;
    }
    if (Object.keys(a11y).length) writeA11y(a11y);
    refresh({ source: 'local' });
    return { ok: true, snapshot, errors: [] };
  }
  function reset(fields) {
    const errors = (Array.isArray(fields) ? fields : []).filter(path => !SETTINGS_FIELDS[path]).map(path => ({ path, code: 'unknown-field' }));
    if (errors.length) return { ok: false, snapshot, errors };
    const a11y = readObject(preferences.getItem(A11Y_KEY));
    let a11yChanged = false;
    for (const path of fields) {
      const field = SETTINGS_FIELDS[path];
      if (field.prop) { delete a11y[field.prop]; a11yChanged = true; }
      else preferences.removeItem(field.key);
      for (const legacy of field.legacy || []) {
        if (legacy.startsWith('a11y:')) { delete a11y[legacy.slice(5)]; a11yChanged = true; }
        else preferences.removeItem(legacy);
      }
    }
    if (a11yChanged) preferences.setItem(A11Y_KEY, JSON.stringify(a11y));
    refresh({ source: 'local' });
    return { ok: true, snapshot, errors: [] };
  }
  function subscribe(listener, { signal, immediate = false } = {}) {
    if (typeof listener !== 'function' || disposed) return () => {};
    listeners.add(listener);
    const stop = () => { listeners.delete(listener); signal?.removeEventListener('abort', stop); };
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    else if (immediate) listener(snapshot, freeze({ changed: [], source: 'system', failedKeys: [...(preferences.failedKeys || [])] }));
    return stop;
  }
  const onStorage = event => {
    if (event.key !== null && !SETTINGS_KEYS.has(event.key)) return;
    const pending = new Set(preferences.pendingKeys || []);
    conflicts = [...pending].filter(key => key === event.key || event.key === null);
    refresh({ source: 'other-tab' });
  };
  const onFocus = () => refresh({ source: 'other-tab' });
  const onMotion = () => { if (readObject(preferences.getItem(A11Y_KEY)).reducedMotion === undefined) refresh({ source: 'system' }); };
  const media = matchMedia?.('(prefers-reduced-motion: reduce)');
  refresh({ source: 'migration', migrate: true });
  target?.addEventListener?.('storage', onStorage);
  target?.addEventListener?.('focus', onFocus);
  target?.addEventListener?.('pageshow', onFocus);
  media?.addEventListener?.('change', onMotion);
  return {
    get: () => snapshot, patch, reset, refresh, subscribe,
    retry() { const result = preferences.retry?.(); conflicts = []; refresh({ source: 'system' }); return result; },
    discardPending(keys) { preferences.discard?.(keys); conflicts = []; refresh({ source: 'system' }); },
    dispose() {
      if (disposed) return;
      disposed = true;
      target?.removeEventListener?.('storage', onStorage);
      target?.removeEventListener?.('focus', onFocus);
      target?.removeEventListener?.('pageshow', onFocus);
      media?.removeEventListener?.('change', onMotion);
      listeners.clear();
    }
  };
}

let shared;
export function getSharedSettings() { return shared ||= createSettingsStore(); }
