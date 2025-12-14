// a11y.js - site-wide accessibility settings helper
(function(){
  const LS_KEY = 'site.a11y.settings';
  const defaults = () => ({
    reducedMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    highContrast: false,
    textScale: 'normal', // 'normal' | 'large'
    focusOutline: 'always' // 'always' | 'auto'
  });
  function load(){
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
    root.classList.toggle('a11y-text-large', settings.textScale === 'large');
    root.classList.toggle('a11y-focus-always', settings.focusOutline === 'always');
  }
  function set(partial){
    const cur = load();
    const next = Object.assign({}, cur, partial);
    save(next); apply(next);
    return next;
  }
  function get(){ return load(); }
  // Expose minimal API
  window.SiteA11y = { get, set, apply };
  // Apply on load
  document.addEventListener('DOMContentLoaded', ()=> apply(load()));
})();
