const KEY = 'site.audio.allowed';
const COOKIE = 'site_audio_allowed';
const parse = raw => raw === 'true' ? true : raw === 'false' ? false : null;
function cookieValue(doc) {
  try {
    const entry = String(doc.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`));
    return parse(entry ? decodeURIComponent(entry.slice(COOKIE.length + 1)) : null);
  }
  catch { return null; }
}
export function createConsent({ doc = document, target = window, storage = {
  getItem: key => globalThis.localStorage.getItem(key),
  setItem: (key, value) => globalThis.localStorage.setItem(key, value)
} } = {}) {
  const subscribers = new Set();
  let sessionChoice = null;
  let pending = null;
  let disposed = false;
  let lastAllowed;
  let persistedBaseline = null;
  let failedWrite = false;
  function persistedValues() {
    let local = null;
    try { local = parse(storage.getItem(KEY)); } catch { /* unavailable */ }
    return { cookie: cookieValue(doc), local };
  }
  function get() {
    const cookie = cookieValue(doc);
    let local = null, failedLocal = false;
    try { local = parse(storage.getItem(KEY)); } catch { failedLocal = true; }
    const allowed = sessionChoice ?? cookie ?? local ?? false;
    return Object.freeze({ key: KEY, cookieName: COOKIE,
      hasCookie: cookie !== null, hasLocalStorage: local !== null,
      allowed, shouldPrompt: sessionChoice === null && cookie === null,
      cookieValue: cookie, localValue: local,
      persistence: failedLocal || failedWrite ? 'session' : 'persistent' });
  }
  function notify(source) {
    const state = get();
    if (state.allowed === lastAllowed) return state;
    lastAllowed = state.allowed;
    for (const listener of [...subscribers]) listener(state, { source });
    target.dispatchEvent?.(new CustomEvent('audioConsentChanged', { detail: { allowed: state.allowed, source } }));
    return state;
  }
  lastAllowed = get().allowed;
  function setAllowed(value, { cookieDays = 365 } = {}) {
    if (disposed) return get();
    sessionChoice = !!value;
    const failures = [];
    try { storage.setItem(KEY, String(sessionChoice)); } catch { failures.push(KEY); }
    try {
      doc.cookie = `${COOKIE}=${sessionChoice}; Path=/; Max-Age=${Math.max(0, Math.round(cookieDays * 86400))}; SameSite=Lax`;
      if (cookieValue(doc) !== sessionChoice) failures.push(COOKIE);
    } catch { failures.push(COOKIE); }
    failedWrite = failures.length > 0;
    persistedBaseline = persistedValues();
    const state = notify('local');
    return Object.freeze({ ...state, failedKeys: failures });
  }
  function subscribe(listener, { signal, immediate = false } = {}) {
    if (disposed || typeof listener !== 'function') return () => {};
    subscribers.add(listener);
    const stop = () => { subscribers.delete(listener); signal?.removeEventListener('abort', stop); };
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    else if (immediate) listener(get(), { source: 'system' });
    return stop;
  }
  function prompt(options = {}) {
    if (get().allowed) return Promise.resolve(get());
    if (pending) return pending.promise;
    let root = doc.getElementById(options.modalId || 'permissionModal');
    let allow = doc.getElementById(options.allowButtonId || 'permAllow');
    let deny = doc.getElementById(options.denyButtonId || 'permDeny');
    let owned = false;
    if (!root || !allow || !deny) {
      root = doc.getElementById('siteAudioConsentPrompt');
      if (!root) {
        root = doc.createElement('div');
        root.id = 'siteAudioConsentPrompt';
        root.className = 'site-audio-consent';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'siteAudioConsentTitle');
        root.setAttribute('aria-describedby', 'siteAudioConsentMessage');
        const box = doc.createElement('div');
        box.className = 'site-audio-consent__box';
        const heading = doc.createElement('h2'); heading.id = 'siteAudioConsentTitle'; heading.textContent = options.title || 'Allow sound?';
        const message = doc.createElement('p'); message.id = 'siteAudioConsentMessage'; message.textContent = options.message || 'This page can play sound. Allow audio playback?';
        allow = doc.createElement('button'); allow.type = 'button'; allow.textContent = 'Allow'; allow.dataset.audioConsent = 'allow';
        deny = doc.createElement('button'); deny.type = 'button'; deny.textContent = 'Deny'; deny.dataset.audioConsent = 'deny';
        box.append(heading, message, allow, deny); root.append(box); doc.body.append(root);
        owned = true;
      } else {
        allow = root.querySelector('[data-audio-consent="allow"]');
        deny = root.querySelector('[data-audio-consent="deny"]');
      }
    }
    if (!root || !allow || !deny) return Promise.resolve({ ...get(), cancelled: true });
    const previousFocus = doc.activeElement;
    root.classList.remove('hidden'); root.style.display = '';
    const promise = new Promise(resolve => {
      const finish = value => {
        allow.removeEventListener('click', onAllow); deny.removeEventListener('click', onDeny);
        root.removeEventListener('keydown', onKeydown);
        options.signal?.removeEventListener('abort', onAbort);
        if (owned) root.remove();
        else { root.classList.add('hidden'); root.style.display = 'none'; }
        previousFocus?.focus?.();
        pending = null;
        resolve(value === null ? { ...get(), cancelled: true } : setAllowed(value, options));
      };
      const onAllow = () => finish(true), onDeny = () => finish(false), onAbort = () => finish(null);
      const onKeydown = event => {
        if (event.key === 'Escape') { event.preventDefault(); onDeny(); return; }
        if (event.key !== 'Tab') return;
        const first = allow, last = deny;
        if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
      };
      allow.addEventListener('click', onAllow); deny.addEventListener('click', onDeny);
      root.addEventListener('keydown', onKeydown);
      options.signal?.addEventListener('abort', onAbort, { once: true });
      pending = { promise: null, cancel: onAbort };
      if (options.signal?.aborted) onAbort(); else allow.focus();
    });
    if (pending) pending.promise = promise;
    return promise;
  }
  const invalidate = () => {
    const persisted = persistedValues();
    if (sessionChoice !== null && persistedBaseline &&
      (persisted.cookie !== persistedBaseline.cookie || persisted.local !== persistedBaseline.local)) {
      sessionChoice = null;
      failedWrite = false;
    }
    persistedBaseline = persisted;
    notify('other-tab');
  };
  target.addEventListener?.('storage', invalidate);
  target.addEventListener?.('focus', invalidate);
  target.addEventListener?.('pageshow', invalidate);
  return { get, setAllowed, subscribe, prompt,
    dispose() {
      if (disposed) return;
      disposed = true; pending?.cancel();
      target.removeEventListener?.('storage', invalidate);
      target.removeEventListener?.('focus', invalidate);
      target.removeEventListener?.('pageshow', invalidate);
      subscribers.clear();
    }
  };
}
