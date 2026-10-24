(() => {
  'use strict';

  const body = document.body;
  if (!body || body.dataset.mode === 'admin' || body.dataset.mode === 'preview') return;

  const settingsApi = window.CakeAppearanceSettings;
  const defaultSettings = settingsApi?.defaults?.() || { random: true, defaultCake: 'redVelvet', pages: {} };
  const pageByPath = new Map([
    ['/', 'home'], ['/index.html', 'home'], ['/flavors', 'flavors'], ['/cake/flavors.html', 'flavors'],
    ['/gallery', 'gallery'], ['/gallery.html', 'gallery'], ['/about', 'about'], ['/about.html', 'about'],
    ['/order', 'order'], ['/cake/order.html', 'order'], ['/cake/order-status.html', 'order'], ['/custom', 'custom'], ['/custom.html', 'custom']
  ]);
  const normalizedPath = (location.pathname.replace(/^\/cake(?=\/|$)/, '').replace(/\/$/, '') || '/');
  const page = pageByPath.get(normalizedPath) || body.dataset.page || 'home';
  let selectedBackground = '';
  let menuPromise = window.CakeMenuPromise;
  if (!menuPromise || typeof menuPromise.then !== 'function') {
    menuPromise = fetch('/api/menu', { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('Menu settings unavailable.');
      return response.json();
    });
    window.CakeMenuPromise = menuPromise;
  }

  function availableBases(menu) {
    const native = settingsApi?.CAKE_IDS || ['redVelvet', 'vanilla', 'lemon', 'white', 'chocolate', 'carrot', 'pistachio'];
    const cakes = Array.isArray(menu?.cakes) ? menu.cakes : [];
    const active = cakes.filter(entry => Array.isArray(entry) && entry.length && entry[3] !== false).map(entry => entry[0]);
    const visuals = menu?.visuals?.cakes || {};
    const bases = active.map(id => visuals[id]?.base || id).filter(id => native.includes(id));
    return [...new Set(bases)];
  }

  function apply(id) {
    const preset = window.CAKE_PRESET_BY_ID?.[id];
    if (!preset) return;
    selectedBackground = id;
    const root = document.documentElement;
    root.style.setProperty('--cake-tint', preset.tint);
    root.style.setProperty('--cake-texture', `url("${preset.texture}")`);
    root.style.setProperty('--cake-texture-size', preset.backgroundSize || `${preset.tileSize || 1024}px ${preset.tileSize || 1024}px`);
    root.style.setProperty('--cake-texture-repeat', preset.backgroundRepeat || 'repeat');
    root.style.setProperty('--cake-texture-position', preset.backgroundPosition || 'center center');
    root.style.setProperty('--cake-texture-attachment', preset.backgroundAttachment || 'fixed');
    root.style.setProperty('--cake-texture-blend', preset.defaultBlend || 'normal');
    const channels = preset.medianRGB || [113, 7, 6];
    const luma = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    const light = luma >= 150;
    root.style.setProperty('--cake-nav-ink', light ? '#39251d' : '#fff4df');
    root.style.setProperty('--cake-nav-surface', light ? 'rgb(255 244 223 / .88)' : 'rgb(35 20 23 / .88)');

    // Content pages and the order form use a cover image; the home scene keeps its calibrated repeating crumb tile.
    if (page !== 'home') {
      body.style.backgroundColor = preset.tint;
      body.style.backgroundImage = `linear-gradient(rgb(20 15 18 / .08), rgb(20 15 18 / .08)), url("${preset.texture}")`;
      body.style.backgroundPosition = 'center, center';
      body.style.backgroundSize = 'auto, cover';
      body.style.backgroundRepeat = 'no-repeat';
      body.style.backgroundAttachment = 'scroll, fixed';
      body.style.backgroundBlendMode = 'multiply, normal';
    }
    body.dataset.cakePageBackground = id;
  }

  Promise.resolve(menuPromise).then(menu => {
    const settings = settingsApi?.normalize ? settingsApi.normalize(menu?.appearance ?? defaultSettings) : (menu?.appearance || defaultSettings);
    const allowed = availableBases(menu);
    const id = settingsApi?.choose ? settingsApi.choose(settings, page, Math.random, allowed) : settings.pages?.[page] || settings.defaultCake || 'redVelvet';
    apply(id);
  }).catch(() => apply(defaultSettings.pages?.[page] || defaultSettings.defaultCake || 'redVelvet'));

  // The home editor recalculates its native cake material on resize. Reapply this page's selected native base afterward.
  window.addEventListener('resize', () => { if (selectedBackground) apply(selectedBackground); });
})();
