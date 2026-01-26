export const DEBUG_VISIBILITY_EVENT = 'debug-ui-panel-visibility';
const DEBUG_KEY = 'DEBUG_UI';
const PAGE_STATE_KEY = 'DEBUG_UI_PAGE_STATES';

const parseDebugParam = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug');
  } catch (err) {
    return null;
  }
};

const normalizePageId = (value) => {
  let resolved = value || window.location.pathname;
  if (!resolved.startsWith('/')) {
    try {
      resolved = new URL(resolved, window.location.origin).pathname;
    } catch (err) {
      // fall back to the raw value
    }
  }
  return resolved;
};

const readPageStates = () => {
  const raw = localStorage.getItem(PAGE_STATE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (err) {
    return {};
  }
  return {};
};

const writePageStates = (states) => {
  try {
    localStorage.setItem(PAGE_STATE_KEY, JSON.stringify(states));
  } catch (err) {
    // ignore storage errors
  }
};

export function isDebugEnabled() {
  return localStorage.getItem(DEBUG_KEY) === '1';
}

export function enableDebug() {
  localStorage.setItem(DEBUG_KEY, '1');
}

export function disableDebug() {
  localStorage.removeItem(DEBUG_KEY);
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
