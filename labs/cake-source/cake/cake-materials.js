/* Lazy multi-material overlays. Recipes are immutable; each render owns its decoded images. */
(() => {
  const catalog = window.CAKE_MATERIAL_CATALOG, sprites = new Map(), textures = new Map(), displayTextures = new Map(), spriteBounds = new WeakMap(), coloredCandy = new Map(), shellMasks = new Map();
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hashString = value => { let h = 2166136261; for (const char of String(value)) h = Math.imul(h ^ char.charCodeAt(0), 16777619); return h >>> 0; };
  const random = (seed, index, stream) => {
    let h = seed ^ hashString(stream) ^ Math.imul(index + 1, 0x9e3779b1);
    h = Math.imul(h ^ h >>> 16, 0x85ebca6b); h = Math.imul(h ^ h >>> 13, 0xc2b2ae35);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  };
  const variation = material => {
    const defaults = material.id === 'candyCoatedChocolate' ? { baseWidth: 34, sizeRange: [.85, 1.15], angleRange: [-170, 170] }
      : material.id === 'chocolateChips' ? { baseWidth: 28, sizeRange: [.5, 1.35], angleRange: [-170, 170] }
      : material.id === 'almondPieces' ? { baseWidth: 46, sizeRange: [.55, 1.4], angleRange: [-170, 170] }
      : material.id === 'walnutPieces' ? { baseWidth: 40, sizeRange: [.55, 1.4], angleRange: [-170, 170] }
      : { baseWidth: 52, sizeRange: [.6, 1.35], angleRange: [-170, 170] };
    return { ...defaults, topperAngleRange: [-28, 28], ...material.variation };
  };
  function variantSequence(ids, count, seed) {
    const result = [], source = [...new Set(ids)];
    if (!source.length) return result;
    for (let bag = 0; result.length < count; bag++) {
      const order = source.slice();
      for (let index = order.length - 1; index > 0; index--) {
        const other = Math.floor(random(seed, bag * 31 + index, 'shape') * (index + 1));
        [order[index], order[other]] = [order[other], order[index]];
      }
      if (order.length > 1 && result.at(-1) === order[0]) [order[0], order[1]] = [order[1], order[0]];
      result.push(...order.slice(0, count - result.length));
    }
    return result;
  }
  const faceSizeFactor = (settings, seed, index) => {
    const [minimum, maximum] = settings.sizeRange;
    const u = (random(seed, index, 'size-a') + random(seed, index, 'size-b')) / 2;
    return minimum + (maximum - minimum) * u;
  };
  const roleScale = name => {
    const raw = storedState.decorations?.[name], value = Number(raw);
    return raw === null || raw === undefined || raw === '' || !Number.isFinite(value) ? 1 : clamp(value, .5, 2);
  };
  const cakeScale = () => CakeTextureRenderer.resolveScale(storedState.colors?.cakePreset, storedState.colors?.cakeZoom);
  let generation = 0, activePromise = Promise.resolve(null), activeKey = null, syncedInputKey = null;
  const status = { requested: 0, completed: 0, commits: 0, discarded: 0, error: null, last: null, spriteLoads: 0, textureLoads: 0, pixelRowsProcessed: 0 };
  const topperNode = '.candy-material-topper', fillingNode = '.candy-material-filling';
  const effectiveSelection = () => {
    const d = window.CakeDecorationSettings?.resolve?.(storedState.decorations || {}) || (() => {
      const source = storedState.decorations || {}, pair = source.topper === 'strawberryRosette' || !source.topper;
      return { topperA: source.topperA || (pair ? 'strawberry' : source.topper), topperB: source.topperB || (pair ? 'rosette' : 'none'),
        topperAScale: source.topperAScale ?? source.topperScale ?? 1, topperBScale: source.topperBScale ?? 1, topperPattern: source.topperPattern || 'cluster',
        candyColors: source.candyColors || ['red','blue','yellow'], fillingFrequency: source.fillingFrequency ?? 1 };
    })();
    const supported = id => id==='none' || !!window.CakeToppingVisuals[id] || !!catalog.byId[id];
    const legacyUnknown = !('topperA' in (storedState.decorations || {})) && !supported(storedState.decorations?.topper);
    return { topperA: legacyUnknown ? 'strawberry' : supported(d.topperA) ? d.topperA : 'strawberry', topperB: legacyUnknown ? 'rosette' : supported(d.topperB) ? d.topperB : 'none', topperAScale: d.topperAScale, topperBScale: d.topperBScale,
      topperPattern: d.topperPattern, candyColors: d.candyColors, fillingFrequency: clamp(Number(d.fillingFrequency) || 0, 0, 2),
      filling: catalog.byId[storedState.decorations?.filling] ? storedState.decorations.filling : 'none',
      variationSeed: storedState.decorations?.variationSeed ?? 0 };
  };
  function clearNodes() {
    document.querySelectorAll(`${topperNode},${fillingNode},.seated-icing-canvas`).forEach(node => node.remove());
    document.querySelectorAll('.icing-contact-canvas[data-material-hidden]').forEach(node => { node.style.removeProperty('visibility'); delete node.dataset.materialHidden; });
    document.querySelectorAll('.garnish-charcoal[data-material-base-clip]').forEach(node => {
      node.style.clipPath = node.dataset.materialBaseClip;
      delete node.dataset.materialBaseClip;
    });
  }
  function syncSelection() {
    const selection = effectiveSelection(), preset = CAKE_PRESET_BY_ID[storedState.colors?.cakePreset] || CAKE_PRESET_BY_ID.redVelvet;
    const root = getComputedStyle(document.documentElement), blur = CakeContactRenderer.resolveSettings(storedState.blur || {});
    const scale = cakeScale();
    const key = JSON.stringify([innerWidth, innerHeight, selection, roleScale('fillingScale'), preset.id, scale.tileSize, blur, storedState.layers?.icingTilt, root.getPropertyValue('--cake-texture'), root.getPropertyValue('--cake-tint'), root.getPropertyValue('--icing')]);
    if (syncedInputKey !== null && key !== syncedInputKey) { generation++; activeKey = null; clearNodes(); }
    syncedInputKey = key; document.documentElement.dataset.topperMaterial = selection.topperA;
    if (!catalog.byId[selection.topperA] && !catalog.byId[selection.topperB]) document.querySelectorAll(topperNode).forEach(node => node.remove());
    if (!catalog.byId[selection.filling]) document.querySelectorAll(fillingNode).forEach(node => node.remove());
    return selection;
  }
  const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));
  async function sprite(materialId, spriteId) {
    const material = catalog.byId[materialId], key = `${materialId}:${spriteId}`;
    let entry = sprites.get(key);
    if (entry) { sprites.delete(key); sprites.set(key, entry); return await entry.promise; }
    entry = { promise: null };
    entry.promise = (async () => {
      const image = new Image(); image.src = material.assets[spriteId]; await image.decode();
      const ratio = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      status.spriteLoads++; return canvas;
    })();
    sprites.set(key, entry);
    while (sprites.size > Math.max(32, catalog.bounds.spriteCacheLimit || 0)) sprites.delete(sprites.keys().next().value);
    try {
      const image = await entry.promise;
      if (sprites.get(key) === entry) entry.image = image;
      return image;
    } catch (error) { if (sprites.get(key) === entry) sprites.delete(key); throw error; }
  }
  async function shellMask(materialId, variant, width, height) {
    const path = catalog.byId[materialId].shellMasks?.[variant];
    if (!path) return null;
    const key = `${materialId}:${variant}:${width}x${height}`;
    let entry = shellMasks.get(key);
    if (!entry) {
      entry = (async () => {
        const image = new Image(); image.src = path; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0, width, height);
        return ctx.getImageData(0, 0, width, height).data;
      })();
      shellMasks.set(key, entry);
      while (shellMasks.size > 32) shellMasks.delete(shellMasks.keys().next().value);
    } else { shellMasks.delete(key); shellMasks.set(key, entry); }
    try { return await entry; } catch (error) { if (shellMasks.get(key) === entry) shellMasks.delete(key); throw error; }
  }
  async function candySprite(base, color, cutFace, variant = 'cutRed', materialId = 'candyCoatedChocolate') {
    const key = `${materialId}:${variant}:${cutFace ? 'cut' : 'whole'}:${color}`, cached = coloredCandy.get(key);
    if (cached) { coloredCandy.delete(key); coloredCandy.set(key, cached); return cached; }
    const hex = CakeDecorationSettings.candyColors.find(item => item.id === color)?.hex || '#d52c36';
    const raw = hex.replace('#', ''), full = raw.length === 3 ? [...raw].map(char => char + char).join('') : raw;
    const target = [0, 2, 4].map(offset => parseInt(full.slice(offset, offset + 2), 16));
    const canvas = document.createElement('canvas'); canvas.width = base.width; canvas.height = base.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(base, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const mask = cutFace ? await shellMask(materialId, variant, canvas.width, canvas.height) : null;
    const explicitMask = !!catalog.byId[materialId].shellMasks?.[variant];
    for (let row = 0; row < canvas.height; row++) {
      if (row && row % 64 === 0) await yieldTask();
      for (let i = row * canvas.width * 4, end = i + canvas.width * 4; i < end; i += 4) {
      const r = data.data[i], g = data.data[i + 1], b = data.data[i + 2], alpha = data.data[i + 3];
      const redShell = r - g > 80 && r - b > 80 && r > 155;
      const blueShell = b - r > 50 && g - r > 20 && b > 115;
      const shell = explicitMask ? mask[i + 3] / 255 : !cutFace || redShell || blueShell ? 1 : 0;
      if (alpha < 8 || shell < .02) continue;
      const luma = r * .2126 + g * .7152 + b * .0722, shade = clamp(luma / 132, .55, 1.55);
      for (let channel = 0; channel < 3; channel++) data.data[i + channel] = Math.round(data.data[i + channel] * (1 - shell) + clamp(target[channel] * shade, 0, 255) * shell);
      }
    }
    ctx.putImageData(data, 0, 0); spriteBounds.set(canvas, spriteCrop(base)); coloredCandy.set(key, canvas);
    while (coloredCandy.size > 32) coloredCandy.delete(coloredCandy.keys().next().value);
    return canvas;
  }
  function geometry(band) { return CakeContactRenderer.edgeGeometry(band); }
  function analyzeCavities(image, presetId) {
    const width = Math.min(512, image.width), height = Math.round(image.height * width / image.width);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data, luma = new Float32Array(width * height);
    const integral = new Float64Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, p = i * 4;
      luma[i] = rgba[p] * .2126 + rgba[p + 1] * .7152 + rgba[p + 2] * .0722;
      integral[(y + 1) * (width + 1) + x + 1] = luma[i] + integral[y * (width + 1) + x + 1] + integral[(y + 1) * (width + 1) + x] - integral[y * (width + 1) + x];
    }
    const dark = new Uint8Array(width * height), labels = new Int32Array(width * height), regions = [];
    const meanAt = (x, y, r) => {
      const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(width, x + r + 1), y1 = Math.min(height, y + r + 1), stride = width + 1;
      return (integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0]) / ((x1 - x0) * (y1 - y0));
    };
    for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
      const i = y * width + x, contrast = meanAt(x, y, 9) - luma[i];
      const local = meanAt(x, y, 9), threshold = presetId === 'white' ? Math.max(5, local * .035) : Math.max(10, local * .105);
      if (contrast > threshold) dark[i] = 1;
    }
    // Join adjacent dark pores into openings while keeping their measured irregular outline.
    const joined = dark.slice();
    for (let y = 3; y < height - 3; y++) for (let x = 3; x < width - 3; x++) {
      const i = y * width + x;
      if (!dark[i] && ((dark[i - 1] && dark[i + 1]) || (dark[i - width] && dark[i + width]))) joined[i] = 1;
    }
    const queue = new Int32Array(width * height);
    for (let y = 3; y < height - 3; y++) for (let x = 3; x < width - 3; x++) {
      const seed = y * width + x; if (!joined[seed] || labels[seed]) continue;
      const id = regions.length + 1; let head = 0, tail = 1, x0 = x, x1 = x, y0 = y, y1 = y, sum = 0, darkSum = 0;
      queue[0] = seed; labels[seed] = id;
      while (head < tail) {
        const i = queue[head++], px = i % width, py = Math.floor(i / width);
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        sum += luma[i]; darkSum += meanAt(px, py, 9) - luma[i];
        for (const next of [i - 1, i + 1, i - width, i + width]) if (joined[next] && !labels[next]) { labels[next] = id; queue[tail++] = next; }
      }
      const rw = x1 - x0 + 1, rh = y1 - y0 + 1, ratio = rw / rh;
      regions.push({ id, x0, y0, x1, y1, width: rw, height: rh, area: tail, contrast: darkSum / tail, luma: sum / tail,
        suitable: tail >= (presetId === 'white' ? 14 : 25) && tail <= 1300 && rw >= (presetId === 'white' ? 5 : 7) && rh >= 4 && rw <= 52 && rh <= 38 && ratio > .42 && ratio < 3 && tail / (rw * rh) > .21 });
    }
    return { width, height, labels, regions: regions.filter(region => region.suitable) };
  }
  async function texture() {
    const preset = CAKE_PRESET_BY_ID[storedState.colors?.cakePreset] || CAKE_PRESET_BY_ID.redVelvet;
    const url = new URL(preset.texture, document.baseURI).href;
    let entry = textures.get(url);
    if (!entry) {
      entry = { promise: (async () => {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let sum = 0, count = 0;
        for (let i = 0; i < pixels.length; i += 64) { sum += pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722; count++; }
        status.textureLoads++; return { width: image.width, height: image.height, pixels, mean: sum / count, cavities: analyzeCavities(image, preset.id) };
      })() };
      textures.set(url, entry);
      while (textures.size > catalog.bounds.textureCacheLimit) textures.delete(textures.keys().next().value);
    } else { textures.delete(url); textures.set(url, entry); }
    let source;
    try { source = await entry.promise; } catch (error) { if (textures.get(url) === entry) textures.delete(url); throw error; }
    const cssTexture = getComputedStyle(document.documentElement).getPropertyValue('--cake-texture').trim();
    const displayPath = cssTexture.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    const displayURL = new URL(displayPath || preset.texture, document.baseURI).href;
    let displayEntry = displayTextures.get(displayURL);
    if (!displayEntry) {
      displayEntry = { promise: (async () => {
        const image = new Image(); image.src = displayURL; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
        return { width: canvas.width, height: canvas.height, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
      })() };
      displayTextures.set(displayURL, displayEntry);
      while (displayTextures.size > 2) displayTextures.delete(displayTextures.keys().next().value);
    } else { displayTextures.delete(displayURL); displayTextures.set(displayURL, displayEntry); }
    let display;
    try { display = await displayEntry.promise; } catch (error) { if (displayTextures.get(displayURL) === displayEntry) displayTextures.delete(displayURL); throw error; }
    const size = cakeScale().tileSize;
    const originX = (innerWidth - size) / 2, originY = (innerHeight - size * source.height / source.width) / 2;
    return { source, tileSize: size, originX, originY, labelAt(x, y) {
      const cavities = source.cavities;
      const px = ((Math.floor((x - originX) * cavities.width / size) % cavities.width) + cavities.width) % cavities.width;
      const py = ((Math.floor((y - originY) * cavities.width / size) % cavities.height) + cavities.height) % cavities.height;
      return cavities.labels[py * cavities.width + px];
    }, sampleDisplay(x, y) {
      const px = ((Math.floor((x - originX) * display.width / size) % display.width) + display.width) % display.width;
      const py = ((Math.floor((y - originY) * display.width / size) % display.height) + display.height) % display.height, i = (py * display.width + px) * 4;
      return { r: display.pixels[i], g: display.pixels[i + 1], b: display.pixels[i + 2] };
    }, sample(x, y) {
      const px = ((Math.floor((x - originX) * source.width / size) % source.width) + source.width) % source.width;
      const py = ((Math.floor((y - originY) * source.width / size) % source.height) + source.height) % source.height, i = (py * source.width + px) * 4;
      return { r: source.pixels[i], g: source.pixels[i + 1], b: source.pixels[i + 2], luma: source.pixels[i] * .2126 + source.pixels[i + 1] * .7152 + source.pixels[i + 2] * .0722, mean: source.mean };
    } };
  }
  function cavityCandidates(tex, stratum) {
    const { cavities } = tex.source, scale = tex.tileSize / cavities.width, candidates = [];
    const firstX = Math.floor((0 - tex.originX) / tex.tileSize) - 1, lastX = Math.ceil((innerWidth - tex.originX) / tex.tileSize) + 1;
    const firstY = Math.floor((stratum.top - tex.originY) / (cavities.height * scale)) - 1;
    const lastY = Math.ceil((stratum.bottom - tex.originY) / (cavities.height * scale)) + 1;
    for (let ty = firstY; ty <= lastY; ty++) for (let tx = firstX; tx <= lastX; tx++) for (const region of cavities.regions) {
      const left = tex.originX + tx * tex.tileSize + region.x0 * scale;
      const top = tex.originY + ty * cavities.height * scale + region.y0 * scale;
      const width = region.width * scale, height = region.height * scale;
      if (left < 12 || left + width > innerWidth - 12 || top < stratum.top + 12 || top + height > stratum.bottom - 12) continue;
      if (width < 12 || width > 90 || height < 9 || height > 62) continue;
      candidates.push({ region, left, top, width, height, score: region.contrast * Math.sqrt(region.area) / 100, tx, ty });
    }
    return candidates;
  }
  function rotatedFace(image, faceWidth, angle) {
    const crop = spriteCrop(image), width = Math.max(8, faceWidth), height = width * crop.height / crop.width;
    const radians = angle * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians), pad = 4;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(Math.abs(width * c) + Math.abs(height * s)) + 2 * pad;
    canvas.height = Math.ceil(Math.abs(width * s) + Math.abs(height * c)) + 2 * pad;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(radians);
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, -width / 2, -height / 2, width, height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), data = pixels.data;
    let x0 = canvas.width, y0 = canvas.height, x1 = 0, y1 = 0, alphaArea = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] < 20) continue;
      alphaArea++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { canvas, pixels, width, height, alphaArea, bounds: { left: x0 - canvas.width / 2, right: x1 + 1 - canvas.width / 2,
      top: y0 - canvas.height / 2, bottom: y1 + 1 - canvas.height / 2 } };
  }
  function paintFace(ctx, tex, candidate, face, stratumTop, materialId, spriteId, angle) {
    const { canvas: cut, pixels, bounds } = face, w = cut.width, h = cut.height;
    const edgeRange = clamp(Math.round(face.width * .042), 1, 3);
    const left = Math.round(candidate.x - w / 2), top = Math.round(candidate.y - h / 2);
    const original = pixels.data.slice();
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4, alpha = original[i + 3]; if (alpha < 12) continue;
      let distance = edgeRange + 1;
      for (let d = 1; d <= edgeRange; d++) {
        if (px - d < 0 || px + d >= w || py - d < 0 || py + d >= h ||
          original[(py * w + px - d) * 4 + 3] < 12 || original[(py * w + px + d) * 4 + 3] < 12 ||
          original[((py - d) * w + px) * 4 + 3] < 12 || original[((py + d) * w + px) * 4 + 3] < 12) { distance = d; break; }
      }
      const segment = Math.floor(px / 7), seed = Math.floor(candidate.x * .7 + candidate.y * .3);
      const upperBite = distance <= 2 && py < h / 2 && Math.sin(segment * 12.71 + seed * 1.93) > .82;
      const lowerBite = distance <= 2 && py >= h / 2 && Math.sin(segment * 9.19 - seed * 2.41) > .84;
      if (distance > edgeRange && !upperBite && !lowerBite) continue;
      const native = tex.sample(left + px, top + py), bright = clamp((native.luma / Math.max(1, native.mean) - .7) / .6, 0, 1);
      const irregular = .65 + .35 * Math.sin(px * .63 + py * .41) * Math.sin(py * .71 - px * .27);
      const rim = clamp((edgeRange + 1 - distance) / edgeRange, 0, 1) * irregular;
      pixels.data[i + 3] = Math.round(alpha * (1 - rim * (.08 + .3 * bright)));
      const fringe = (py < h / 2 && px % 11 < 3) || (py >= h / 2 && px % 13 < 4);
      const cavityEdge = candidate.region && tex.labelAt(left + px, top + py) !== candidate.region.id;
      if (distance <= 2 && bright > .5 && (fringe || cavityEdge)) {
        const crumb = tex.sampleDisplay(left + px, top + py), strength = rim * .28;
        pixels.data[i] = Math.round(pixels.data[i] * (1 - strength) + crumb.r * strength);
        pixels.data[i + 1] = Math.round(pixels.data[i + 1] * (1 - strength) + crumb.g * strength);
        pixels.data[i + 2] = Math.round(pixels.data[i + 2] * (1 - strength) + crumb.b * strength);
      }
      if ((upperBite || lowerBite) && bright > .55) {
        const crumb = tex.sampleDisplay(left + px, top + py), strength = .5;
        pixels.data[i] = Math.round(pixels.data[i] * (1 - strength) + crumb.r * strength);
        pixels.data[i + 1] = Math.round(pixels.data[i + 1] * (1 - strength) + crumb.g * strength);
        pixels.data[i + 2] = Math.round(pixels.data[i + 2] * (1 - strength) + crumb.b * strength);
        pixels.data[i + 3] = Math.max(pixels.data[i + 3], 210);
      }
    }
    cut.getContext('2d').putImageData(pixels, 0, 0);
    ctx.drawImage(cut, left, top - stratumTop);
    const actual = { x: left + bounds.left + w / 2, y: top + bounds.top + h / 2,
      width: bounds.right - bounds.left, height: bounds.bottom - bounds.top };
    return { role: 'filling', family: materialId, stratum: stratumTop, source: candidate.region ? 'cavity' : 'texture',
      cavityId: candidate.region?.id ?? null, cavityScore: candidate.score ?? null,
      sourceArea: candidate.region?.area ?? null, cutArea: face.width * face.height,
      cavityBounds: actual, sprite: spriteId, angle, center: { x: candidate.x, y: candidate.y }, faceWidth: face.width };
  }
  const halton = (index, base) => { let value = 0, factor = 1 / base; for (let n = index; n > 0; n = Math.floor(n / base), factor /= base) value += (n % base) * factor; return value; };
  function faceRect(candidate, face) {
    const b = face.bounds;
    return { left: candidate.x + b.left, right: candidate.x + b.right,
      top: candidate.y + b.top, bottom: candidate.y + b.bottom };
  }
  function alphaOverlap(candidate, face, other, otherFace, rect, old) {
    const left = Math.max(rect.left, old.left), right = Math.min(rect.right, old.right);
    const top = Math.max(rect.top, old.top), bottom = Math.min(rect.bottom, old.bottom);
    if (right <= left || bottom <= top) return 0;
    const hits = [face, otherFace].map((f, index) => {
      const center = index ? other : candidate;
      return (x, y) => {
        const px = Math.floor(x - center.x + f.canvas.width / 2), py = Math.floor(y - center.y + f.canvas.height / 2);
        return px >= 0 && px < f.canvas.width && py >= 0 && py < f.canvas.height &&
          f.pixels.data[(py * f.canvas.width + px) * 4 + 3] > 24;
      };
    });
    let intersectionSamples = 0;
    for (let iy = 0; iy < 4; iy++) for (let ix = 0; ix < 4; ix++) {
      const x = left + (ix + .5) * (right - left) / 4, y = top + (iy + .5) * (bottom - top) / 4;
      if (hits[0](x, y) && hits[1](x, y)) intersectionSamples++;
    }
    return intersectionSamples / 16 * (right - left) * (bottom - top) / Math.max(1, Math.min(face.alphaArea, otherFace.alphaArea));
  }
  async function chooseFaces(candidates, stratum, specs, seed, yieldIfNeeded) {
    const middle = { x: innerWidth / 2, y: (stratum.top + stratum.bottom) / 2, region: null, score: 0 };
    const pool = [middle], nativeCells = new Map();
    for (const cavity of candidates) {
      const x = cavity.left + cavity.width / 2, y = cavity.top + cavity.height / 2;
      const key = `${Math.floor(x / 36)}:${Math.floor(y / 32)}`;
      if (!nativeCells.has(key) || nativeCells.get(key).score < cavity.score) nativeCells.set(key, { ...cavity, x, y });
    }
    pool.push(...nativeCells.values());
    for (let i = 1; i <= 512; i++) {
      const x = 8 + (innerWidth - 16) * ((halton(i, 2) + random(seed, 0, 'position-x')) % 1);
      const y = stratum.top + 8 + (stratum.bottom - stratum.top - 16) * ((halton(i, 3) + random(seed, 0, 'position-y')) % 1);
      pool.push({ x, y, region: null, score: 0 });
    }
    const selected = [];
    for (let index = 0; index < specs.length; index++) {
      const spec = specs[index], face = spec.face;
      let best = null, bestScore = -Infinity;
      for (let candidateIndex = 0; candidateIndex < pool.length; candidateIndex++) {
        const candidate = pool[candidateIndex];
        const rect = faceRect(candidate, face);
        if (rect.left < 6 || rect.right > innerWidth - 6 || rect.top < stratum.top + 6 || rect.bottom > stratum.bottom - 6) continue;
        if (!index && candidate !== middle) continue;
        let nearest = Infinity, overlap = 0, sameShape = 0;
        for (const other of selected) {
          const distance = Math.hypot((candidate.x - other.x) / Math.max(35, (face.width + other.face.width) * .62),
            (candidate.y - other.y) / Math.max(30, (face.height + other.face.height) * .72));
          nearest = Math.min(nearest, distance);
          const old = faceRect(other, other.face);
          overlap += alphaOverlap(candidate, face, other, other.face, rect, old);
          if (other.variant === spec.variant && distance < 2.4) sameShape += (2.4 - distance);
        }
        const score = index ? Math.min(nearest, 2.35) - 5 * overlap - .95 * sameShape +
          (candidate.region ? .08 : 0) + random(seed, candidateIndex, 'placement-tie') * .24
          : 0;
        if (score > bestScore) { best = candidate; bestScore = score; }
      }
      if (!best) {
        // The centered point is still a safe last resort for tiny strata; keep amount independent of size.
        const b = face.bounds;
        best = { x: clamp(middle.x, 7 - b.left, innerWidth - 7 - b.right),
          y: clamp(middle.y, stratum.top + 7 - b.top, stratum.bottom - 7 - b.bottom), region: null, score: 0 };
      }
      selected.push({ ...best, face, variant: spec.variant });
      if (!(await yieldIfNeeded())) return null;
    }
    return selected;
  }
  function spriteCrop(image) {
    let crop = spriteBounds.get(image);
    if (crop) return crop;
    const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
    const sourceContext = source.getContext('2d', { willReadFrequently: true }); sourceContext.drawImage(image, 0, 0);
    const rgba = sourceContext.getImageData(0, 0, source.width, source.height).data;
    let x0 = source.width, y0 = source.height, x1 = 0, y1 = 0;
    for (let py = 0; py < source.height; py++) for (let px = 0; px < source.width; px++) if (rgba[(py * source.width + px) * 4 + 3] > 20) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    crop = { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }; spriteBounds.set(image, crop);
    return crop;
  }
  function piece(image, width, angle, findBottom, heightScale = 1) {
    const crop = spriteCrop(image), height = width * crop.height / crop.width * heightScale, scale = 2, pad = 10, canvas = document.createElement('canvas');
    const radians = angle * Math.PI / 180;
    canvas.width = Math.ceil((Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians)) + pad * 2) * scale);
    canvas.height = Math.ceil((Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians)) + pad * 2) * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.scale(scale, scale); ctx.translate(canvas.width / scale / 2, canvas.height / scale / 2);
    ctx.rotate(radians); ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, -width / 2, -height / 2, width, height);
    let bottom = 0, alphaTop = canvas.height / scale, x0 = canvas.width, x1 = 0;
    const byColumn = new Float32Array(canvas.width).fill(-1), data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (data[(y * canvas.width + x) * 4 + 3] > 20) {
      bottom = Math.max(bottom, y / scale); alphaTop = Math.min(alphaTop, y / scale); x0 = Math.min(x0, x); x1 = Math.max(x1, x); byColumn[x] = y / scale;
    }
    if (!findBottom) bottom = canvas.height / scale;
    return { canvas, width: canvas.width / scale, height: canvas.height / scale, scale, nominalHeight: height, bottom, alphaTop,
      footprint: { x0: x0 / scale, x1: x1 / scale, byColumn } };
  }
  function alphaSum(data) { let sum = 0; for (let i = 3; i < data.length; i += 4) sum += data[i] / 255; return sum; }
  function icingMask(ctx, g, band, left, top, scale, canvasHeight, seatedSource = null) {
    const source = seatedSource || band.querySelector('.icing-contact-canvas'); ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    if (source) ctx.drawImage(source, -left * scale, (-top - g.pad) * scale, source.width * scale, source.height * scale);
    else { ctx.beginPath(); for (let x = 0; x <= g.width; x += 4) { const px = x - left, py = g.topAt(Math.min(x, g.width - 1)) - top; if (!x) ctx.moveTo(px * scale, py * scale); else ctx.lineTo(px * scale, py * scale); }
      ctx.lineTo((g.width - left) * scale, canvasHeight); ctx.lineTo(-left * scale, canvasHeight); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function eraseViewportIcing(ctx, left, top) {
    for (const band of document.querySelectorAll('.frosting-band')) {
      const source = band.querySelector('.seated-icing-canvas') || band.querySelector('.icing-contact-canvas'), g = geometry(band); ctx.save(); ctx.globalCompositeOperation = 'destination-out';
      if (source) { const p = g.toViewport(0, -g.pad), px = g.toViewport(1, -g.pad), py = g.toViewport(0, 1 - g.pad); ctx.setTransform(px.x - p.x, px.y - p.y, py.x - p.x, py.y - p.y, p.x - left, p.y - top); ctx.drawImage(source, 0, 0); }
      else { ctx.beginPath(); [[0, 0], [g.width, 0], [g.width, g.height], [0, g.height]].forEach(([x, y], index) => { const p = g.toViewport(x, y); if (!index) ctx.moveTo(p.x - left, p.y - top); else ctx.lineTo(p.x - left, p.y - top); }); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
  }
  function projectedEdgeYAtViewportX(g, edgeAt, viewportX) {
    let low = 0, high = Math.max(0, g.width - 1);
    const left = g.toViewport(low, edgeAt(low)), right = g.toViewport(high, edgeAt(high));
    if (viewportX <= Math.min(left.x, right.x)) return left.x <= right.x ? left.y : right.y;
    if (viewportX >= Math.max(left.x, right.x)) return left.x >= right.x ? left.y : right.y;
    const ascending = right.x >= left.x;
    for (let step = 0; step < 20; step++) {
      const middle = (low + high) / 2, point = g.toViewport(middle, edgeAt(middle));
      if ((point.x < viewportX) === ascending) low = middle; else high = middle;
    }
    const middle = (low + high) / 2;
    return g.toViewport(middle, edgeAt(middle)).y;
  }
  function clipFillingToCrumb(ctx, canvas, stratum, first, second) {
    const upperGeometry = stratum.name === 'middle' ? first : second;
    const upperAt = upperGeometry.bottomAt;
    const lowerGeometry = stratum.name === 'middle' ? second : null;
    for (let x = 0; x < canvas.width; x++) {
      const upper = projectedEdgeYAtViewportX(upperGeometry, upperAt, x);
      const clearAbove = clamp(Math.ceil(upper - stratum.top), 0, canvas.height);
      if (clearAbove) ctx.clearRect(x, 0, 1, clearAbove);
      if (lowerGeometry) {
        const lower = projectedEdgeYAtViewportX(lowerGeometry, lowerGeometry.topAt, x);
        const clearBelow = clamp(Math.floor(lower - stratum.top) + 1, 0, canvas.height);
        if (clearBelow < canvas.height) ctx.clearRect(x, clearBelow, 1, canvas.height - clearBelow);
      }
    }
  }
  async function render(selection, token) {
    const topperSlots = CakeGarnishRenderer.layout().slots.filter(slot => catalog.byId[slot.id]), filling = catalog.byId[selection.filling], started = performance.now(), prepared = [], reports = [];
    let seatedSource = null, combinedSeatField = null;
    let lastYield = performance.now(), cooperativeYields = 0;
    const yieldBetweenFaces = async () => {
      if (performance.now() - lastYield >= 8) {
        await new Promise(resolve => setTimeout(resolve, 0));
        lastYield = performance.now(); cooperativeYields++;
      }
      return token === generation;
    };
    status.pixelRowsProcessed = 0;
    await CakeContactRenderer.whenIdle(); await CakeGarnishRenderer.whenIdle(); if (token !== generation) return null;
    const band = document.querySelector('.frosting-band-one'), g = geometry(band), settings = CakeContactRenderer.resolveSettings(storedState.blur || {});
    const blend = clamp(settings.blend, 0, 1), drag = clamp(settings.valley / 6, 0, 1);
    const garnishSeat = band.querySelector('.garnish-seat-canvas'), baseContact = band.querySelector('.icing-contact-canvas');
    const garnishDepth = garnishSeat?.contactEdges && baseContact?.contactEdges
      ? Float32Array.from(garnishSeat.contactEdges.top, (value, x) => Math.max(0, value - baseContact.contactEdges.top[x])) : null;
    for (const slot of topperSlots) {
      const topper = catalog.byId[slot.id];
      const width = Math.round(slot.width), height = Math.round(Math.min(96, parseFloat(getComputedStyle(band).top) - 3)), canvas = document.createElement('canvas');
      canvas.className = 'candy-material-topper'; canvas.dataset.materialOverlay = topper.id; canvas.setAttribute('aria-hidden', 'true');
      canvas.width = width * 2; canvas.height = (height + 40) * 2;
      canvas.style.cssText = `position:absolute;pointer-events:none;z-index:4;left:calc(50% + ${slot.center}px);top:-${height}px;transform:translateX(-50%);width:${width}px;height:${height + 40}px`;
      const ctx = canvas.getContext('2d'), left = g.width / 2 + slot.center - width / 2, top = -height, q = topper.coefficients, seatField = combinedSeatField || new Float32Array(g.width);
      combinedSeatField = seatField;
      const rawPlacements = catalog.topperPlacements(topper, selection.candyColors.length, selection.topperPattern, slot.width / slot.factor);
      const topperVariation = variation(topper), topSeed = hashString(`${topper.id}:${slot.center}:${selection.topperPattern}:${innerWidth}:topper:${topperVariation.seed ?? ''}:${selection.variationSeed}`);
      const variants = variantSequence(topper.roles.topper, rawPlacements.length, topSeed);
      const palette = variantSequence(selection.candyColors, rawPlacements.length, topSeed ^ hashString('topper-color'));
      const placements = rawPlacements.map((entry, index) => ({
        ...entry, sprite: variants[index],
        widthPx: entry.widthPx * clamp(faceSizeFactor(topperVariation, topSeed, index), .78, 1.19),
        angleDeg: topperVariation.topperAngleRange[0] + random(topSeed, index, 'topper-angle') *
          (topperVariation.topperAngleRange[1] - topperVariation.topperAngleRange[0])
      }));
      const decoded = new Map();
      for (const id of new Set(variants)) {
        decoded.set(id, await sprite(topper.id, id));
        if (!(await yieldBetweenFaces())) return null;
      }
      const preparePieces = async fit => {
        const staged = [], topScale = 3 * slot.factor * fit, offsetScale = 2.25 * slot.factor * fit;
        for (let index = 0; index < placements.length; index++) {
          const placement = placements[index], candyColor = palette[index];
          if (topper.id === 'candyCoatedChocolate' && !candyColor) continue;
          const image = decoded.get(placement.sprite);
          const angle = placement.angleDeg;
          const p = piece(image, placement.widthPx * topScale, angle, true, topper.topperHeightScale);
          const proposedX = width / 2 + placement.xOffsetPx * offsetScale - p.width / 2;
          const x = clamp(proposedX, 2 - p.footprint.x0, width - 2 - p.footprint.x1);
          const silhouetteSeat = topper.id === 'caramelNutChocolate' ? .74 : 1;
          const support = clamp(.14 + q.weight * q.contactArea * (1 - q.icingFirmness * .35) * .62, .16, .42) * silhouetteSeat;
          const depth = clamp(p.nominalHeight * support * .68 * placement.seatMultiplier, 2, 18 * slot.factor * fit);
          const edge = g.topAt(left + x + p.width / 2), y = height + edge + depth - p.bottom;
          staged.push({ placement, candyColor, angle, p, x, depth, edge, y });
          if (!(await yieldBetweenFaces())) return null;
        }
        return staged;
      };
      let fit = 1, staged;
      for (let attempt = 0; attempt < 4; attempt++) {
        staged = await preparePieces(fit); if (!staged) return null;
        const minTop = Math.min(...staged.map(item => item.y + item.p.alphaTop));
        if (minTop >= 3) break;
        if (attempt === 3) throw new Error(`Topper exceeds visible icing space: ${topper.id}`);
        fit *= clamp((height - 3) / (height - minTop) * .99, .5, .98);
      }
      const topScale = 3 * slot.factor * fit;
      for (const item of staged) {
        const { placement, candyColor, angle, x, depth, edge, y } = item;
        const p = topper.id === 'candyCoatedChocolate'
          ? piece(await candySprite(decoded.get(placement.sprite), candyColor, true, placement.sprite), placement.widthPx * topScale, angle, true, topper.topperHeightScale) : item.p;
        const footprint = p.footprint;
        for (let px = Math.ceil(footprint.x0); px <= footprint.x1; px++) {
          const gx = Math.round(left + x + px), ix = clamp(Math.round(px * p.scale), 0, footprint.byColumn.length - 1);
          if (gx < 0 || gx >= seatField.length || footprint.byColumn[ix] < 0) continue;
          const shape = clamp((footprint.byColumn[ix] - (p.bottom - 9 * topScale)) / (9 * topScale), 0, 1);
          const taper = Math.sin(Math.PI * clamp((px - footprint.x0 + 1) / Math.max(2, footprint.x1 - footprint.x0 + 2), 0, 1));
          seatField[gx] = Math.max(seatField[gx], depth * shape * Math.sqrt(taper));
        }
        ctx.drawImage(p.canvas, x * 2, y * 2);
        reports.push({ role: 'topper', family: topper.id, sprite: topper.id === 'candyCoatedChocolate' ? `${placement.sprite}-${candyColor}` : placement.sprite,
          variant: placement.sprite, size: placement.widthPx * topScale, state: 'frontal-cut', angle, depth, edge,
          canvasWidth:width, canvasHeight:height+40, alphaBounds:{left:x+p.footprint.x0,right:x+p.footprint.x1,top:y+p.alphaTop,bottom:y+p.bottom},
          verticalFit:fit, center: g.toViewport(left + x + p.width / 2, edge) });
        if (!(await yieldBetweenFaces())) return null;
      }
      const before = alphaSum(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
      icingMask(ctx, g, band, left, top, 2, canvas.height * 1, null);
      const after = alphaSum(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
      const baseIcing = band.querySelector('.icing-contact-canvas');
      if (baseIcing) {
        for (let gx = 0; gx < seatField.length; gx++) if (seatField[gx] > .5) {
          const lift = 1 + Math.min(5, seatField[gx] * .42);
          ctx.drawImage(baseIcing, gx, 0, 1, baseIcing.height,
            (gx - left) * 2, (-top - g.pad - lift) * 2, 2, baseIcing.height * 2);
        }
      }
      reports.push({ role: 'topper-occlusion', family: topper.id, before, after, concealedFraction: (before - after) / before, usedGeometryFallback: !band.querySelector('.icing-contact-canvas') });
      prepared.push(canvas);
    }
    if (combinedSeatField) seatedSource = CakeContactRenderer.createSeatedSurface(band,
      combinedSeatField.map((value, x) => Math.max(value * .36, garnishDepth?.[x] || 0)), 'seated-icing-canvas');
    if (filling && selection.fillingFrequency > 0) {
      const first = geometry(document.querySelector('.frosting-band-one')), secondBand = document.querySelector('.frosting-band-two');
      const second = secondBand ? geometry(secondBand) : null;
      const firstBottom = first.toViewport(first.width / 2, first.bottomAt(first.width / 2)).y;
      const secondTop = second ? second.toViewport(second.width / 2, second.topAt(second.width / 2)).y : innerHeight;
      const secondBottom = second ? second.toViewport(second.width / 2, second.bottomAt(second.width / 2)).y : innerHeight;
      const strata = [{ name: 'middle', top: Math.floor(firstBottom), bottom: Math.ceil(secondTop) },
        { name: 'lower', top: Math.floor(secondBottom), bottom: innerHeight }].filter(stratum => stratum.bottom - stratum.top >= 34);
      const width = innerWidth, fillScale = roleScale('fillingScale');
      const middleStratum = strata.find(stratum => stratum.name === 'middle');
      const middleAtStandardDensity = middleStratum ? Math.max(0, Math.round(width *
        (middleStratum.bottom - middleStratum.top) / 14000)) : 0;
      const tex = await texture(); if (token !== generation) return null;
      for (const stratum of strata) {
        const top = stratum.top, height = stratum.bottom - top, left = 0;
        if (filling.cavitySprites?.length) {
          const canvas = document.createElement('canvas'); canvas.className = 'candy-material-filling';
          canvas.dataset.materialOverlay = filling.id; canvas.dataset.stratum = stratum.name;
          canvas.setAttribute('aria-hidden', 'true'); canvas.width = width; canvas.height = height;
          canvas.style.cssText = `position:fixed;pointer-events:none;z-index:0;left:0;top:${top}px;width:${width}px;height:${height}px`;
          const ctx = canvas.getContext('2d'), candidates = cavityCandidates(tex, stratum);
          const target = Math.min(56, Math.max(1, Math.round(width * height / 14000 * selection.fillingFrequency)));
          const settings = variation(filling), seed = hashString(`${filling.id}:${stratum.name}:${innerWidth}:${innerHeight}:${settings.seed ?? ''}:${selection.variationSeed}`);
          const shapeSeed = hashString(`${filling.id}:${innerWidth}:${innerHeight}:${settings.seed ?? ''}:${selection.variationSeed}:shapes`);
          // Continue the first bag near the middle stratum's standard-density pieces.
          // This offset is independent of the current density, keeping both strata's
          // piece prefixes stable as the amount control increases.
          const shapeOffset = stratum.name === 'lower' ? Math.min(filling.cavitySprites.length - 1, middleAtStandardDensity) : 0;
          const variants = variantSequence(filling.cavitySprites, target + shapeOffset, shapeSeed).slice(shapeOffset);
          const palette = variantSequence(selection.candyColors, target, seed ^ hashString('filling-color'));
          const images = new Map(), specs = [];
          for (let index = 0; index < target; index++) {
            const variant = variants[index], candyColor = palette[index];
            if (!images.has(variant)) images.set(variant, await sprite(filling.id, variant));
            const base = images.get(variant);
            const image = filling.id === 'candyCoatedChocolate'
              ? await candySprite(base, candyColor || 'red', true, variant, filling.id) : base;
            const angle = settings.angleRange[0] + random(seed, index, 'angle') * (settings.angleRange[1] - settings.angleRange[0]);
            let faceWidth = Math.max(17, settings.baseWidth * fillScale * faceSizeFactor(settings, seed, index));
            faceWidth = Math.min(faceWidth, width * .3);
            let face = rotatedFace(image, faceWidth, angle);
            const bounds = face.bounds, ratio = Math.min(1, (width - 16) / (bounds.right - bounds.left),
              (height - 16) / (bounds.bottom - bounds.top));
            if (ratio < 1) { faceWidth *= ratio; face = rotatedFace(image, faceWidth, angle); }
            specs.push({ variant, color: candyColor, angle, face });
            if (!(await yieldBetweenFaces())) return null;
          }
          const chosen = await chooseFaces(candidates, stratum, specs, seed, yieldBetweenFaces);
          if (!chosen) return null;
          for (let index = 0; index < chosen.length; index++) {
            const spec = specs[index], spriteId = filling.id === 'candyCoatedChocolate' ? `${spec.variant}-${spec.color}` : spec.variant;
            const report = paintFace(ctx, tex, chosen[index], spec.face, top, filling.id, spriteId, spec.angle);
            if (report) reports.push(report);
            if (!(await yieldBetweenFaces())) return null;
          }
          eraseViewportIcing(ctx, left, top);
          clipFillingToCrumb(ctx, canvas, stratum, first, second);
          reports.push({ role: 'cavity-analysis', family: filling.id, stratum: stratum.name, available: candidates.length, chosen: chosen.length, tileRegionCount: tex.source.cavities.regions.length });
          prepared.push(canvas);
          continue;
        }

      }
    }
    if (token !== generation) return null;
    clearNodes();
    if (seatedSource) {
      const base = band.querySelector('.icing-contact-canvas'); base.style.visibility = 'hidden'; base.dataset.materialHidden = 'true';
      band.append(seatedSource);
      const backdrop = band.querySelector('.garnish-charcoal');
      if (backdrop) {
        backdrop.dataset.materialBaseClip = backdrop.style.clipPath;
        const backHeight = parseFloat(backdrop.style.height) - 28, seatedGeometry = geometry(band), points = [];
        for (let x = 0; x < band.offsetWidth; x += 8) points.push(`${x}px ${backHeight + seatedGeometry.topAt(x)}px`);
        backdrop.style.clipPath = `polygon(0 0,100% 0,100% ${backHeight}px,${points.reverse().join(',')})`;
      }
    }
    for (const canvas of prepared) canvas.classList.contains('candy-material-topper') ? band.append(canvas) : document.querySelector('.home-screen').append(canvas);
    return { topperA: selection.topperA, topperB: selection.topperB, filling: selection.filling, topperAScale: selection.topperAScale, topperBScale: selection.topperBScale, fillingScale: roleScale('fillingScale'), fillingFrequency: selection.fillingFrequency, blend, drag, elapsedMs: performance.now() - started, cooperativeYields, reports, scrollWidth: document.documentElement.scrollWidth, viewport: [innerWidth, innerHeight], assetCount: sprites.size, cachedSpriteCount: sprites.size, coloredCandyCacheEntries: coloredCandy.size, shellMaskCacheEntries: shellMasks.size, textureCacheEntries: textures.size, displayTextureCacheEntries: displayTextures.size };
  }
  function request() {
    const selection = syncSelection(), preset = CAKE_PRESET_BY_ID[storedState.colors?.cakePreset] || CAKE_PRESET_BY_ID.redVelvet;
    const blur = CakeContactRenderer.resolveSettings(storedState.blur || {});
    const key = JSON.stringify([innerWidth, innerHeight, selection, roleScale('fillingScale'), preset.id, cakeScale().tileSize, blur, storedState.layers?.icingTilt, CakeContactRenderer.status.last?.token, CakeGarnishRenderer.status.last?.frame]);
    if (key === activeKey) return activePromise;
    activeKey = key; status.error = null; status.requested++; const id = status.requested, token = ++generation; clearNodes();
    activePromise = render(selection, token).then(result => {
      if (id !== status.requested || token !== generation || !result) { status.discarded++; return null; }
      status.completed = id; status.last = result; status.commits++; return result;
    }).catch(error => {
      if (id !== status.requested || token !== generation) { status.discarded++; return null; }
      status.completed = id; status.error = error.stack || error.message; activeKey = null; clearNodes(); document.documentElement.dataset.topperMaterial = 'strawberryRosette'; return null;
    });
    return activePromise;
  }
  async function whenIdle() { let promise; do { promise = activePromise; await promise; } while (promise !== activePromise); return status.last; }
  function cancel() { generation++; status.requested++; status.completed = status.requested; activeKey = null; clearNodes(); }
  function dispose() { cancel(); textures.clear(); displayTextures.clear(); sprites.clear(); coloredCandy.clear(); shellMasks.clear(); delete document.documentElement.dataset.topperMaterial; }
  addEventListener('pagehide', () => { cancel(); textures.clear(); displayTextures.clear(); sprites.clear(); coloredCandy.clear(); shellMasks.clear(); });
  addEventListener('pageshow', event => { if (event.persisted) syncSelection(); });
  window.CakeMaterialRenderer = { request, whenIdle, cancel, syncSelection, status, dispose };
})();
