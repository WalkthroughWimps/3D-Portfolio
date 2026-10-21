import { localPreferences } from '../_7-shared-scripts/local-preferences.js';
export const DEBUG_VISIBILITY_EVENT = 'debug-ui-panel-visibility';

// Optional Music history instrumentation shares the existing debug preference.
// The scope owns cleanup even when the import finishes after page disposal.
export async function loadMusicDiagnostics({ scope, pageId } = {}) {
  try {
    const param = parseDebugParam();
    const enabled = param === '1' || param === 'true' ||
      (param !== '0' && param !== 'false' && getPageDebugState(pageId));
    if (!enabled || scope?.signal.aborted) return;
    const { mountMusicDiagnostics } = await import('./music-diagnostics.js');
    if (scope?.signal.aborted) return;
    const dispose = mountMusicDiagnostics();
    scope?.defer(dispose);
    return dispose;
  } catch (error) {
    console.warn('Music diagnostics unavailable', error);
  }
}
const DEBUG_KEY = 'DEBUG_UI';
const PAGE_STATE_KEY = 'DEBUG_UI_PAGE_STATES';

const parseDebugParam = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug');
  } catch {
    return null;
  }
};

const normalizePageId = (value) => {
  let resolved = value || window.location.pathname;
  if (!resolved.startsWith('/')) {
    try {
      resolved = new URL(resolved, window.location.origin).pathname;
    } catch {
      // fall back to the raw value
    }
  }
  return resolved;
};

const readPageStates = () => {
  const raw = localPreferences.getItem(PAGE_STATE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    return {};
  }
  return {};
};

const writePageStates = (states) => {
  try {
    localPreferences.setItem(PAGE_STATE_KEY, JSON.stringify(states));
  } catch {
    // ignore storage errors
  }
};

export function isDebugEnabled() {
  return localPreferences.getItem(DEBUG_KEY) === '1';
}

export function enableDebug() {
  localPreferences.setItem(DEBUG_KEY, '1');
}

export function disableDebug() {
  localPreferences.removeItem(DEBUG_KEY);
}

export function getPageDebugState(pageId) {
  const normalized = normalizePageId(pageId);
  const states = readPageStates();
  if (Object.prototype.hasOwnProperty.call(states, normalized)) {
    return Boolean(states[normalized]);
  }
  return isDebugEnabled();
}

export function setPageDebugState(pageId, enabled) {
  const normalized = normalizePageId(pageId);
  const states = readPageStates();
  states[normalized] = Boolean(enabled);
  writePageStates(states);
  return states[normalized];
}

export function togglePageDebugState(pageId) {
  const next = !getPageDebugState(pageId);
  return setPageDebugState(pageId, next);
}

export function normalizePageIdentifier(value) {
  return normalizePageId(value);
}

export async function loadDebugIfEnabled(options = {}) {
  const pageId = normalizePageId(options.pageId);
  const pageName = options.pageName || document.title || pageId;
  const param = parseDebugParam();
  if (param !== null) {
    const normalized = String(param).toLowerCase();
    if (normalized === '1' || normalized === 'true') {
      enableDebug();
      setPageDebugState(pageId, true);
    } else if (normalized === '0' || normalized === 'false') {
      disableDebug();
      setPageDebugState(pageId, false);
      return;
    }
  }

  if (!getPageDebugState(pageId)) {
    return;
  }

  const module = await import('./debug-ui.js');

  if (!getPageDebugState(pageId)) {
    return;
  }

  module.initDebugUI({
    pageName,
  });
}
