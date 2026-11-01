import { safeDrawImage } from '../assets-config.js';
import { createCorsImage } from './media-elements.js';
import { drawBackControl } from './back-control.js';

const ICON_SVG_PATHS = {
  back: '../assets/video-playback-icons/arrow_back_2.svg',
  volume_on: '../assets/video-playback-icons/volume_high.svg',
  volume_off: '../assets/video-playback-icons/no_sound.svg',
  volume_low: '../assets/video-playback-icons/volume_low.svg',
  volume_medium: '../assets/video-playback-icons/volume_medium.svg',
  volume_high: '../assets/video-playback-icons/volume_high.svg'
};

const svgTextCache = new Map();
const iconImageCache = new Map();

function buildInlineSvg(name, color) {
  if (name === 'play') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="${color}"><polygon points="22,14 22,50 50,32"/></svg>`;
  }
  if (name === 'pause') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="${color}"><rect x="18" y="14" width="10" height="36"/><rect x="36" y="14" width="10" height="36"/></svg>`;
  }
  return null;
}

function colorizeSvg(svgText, color) {
  if (!svgText) return svgText;
  if (svgText.includes('fill=')) {
    return svgText.replace(/fill="[^"]*"/g, `fill="${color}"`);
  }
  return svgText.replace('<svg', `<svg fill="${color}"`);
}

function ensureSvgText(path) {
  if (svgTextCache.has(path)) return svgTextCache.get(path);
  fetch(path).then((res) => res.text()).then((text) => {
    svgTextCache.set(path, text);
  }).catch(() => {
    svgTextCache.set(path, null);
  });
  svgTextCache.set(path, null);
  return null;
}

function getIconImage(name, color) {
  const key = `${name}|${color}`;
  const cached = iconImageCache.get(key);
  if (cached) {
    if (!cached.ready && ICON_SVG_PATHS[name] && !cached.img.src) {
      const raw = svgTextCache.get(ICON_SVG_PATHS[name]);
      if (raw) {
        const colored = colorizeSvg(raw, color);
        cached.img.src = `data:image/svg+xml;utf8,${encodeURIComponent(colored)}`;
      }
    }
    return cached.ready ? cached.img : null;
  }

  const entry = { img: createCorsImage(null), ready: false };
  iconImageCache.set(key, entry);
  entry.img.onload = () => { entry.ready = true; };

  if (ICON_SVG_PATHS[name]) {
    const raw = ensureSvgText(ICON_SVG_PATHS[name]);
    if (raw) {
      const colored = colorizeSvg(raw, color);
      entry.img.src = `data:image/svg+xml;utf8,${encodeURIComponent(colored)}`;
    }
  } else {
    const inline = buildInlineSvg(name, color);
    if (inline) {
      entry.img.src = `data:image/svg+xml;utf8,${encodeURIComponent(inline)}`;
    }
  }
  return null;
}

export function drawIconAsset(ctx, rect, name, color) {
  if (name === 'back') { drawBackControl(ctx, rect); return true; }
  const img = getIconImage(name, color);
  if (img && img.complete) {
    safeDrawImage(ctx, img, rect.x, rect.y, rect.w, rect.h);
    return true;
  }
  return false;
}

export function drawClockIcon(ctx, rect, color, fontFamily) {
  ctx.save();
  ctx.fillStyle = color || '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = Math.round(rect.h * 0.9);
  const font = fontFamily || '"Material Symbols Rounded","Material Symbols Outlined","Material Icons Round","Material Icons"';
  ctx.font = `${size}px ${font}`;
  ctx.fillText('schedule', rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
  ctx.restore();
}

export function getVolumeIconName(volume, muted) {
  const level = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
  if (muted || level <= 0.0001) return 'volume_off';
  if (level <= 0.3) return 'volume_low';
  if (level <= 0.7) return 'volume_medium';
  return 'volume_high';
}
