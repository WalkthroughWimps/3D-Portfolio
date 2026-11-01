import { SETTINGS_FIELDS } from './settings-schema.js';

const SETTING_SELECTOR = '[data-setting]';

/** Bind and hydrate shared settings controls in one or more owned roots. */
export function mountSettingsControls(roots, {
  store,
  signal,
  valueAdapters = {},
  afterRefresh
} = {}) {
  const ownedRoots = [...new Set((Array.isArray(roots) ? roots : [roots]).filter(Boolean))];
  if (!store) throw new TypeError('A settings store is required');
  for (let index = 0; index < ownedRoots.length; index++) {
    if (ownedRoots.some((root, other) => other !== index && root.contains(ownedRoots[index]))) {
      throw new TypeError('Settings control roots must not overlap');
    }
  }

  const events = new AbortController();
  let disposed = false;

  function controls() {
    return ownedRoots.flatMap(root => [
      ...(root.matches?.(SETTING_SELECTOR) ? [root] : []),
      ...root.querySelectorAll(SETTING_SELECTOR)
    ]);
  }

  function refresh(snapshot = store.get()) {
    if (disposed || !snapshot) return;
    for (const control of controls()) {
      const path = control.dataset.setting;
      if (!Object.hasOwn(SETTINGS_FIELDS, path)) continue;
      const value = path.split('.').reduce((current, key) => current?.[key], snapshot);
      const adapter = valueAdapters[path];
      if (adapter?.write) adapter.write(control, value, snapshot);
      else defaultWriteValue(control, value);
    }
    afterRefresh?.(snapshot);
  }

  function commit(event) {
    const control = event.target.closest?.(SETTING_SELECTOR);
    if (!control || !ownedRoots.some(root => root === control || root.contains(control))) return;
    if (event.type === 'input' && control.type !== 'range' && control.tagName !== 'TEXTAREA') return;

    const path = control.dataset.setting;
    if (!Object.hasOwn(SETTINGS_FIELDS, path)) return;
    const adapter = valueAdapters[path];
    store.patch({ [path]: adapter?.read ? adapter.read(control) : defaultReadValue(control, path) });
  }

  for (const root of ownedRoots) {
    root.addEventListener('input', commit, { signal: events.signal });
    root.addEventListener('change', commit, { signal: events.signal });
  }
  const unsubscribe = store.subscribe(refresh, { immediate: true });
  const onAbort = () => dispose();
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();

  function dispose() {
    if (disposed) return;
    disposed = true;
    events.abort();
    unsubscribe();
    signal?.removeEventListener('abort', onAbort);
  }

  return { refresh, dispose };
}

function defaultReadValue(control, path) {
  if (control.type === 'checkbox') return control.checked;
  if (control.type === 'range' || control.type === 'number' || path.endsWith('textScale')) return Number(control.value);
  return control.value;
}

function defaultWriteValue(control, value) {
  if (control.type === 'checkbox') control.checked = Boolean(value);
  else if (control.value !== String(value)) control.value = String(value);
}
