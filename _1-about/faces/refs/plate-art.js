// Shared canvas artwork for the 3D plates and Constructor previews.
export const REFS_MAX_PLATES = 32;
export const REFS_MAX_IMAGE_LENGTH = 100000;
export const REFS_MAX_TEXT_LENGTH = 2000;
const IMAGE_URI = /^data:image\/(?:png|jpeg|webp);base64,[a-z\d+/]+={0,2}$/i;
const HEX = /^#[\da-f]{6}$/i;
const defaults = Object.freeze({bodyColor: '#14283a', rimColor: '#9e8060', imageScale: 1,
  sourceId: ''});

export function normalizeRefsPlate(value) {
  const plate = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    image: typeof plate.image === 'string' && plate.image.length <= REFS_MAX_IMAGE_LENGTH &&
      IMAGE_URI.test(plate.image) ? plate.image : '',
    text: typeof plate.text === 'string' ? plate.text.slice(0, REFS_MAX_TEXT_LENGTH) : '',
    bodyColor: HEX.test(plate.bodyColor) ? plate.bodyColor.toLowerCase() : defaults.bodyColor,
    rimColor: HEX.test(plate.rimColor) ? plate.rimColor.toLowerCase() : defaults.rimColor,
    imageScale: Number.isFinite(Number(plate.imageScale)) ?
      Math.max(.1, Math.min(3, Number(plate.imageScale))) : defaults.imageScale,
    sourceId: typeof plate.sourceId === 'string' && /^[\w-]{1,80}$/.test(plate.sourceId) ?
      plate.sourceId : defaults.sourceId
  };
}

/** Draw a complete circular plate. `picture` is an already decoded image, if available. */
export function drawRefsPlateArtwork(ctx, number, plate = {}, picture = null) {
  const metadata = normalizeRefsPlate(plate);
  const {width, height} = ctx.canvas;
  const centerX = width / 2, centerY = height / 2;
  const radius = Math.min(width, height) * .46;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = metadata.bodyColor; ctx.fillRect(0, 0, width, height);
  if (picture && metadata.image) {
    const iw = picture.naturalWidth || picture.width;
    const ih = picture.naturalHeight || picture.height;
    if (iw > 0 && ih > 0) {
      const size = radius * 2, scale = Math.min(size / iw, size / ih) * metadata.imageScale;
      ctx.drawImage(picture, centerX - iw * scale / 2, centerY - ih * scale / 2,
        iw * scale, ih * scale);
    }
  } else {
    ctx.fillStyle = '#c9b89b';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `500 ${Math.round(radius * .8)}px Georgia, serif`;
    ctx.fillText(String(number), centerX, centerY + radius * .04);
  }
  ctx.restore();
  ctx.strokeStyle = metadata.rimColor; ctx.lineWidth = Math.max(2, radius * .045);
  ctx.beginPath(); ctx.arc(centerX, centerY, radius * .89, 0, Math.PI * 2); ctx.stroke();
}

/** Owns one asynchronous local-image load. Dispose invalidates late callbacks. */
export function createRefsPlateArtwork(canvas, number, plate = {}, onChange = () => {}) {
  const ctx = canvas.getContext('2d');
  let generation = 0, disposed = false, image = null, imageSource = '', current = null;
  function update(nextPlate) {
    if (disposed) return;
    current = normalizeRefsPlate(nextPlate);
    if (current.image === imageSource) {
      drawRefsPlateArtwork(ctx, number, current, image?.complete && image.naturalWidth ? image : null);
      onChange(); return;
    }
    const ticket = ++generation;
    if (image) { image.onload = image.onerror = null; image = null; }
    imageSource = current.image;
    drawRefsPlateArtwork(ctx, number, current);
    onChange();
    if (!current.image || typeof Image === 'undefined') return;
    const pending = new Image(); image = pending;
    pending.onload = () => {
      if (disposed || ticket !== generation) return;
      drawRefsPlateArtwork(ctx, number, current, pending); onChange();
    };
    pending.onerror = () => {
      if (disposed || ticket !== generation) return;
      image = null;
    };
    pending.src = current.image;
  }
  update(plate);
  return {update, dispose() {
    if (disposed) return;
    disposed = true; generation++;
    if (image) image.onload = image.onerror = null;
    image = null;
  }};
}
