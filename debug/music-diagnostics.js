// Installed only through the gated debug entry, never at Music module load.
export function mountMusicDiagnostics({ target = window, historyObject = history,
  storage = sessionStorage, locationObject = location, performanceObject = performance,
  logger = console } = {}) {
  const removers = [];
  const tag = (message, extra = {}) => logger.log('[RESET-DEBUG] ' + message, extra);
  const listen = (name, listener) => {
    target.addEventListener(name, listener);
    removers.push(() => target.removeEventListener(name, listener));
  };
  for (const name of ['beforeunload', 'unload', 'popstate', 'hashchange']) {
    listen(name, () => tag(name, { url: locationObject.href }));
  }
  listen('error', event => tag('window error', { message:event.message, filename:event.filename, lineno:event.lineno, colno:event.colno }));
  listen('unhandledrejection', event => tag('unhandledrejection', { reason:event.reason }));
  for (const name of ['pushState', 'replaceState']) {
    const original = historyObject[name];
    const wrapper = function(...args) {
      tag(`history.${name}`, { args, stack: new Error().stack });
      return original.apply(this, args);
    };
    historyObject[name] = wrapper;
    // Do not overwrite a later wrapper installed by another owner.
    removers.push(() => { if (historyObject[name] === wrapper) historyObject[name] = original; });
  }
  try {
    const key = '__reset_debug_count__';
    const count = Number(storage.getItem(key) || 0) + 1;
    storage.setItem(key, String(count));
    tag('boot', { bootCountThisTab:count, url:locationObject.href, navType:performanceObject.getEntriesByType('navigation')?.[0]?.type });
  } catch (error) { logger.warn('[RESET-DEBUG] instrumentation failed', error); }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const remove of removers.reverse()) remove();
  };
}
