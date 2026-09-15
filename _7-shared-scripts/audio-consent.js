const AUDIO_ALLOWED_KEY = 'site.audio.allowed';
const AUDIO_COOKIE_NAME = 'site_audio_allowed';
const DEFAULT_COOKIE_DAYS = 365;
const CONSENT_EVENT = 'audioConsentChanged';

function readCookie(name) {
  try {
    const prefix = `${name}=`;
    const parts = String(document.cookie || '').split(';');
    for (const rawPart of parts) {
      const part = rawPart.trim();
      if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
    }
  } catch (e) { /* ignore */ }
  return null;
}

function writeCookie(name, value, days = DEFAULT_COOKIE_DAYS) {
  try {
    const maxAge = Math.max(0, Math.round(days * 24 * 60 * 60));
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  } catch (e) { /* ignore */ }
}

function parseAllowed(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function ensurePromptStyles() {
  if (document.getElementById('site-audio-consent-styles')) return;
  const style = document.createElement('style');
  style.id = 'site-audio-consent-styles';
  style.textContent = `
.site-audio-consent.hidden { display:none !important; }
.site-audio-consent {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(8, 10, 14, 0.72);
}
.site-audio-consent__box {
  width: min(460px, 100%);
  padding: 20px 22px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(12, 16, 24, 0.96);
  box-shadow: 0 20px 50px rgba(0,0,0,0.35);
  color: #f4f6fb;
  font: 400 16px/1.45 "Source Sans 3","Segoe UI",sans-serif;
}
.site-audio-consent__box h3 {
  margin: 0 0 10px;
  font: 700 24px/1.15 "Source Sans 3","Segoe UI",sans-serif;
}
.site-audio-consent__box p {
  margin: 0 0 14px;
}
.site-audio-consent__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.site-audio-consent__actions button {
  min-width: 110px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.18);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: 600 15px/1 "Source Sans 3","Segoe UI",sans-serif;
}
.site-audio-consent__actions button.primary {
  background: rgba(255,255,255,0.92);
  color: #0f1218;
  border-color: rgba(255,255,255,0.92);
}`;
  document.head.appendChild(style);
}

function buildPromptDom(options = {}) {
  ensurePromptStyles();
  const root = document.createElement('div');
  root.className = 'site-audio-consent';
  root.id = 'siteAudioConsentPrompt';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'siteAudioConsentTitle');
  root.innerHTML = `
    <div class="site-audio-consent__box">
      <h3 id="siteAudioConsentTitle">${options.title || 'Allow sound?'}</h3>
      <p>${options.message || 'This page can play audio for videos and interactive media. Allow sound playback?'}</p>
      <div class="site-audio-consent__actions">
        <button type="button" class="primary" data-audio-consent="allow">Allow</button>
        <button type="button" data-audio-consent="deny">Deny</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  return root;
}

function resolvePromptElements(options = {}) {
  let root = document.getElementById(options.modalId || 'permissionModal');
  let allowBtn = document.getElementById(options.allowButtonId || 'permAllow');
  let denyBtn = document.getElementById(options.denyButtonId || 'permDeny');

  if (!root || !allowBtn || !denyBtn) {
    root = document.getElementById('siteAudioConsentPrompt') || buildPromptDom(options);
    allowBtn = root.querySelector('[data-audio-consent="allow"]');
    denyBtn = root.querySelector('[data-audio-consent="deny"]');
  }
  return { root, allowBtn, denyBtn };
}

export function getAudioConsentState() {
  const cookieValue = parseAllowed(readCookie(AUDIO_COOKIE_NAME));
  let localValue = null;
  try {
    localValue = parseAllowed(localStorage.getItem(AUDIO_ALLOWED_KEY));
  } catch (e) { /* ignore */ }

  if (cookieValue !== null) {
    try { localStorage.setItem(AUDIO_ALLOWED_KEY, cookieValue ? 'true' : 'false'); } catch (e) { /* ignore */ }
  }

  return {
    key: AUDIO_ALLOWED_KEY,
    cookieName: AUDIO_COOKIE_NAME,
    hasCookie: cookieValue !== null,
    hasLocalStorage: localValue !== null,
    allowed: cookieValue !== null ? cookieValue : !!localValue,
    shouldPrompt: cookieValue === null,
    cookieValue,
    localValue
  };
}

export function isAudioAllowed() {
  return !!getAudioConsentState().allowed;
}

export function setAudioConsentAllowed(allowed, options = {}) {
  const next = !!allowed;
  try { localStorage.setItem(AUDIO_ALLOWED_KEY, next ? 'true' : 'false'); } catch (e) { /* ignore */ }
  writeCookie(AUDIO_COOKIE_NAME, next ? 'true' : 'false', options.cookieDays || DEFAULT_COOKIE_DAYS);
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { allowed: next } }));
  } catch (e) { /* ignore */ }
  return next;
}

export function onAudioConsentChange(listener) {
  if (typeof listener !== 'function') return () => {};
  const handler = (event) => listener(!!event?.detail?.allowed, event);
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}

let pendingPrompt = null;

export function ensureAudioConsentPrompt(options = {}) {
  const state = getAudioConsentState();
  if (!state.shouldPrompt) return Promise.resolve(state);
  if (pendingPrompt) return pendingPrompt;

  pendingPrompt = new Promise((resolve) => {
    const { root, allowBtn, denyBtn } = resolvePromptElements(options);
    if (!root || !allowBtn || !denyBtn) {
      resolve(getAudioConsentState());
      pendingPrompt = null;
      return;
    }

    root.classList.remove('hidden');
    root.style.display = '';

    const finish = (allowed) => {
      setAudioConsentAllowed(allowed, options);
      root.classList.add('hidden');
      root.style.display = 'none';
      allowBtn.removeEventListener('click', onAllow);
      denyBtn.removeEventListener('click', onDeny);
      const nextState = getAudioConsentState();
      pendingPrompt = null;
      resolve(nextState);
    };

    const onAllow = () => finish(true);
    const onDeny = () => finish(false);
    allowBtn.addEventListener('click', onAllow);
    denyBtn.addEventListener('click', onDeny);
  });

  return pendingPrompt;
}
