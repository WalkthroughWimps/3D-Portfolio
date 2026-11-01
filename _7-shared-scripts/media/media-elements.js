import { assetUrl } from '../assets-config.js';

export function createCorsImage(src, eager = true) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  if (eager) img.loading = 'eager';
  if (src) img.src = assetUrl(src);
  return img;
}

export function createCorsVideo(src, { muted = true, loop = false, preload = 'metadata' } = {}) {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.preload = preload;
  video.playsInline = true;
  video.muted = muted;
  video.loop = loop;
  if (src) video.src = assetUrl(src);
  video.addEventListener('error', () => {
    const err = video.error;
    console.warn('VIDEO ERROR:', video.src, err ? { code: err.code, message: err.message } : err);
  });
  return video;
}
