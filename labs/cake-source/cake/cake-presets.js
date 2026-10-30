(() => {
  const PHOTO_TILE_SIZE = 1024;
  const presets = [
    { id: 'redVelvet', label: 'Red velvet', tint: '#710706', texture: 'assets/images/backgrounds/red-velvet-cake-crumb-v2.webp', medianRGB: [113, 7, 6], defaultBlend: 'normal', tileSize: PHOTO_TILE_SIZE, backgroundRepeat: 'repeat', backgroundPosition: 'center center', backgroundAttachment: 'fixed', customMethod: 'luminance-odds-tint-with-bounded-chroma' },
    { id: 'vanilla', label: 'Vanilla', tint: '#e7c17e', texture: 'assets/images/backgrounds/vanilla-cake-crumb-v2.webp', medianRGB: [231, 193, 126], defaultBlend: 'normal', tileSize: PHOTO_TILE_SIZE, backgroundRepeat: 'repeat', backgroundPosition: 'center center', backgroundAttachment: 'fixed', customMethod: 'luminance-odds-tint-with-bounded-chroma' },
    { id: 'lemon', label: 'Lemon', tint: '#ebbd53', texture: 'assets/images/backgrounds/lemon-cake-crumb-v2.webp', medianRGB: [235, 189, 83], defaultBlend: 'normal', tileSize: PHOTO_TILE_SIZE, backgroundRepeat: 'repeat', backgroundPosition: 'center center', backgroundAttachment: 'fixed', customMethod: 'luminance-odds-tint-with-bounded-chroma' },
    { id: 'white', label: 'White cake', tint: '#e2dfd3', texture: 'assets/images/backgrounds/white-cake-crumb-clean.webp', medianRGB: [226, 223, 211], defaultBlend: 'normal', tileSize: PHOTO_TILE_SIZE, backgroundRepeat: 'repeat', backgroundPosition: 'center center', backgroundAttachment: 'fixed', customMethod: 'luminance-odds-tint-with-bounded-chroma' },
    { id: 'chocolate', label: 'Chocolate', tint: '#4e200f', texture: 'assets/images/backgrounds/chocolate-cake-crumb-v1.webp', medianRGB: [78, 32, 15], defaultBlend: 'normal', tileSize: PHOTO_TILE_SIZE, backgroundRepeat: 'repeat', backgroundPosition: 'center center', backgroundAttachment: 'fixed', customMethod: 'luminance-odds-tint-with-bounded-chroma' },
    { id: 'carrot', label: 'Carrot cake', tint: '#b7621b', texture: 'assets/images/backgrounds/carrot-cake-crumb-v1.webp', medianRGB: [183, 98, 27], defaultBlend: 'normal', tileSize: PHOTO_TILE_SIZE, backgroundRepeat: 'repeat', backgroundPosition: 'center center', backgroundAttachment: 'fixed', customMethod: 'luminance-odds-tint-with-bounded-chroma' },
    { id: 'pistachio', label: 'Pistachio', tint: '#beb060', texture: 'assets/images/backgrounds/pistachio-cake-crumb-v1.webp', medianRGB: [190, 176, 96], defaultBlend: 'normal', tileSize: PHOTO_TILE_SIZE, backgroundRepeat: 'repeat', backgroundPosition: 'center center', backgroundAttachment: 'fixed', customMethod: 'luminance-odds-tint-with-bounded-chroma' }
  ].map(preset => Object.freeze({ ...preset, backgroundSize: preset.tileSize ? `${preset.tileSize}px ${preset.tileSize}px` : preset.backgroundSize, medianRGB: preset.medianRGB ? Object.freeze([...preset.medianRGB]) : undefined }));
  const byId = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(presets.map(preset => [preset.id, preset]))));
  function resolveScale(presetId, rawZoom, width = innerWidth, height = innerHeight) {
    const preset = byId[presetId] || byId.redVelvet;
    const parsed = Number(rawZoom);
    const zoom = rawZoom === null || rawZoom === undefined || rawZoom === '' || !Number.isFinite(parsed)
      ? 1 : Math.min(1.8, Math.max(.45, parsed));
    // A fixed repeating tile keeps CSS and canvas samples aligned at every viewport.
    void width; void height;
    const tileSize = Math.round(preset.tileSize * zoom);
    return { zoom, tileSize, backgroundSize: `${tileSize}px ${tileSize}px`,
      backgroundRepeat: preset.backgroundRepeat, backgroundPosition: preset.backgroundPosition,
      backgroundAttachment: preset.backgroundAttachment };
  }
  const foreground = Object.freeze({
    cakeThresholdLuma: 150,
    lightCake: Object.freeze({ ink: '#39251d', navSurface: 'rgb(255 244 223 / .88)' }),
    darkCake: Object.freeze({ ink: '#fff4df', navSurface: 'rgb(35 20 23 / .88)' })
  });
  const sourceCache = new Map();
  const tintCache = new Map();
  let activeTintKey = null;
  const maxTintUrls = 3;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const luminance = ([r, g, b]) => r * .2126 + g * .7152 + b * .0722;
  const hexRGB = (hex) => {
    const value = String(hex).replace(/^#/, '');
    if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) return null;
    const full = value.length === 3 ? [...value].map(channel => channel + channel).join('') : value;
    return [0, 2, 4].map(offset => Number.parseInt(full.slice(offset, offset + 2), 16));
  };
  const assetURL = (preset) => new URL(preset.texture, document.baseURI).href;

  async function decodeSource(preset) {
    const key = preset.texture;
    if (sourceCache.has(key)) return sourceCache.get(key);
    const pending = (async () => {
      const image = new Image();
      image.decoding = 'async';
      image.src = assetURL(preset);
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas pixel access is unavailable.');
      context.drawImage(image, 0, 0);
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const histograms = Array.from({ length: 3 }, () => new Uint32Array(256));
      for (let index = 0; index < rgba.length; index += 4) {
        histograms[0][rgba[index]] += 1;
        histograms[1][rgba[index + 1]] += 1;
        histograms[2][rgba[index + 2]] += 1;
      }
      const count = canvas.width * canvas.height;
      const medianRGB = histograms.map(histogram => {
        let cumulative = 0;
        return histogram.findIndex(amount => (cumulative += amount) >= count / 2);
      });
      return { width: canvas.width, height: canvas.height, rgba: new Uint8ClampedArray(rgba), medianRGB, medianLuma: luminance(medianRGB) };
    })();
    sourceCache.set(key, pending);
    try { return await pending; }
    catch (error) { if (sourceCache.get(key) === pending) sourceCache.delete(key); throw error; }
  }

  async function encodeBlob(canvas) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .92));
    if (!blob) throw new Error('The browser could not encode the tinted cake texture.');
    if (blob.type !== 'image/webp') throw new Error('The browser did not return a WebP texture.');
    return blob;
  }

  async function renderCustom(presetId, tint, isCurrent) {
    const preset = byId[presetId] || byId.redVelvet;
    if (preset.customMethod !== 'luminance-odds-tint-with-bounded-chroma') return null;
    const rgb = hexRGB(tint);
    if (!rgb) return null;
    const cacheKey = `${preset.id}:${rgb.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
    const cached = tintCache.get(cacheKey);
    if (cached) {
      tintCache.delete(cacheKey);
      tintCache.set(cacheKey, cached);
      return { key: cacheKey, url: cached.url, elapsedMs: 0, cached: true };
    }

    const started = performance.now();
    const source = await decodeSource(preset);
    if (!isCurrent()) return null;
    const effectiveRGB = [...rgb];
    const requestedLuma = luminance(effectiveRGB);
    // Keep two levels of headroom so lossy WebP rounding stays within the approved 32..232 output band.
    if (requestedLuma < 34) effectiveRGB.forEach((channel, index) => { effectiveRGB[index] = clamp(channel + 34 - requestedLuma, 0, 255); });
    else if (requestedLuma > 230) effectiveRGB.forEach((channel, index) => { effectiveRGB[index] = clamp(channel * 230 / requestedLuma, 0, 255); });
    const tintLuma = Math.max(1, luminance(effectiveRGB));
    const medianLuma = Math.max(1, source.medianLuma);
    const sourceOdds = clamp(medianLuma, 1, 254) / (255 - clamp(medianLuma, 1, 254));
    const tintOdds = clamp(tintLuma, 1, 254) / (255 - clamp(tintLuma, 1, 254));
    const oddsScale = tintOdds / sourceOdds;
    const chromaRetention = clamp(tintLuma / medianLuma, .25, 1);
    const medianChroma = source.medianRGB.map(channel => channel / medianLuma - 1);
    const tintRatios = effectiveRGB.map(channel => channel / tintLuma);
    // Rotate variation along the native hue toward the chosen hue. Subtracting a fixed
    // warm median from pale crumb highlights otherwise turns brown selections cyan.
    const chromaDenominator = Math.max(.02, medianChroma.reduce((sum, value) => sum + value * value, 0));
    const medianChromaSize = Math.hypot(...medianChroma);
    const orthogonalRetention = Math.min(1, Math.hypot(...tintRatios.map(ratio => ratio - 1)) / Math.max(.001, medianChromaSize));
    const lut = new Uint8ClampedArray(256);
    for (let value = 0; value < 256; value += 1) {
      const x = value / 255;
      lut[value] = Math.round(255 * x * oddsScale / (1 - x + x * oddsScale));
    }
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext('2d', { willReadFrequently: false });
    if (!context) throw new Error('Canvas rendering is unavailable.');
    const pixels = new Uint8ClampedArray(source.rgba);
    const rowsPerChunk = 32;
    const retainedChroma = chromaRetention;
    for (let startRow = 0; startRow < source.height; startRow += rowsPerChunk) {
      if (!isCurrent()) return null;
      const end = Math.min(source.height, startRow + rowsPerChunk);
      for (let y = startRow; y < end; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
          const index = (y * source.width + x) * 4;
          const red = source.rgba[index];
          const green = source.rgba[index + 1];
          const blue = source.rgba[index + 2];
          const pixelLuma = Math.max(1, red * .2126 + green * .7152 + blue * .0722);
          const outputLuma = lut[Math.round(pixelLuma)];
          const residualR = red / pixelLuma - 1 - medianChroma[0];
          const residualG = green / pixelLuma - 1 - medianChroma[1];
          const residualB = blue / pixelLuma - 1 - medianChroma[2];
          const parallel = (residualR * medianChroma[0] + residualG * medianChroma[1] + residualB * medianChroma[2]) / chromaDenominator;
          // Neutral choices should not amplify off-axis source noise into colored shadows.
          const variationR = parallel * (tintRatios[0] - 1) + orthogonalRetention * (residualR - parallel * medianChroma[0]);
          const variationG = parallel * (tintRatios[1] - 1) + orthogonalRetention * (residualG - parallel * medianChroma[1]);
          const variationB = parallel * (tintRatios[2] - 1) + orthogonalRetention * (residualB - parallel * medianChroma[2]);
          const chromaR = tintRatios[0] - 1 + retainedChroma * variationR;
          const chromaG = tintRatios[1] - 1 + retainedChroma * variationG;
          const chromaB = tintRatios[2] - 1 + retainedChroma * variationB;
          // Shorten the combined chroma toward neutral only where needed to keep
          // the mapped pore luminance; channel clipping would change that luminance.
          let gamutScale = 1;
          if (outputLuma > 0) {
            const headroom = 255 / outputLuma - 1;
            const highest = Math.max(chromaR, chromaG, chromaB);
            const lowest = Math.min(chromaR, chromaG, chromaB);
            if (highest > 0) gamutScale = Math.min(gamutScale, headroom / highest);
            if (lowest < 0) gamutScale = Math.min(gamutScale, -1 / lowest);
          }
          pixels[index] = clamp(Math.round(outputLuma * (1 + gamutScale * chromaR)), 0, 255);
          pixels[index + 1] = clamp(Math.round(outputLuma * (1 + gamutScale * chromaG)), 0, 255);
          pixels[index + 2] = clamp(Math.round(outputLuma * (1 + gamutScale * chromaB)), 0, 255);
        }
      }
      if (end < source.height) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (!isCurrent()) return null;
    context.putImageData(new ImageData(pixels, source.width, source.height), 0, 0);
    const blob = await encodeBlob(canvas);
    if (!isCurrent()) return null;
    const url = URL.createObjectURL(blob);
    tintCache.set(cacheKey, { url, elapsedMs: performance.now() - started });
    trimTintCache();
    const result = tintCache.get(cacheKey);
    return result ? { key: cacheKey, url, elapsedMs: result.elapsedMs, cached: false } : null;
  }

  function trimTintCache() {
    while (tintCache.size > maxTintUrls) {
      const key = [...tintCache.keys()].find(candidate => candidate !== activeTintKey);
      if (!key) break;
      const entry = tintCache.get(key);
      tintCache.delete(key);
      URL.revokeObjectURL(entry.url);
    }
  }

  function activateTint(key) {
    if (activeTintKey === key) return;
    if (activeTintKey) {
      const prior = tintCache.get(activeTintKey);
      if (prior) URL.revokeObjectURL(prior.url);
      tintCache.delete(activeTintKey);
    }
    activeTintKey = key && tintCache.has(key) ? key : null;
    trimTintCache();
  }

  function activeURL(key) {
    return key && key === activeTintKey ? tintCache.get(key)?.url || null : null;
  }

  window.CAKE_PRESETS = Object.freeze(presets);
  window.CAKE_PRESET_BY_ID = byId;
  window.CAKE_PRESET_FOREGROUND = foreground;
  window.CakeTextureRenderer = Object.freeze({ renderCustom, activateTint, activeURL, resolveScale });
})();
