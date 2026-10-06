// Shared by DOM videos and canvas video screens. Only settings ship to visitors.
const defaults = { brightness: 1, contrast: 1, saturation: 1, hue: 0, sepia: 0 };
const ranges = { brightness: [0.5, 1.5], contrast: [0.5, 1.5], saturation: [0, 2], hue: [-180, 180], sepia: [0, 1] };
let settings = { ...defaults };
let original = false;
export const filterReady = fetch(new URL('../data/video-filter.json', import.meta.url))
  .then(response => { if (!response.ok) throw new Error('Filter settings unavailable'); return response.json(); })
  .then(value => setVideoFilter(value))
  .catch(() => setVideoFilter(defaults));

export function getVideoFilter() { return { ...settings }; }
export function videoFilterCSS() {
  return original ? 'none' : `brightness(${settings.brightness}) contrast(${settings.contrast}) sepia(${settings.sepia}) saturate(${settings.saturation}) hue-rotate(${settings.hue}deg)`;
}
export function setVideoFilter(value, showOriginal = false) {
  for (const key of Object.keys(defaults)) {
    const n = Number(value[key]);
    settings[key] = Number.isFinite(n) ? Math.max(ranges[key][0], Math.min(ranges[key][1], n)) : defaults[key];
  }
  original = showOriginal;
  document.documentElement.style.setProperty('--video-color-filter', videoFilterCSS());
  window.settingsController?.renderScreen?.();
}
const style = document.createElement('style');
style.textContent = 'video { filter: var(--video-color-filter, none); }';
document.head.append(style);

export function drawFilteredVideo(ctx, source, ...rect) {
  ctx.save();
  try {
    if (source instanceof HTMLVideoElement) ctx.filter = videoFilterCSS();
    ctx.drawImage(source, ...rect);
  } finally { ctx.restore(); }
}
