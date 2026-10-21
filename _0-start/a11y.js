// a11y.js - site-wide accessibility settings helper
(function(){
  const LS_KEY = 'site.a11y.settings';
  const defaults = () => ({
    reducedMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    highContrast: false,
    textScale: 1, // 1.0 = normal, up to ~1.25 for accessibility
    focusOutline: 'auto', // 'always' | 'auto'
    masterVolume: 0.25,
    audioSyncMs: -270,
    mute: false
  });
  function load(){
    const owner = window.__siteSettings;
    if (owner) {
      const snapshot = owner.get();
      const a = snapshot.accessibility;
      return Object.assign({}, defaults(), {
        reducedMotion: a.reducedMotion, highContrast: a.highContrast,
        textScale: a.textScale, focusOutline: a.focusOutline,
        masterVolume: snapshot.audio.volume, audioSyncMs: snapshot.audio.syncMs,
        mute: snapshot.audio.muted
      });
    }
    try { const raw = localStorage.getItem(LS_KEY); if(!raw) return defaults();
      const obj = JSON.parse(raw);
      return Object.assign(defaults(), obj);
    } catch { return defaults(); }
  }
  function save(settings){
    try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); }
    catch(err){ console.warn('SiteA11y settings could not be saved', err); }
  }
  function apply(settings){
    const root = document.documentElement;
    root.classList.toggle('a11y-motion-reduced', !!settings.reducedMotion);
    root.classList.toggle('a11y-contrast-high', !!settings.highContrast);
    root.classList.toggle('a11y-focus-always', settings.focusOutline === 'always');
    root.style.setProperty('--font-scale', String(typeof settings.textScale === 'number' ? settings.textScale : 1));
    root.style.setProperty('--contrast-level', settings.highContrast ? '1' : '0');
  }
  function set(partial){
    const owner = window.__siteSettings;
    if (owner) {
      const audio = {}, accessibility = {};
      if (Object.hasOwn(partial, 'masterVolume')) audio.volume = partial.masterVolume;
      if (Object.hasOwn(partial, 'audioSyncMs')) audio.syncMs = partial.audioSyncMs;
      if (Object.hasOwn(partial, 'mute')) audio.muted = partial.mute;
      for (const key of ['reducedMotion', 'highContrast', 'textScale', 'focusOutline'])
        if (Object.hasOwn(partial, key)) accessibility[key] = key === 'textScale'
          ? (partial[key] === 'large' ? 1.25 : partial[key] === 'normal' ? 1 : partial[key])
          : partial[key];
      owner.patch({ audio, accessibility });
      const next = load(); apply(next); return next;
    }
    const cur = load();
    const next = Object.assign({}, cur, partial);
    save(next); apply(next);
    return next;
  }
  function get(){ return load(); }
  function resetAccessibility(){
    const owner = window.__siteSettings;
    if (owner) owner.reset(['accessibility.reducedMotion', 'accessibility.highContrast', 'accessibility.textScale', 'accessibility.focusOutline']);
    else { try { localStorage.removeItem(LS_KEY); } catch { /* session defaults remain */ } }
    const next = load(); apply(next); return next;
  }
  // Expose minimal API
  window.SiteA11y = { get, set, apply, resetAccessibility };
  // Apply on load
  document.addEventListener('DOMContentLoaded', ()=> apply(load()));
})();
