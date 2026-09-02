"use strict";

// Texture catalog, image preparation, seamless repetition, and texture rendering.

const TRANSPARENT_TEXTURE_BASE_URL = "https://www.transparenttextures.com/patterns/";
const TRANSPARENT_TEXTURE_LOCAL_DIR = "assets/textures/transparent/";
const TEXTURE_RECOMMENDED_IDS = new Set(["natural-paper", "light-paper-fibers", "tactile-noise-light"]);
const MAP_TEXTURE_BASE_PX = 32;
const MAP_TEXTURE_REFERENCE_ZOOM = 5;
const MAP_TEXTURE_MIN_ZOOM_SCALE = 0.25;
const MAP_TEXTURE_MAX_ZOOM_SCALE = 12;
const MAP_TEXTURE_MAX_SCALE = 12;
const MAP_TEXTURE_ZOOM_SCALE_RATE = 0.5;
const FEATURED_TEXTURE_IDS = [
  "natural-paper", "paper", "textured-paper", "light-paper-fibers", "white-paperboard", "washi",
  "vintage-speckles", "tactile-noise-light", "subtle-freckles", "retina-dust", "subtle-grunge",
  "3px-tile", "argyle", "carbon-fibre", "carbon-fibre-big", "carbon-fibre-v2",
  "cardboard", "cardboard-flat", "clean-gray-paper", "cream-paper", "rice-paper", "rough-cloth",
  "woven", "linen", "black-thread-light", "cartographer", "tiny-grid", "wavecut",
  "diagonal-striped-brick", "dust", "fabric-of-squares", "graphy", "green-fibers", "handmade-paper",
  "noisy-grid", "old-map", "paper-fibers", "pinstripe", "stardust"
];

function textureCategory(id, label) {
  const text = `${id} ${label}`.toLowerCase();
  if (id === "none") return "None";
  if (text.includes("paper") || text.includes("cardboard") || text.includes("washi")) return "Paper";
  if (text.includes("fabric") || text.includes("linen") || text.includes("cloth") || text.includes("woven") || text.includes("twill") || text.includes("fibers") || text.includes("fibre")) return "Fabric / Fibers";
  if (text.includes("noise") || text.includes("dust") || text.includes("speckle") || text.includes("freckle") || text.includes("grain")) return "Grain / Noise";
  if (text.includes("grunge") || text.includes("scratch") || text.includes("worn") || text.includes("vintage")) return "Grunge";
  if (text.includes("tile") || text.includes("grid") || text.includes("square") || text.includes("stripe") || text.includes("argyle") || text.includes("carbon")) return "Pattern";
  return "Other";
}

function textureDefaults(id) {
  if (id === "none") return { defaultBlend: "multiply", defaultOpacity: 0 };
  if (id.includes("grunge") || id.includes("speckle") || id.includes("dust") || id.includes("freckle")) {
    return { defaultBlend: "multiply", defaultOpacity: 0.07 };
  }
  if (id.includes("paper") || id.includes("washi") || id.includes("fiber") || id.includes("fibre")) {
    return { defaultBlend: "multiply", defaultOpacity: 0.1 };
  }
  return { defaultBlend: "multiply", defaultOpacity: 0.08 };
}

function textureAssetUrl(texture) {
  if (!texture || texture.id === "none") return null;
  const file = texture.file || `${texture.id}.png`;
  if (texture.localUrl && texture.localAvailable !== false) {
    return new URL(texture.localUrl, document.baseURI).href;
  }
  if (texture.localAvailable !== false) {
    return new URL(`${TRANSPARENT_TEXTURE_LOCAL_DIR}${file}`, document.baseURI).href;
  }
  return new URL(`${TRANSPARENT_TEXTURE_LOCAL_DIR}white-wall.png`, document.baseURI).href;
}

const FALLBACK_TEXTURE_IDS = [
  "natural-paper", "paper", "textured-paper", "light-paper-fibers", "white-paperboard",
  "washi", "vintage-speckles", "tactile-noise-light", "subtle-freckles", "retina-dust",
  "subtle-grunge", "3px-tile", "argyle", "carbon-fibre", "cardboard", "cream-paper",
  "rice-paper", "rough-cloth", "woven", "black-thread-light", "cartographer", "tiny-grid",
  "wavecut"
];
const loadedTextureCatalog = Array.isArray(window.TRANSPARENT_TEXTURE_CATALOG)
  ? window.TRANSPARENT_TEXTURE_CATALOG
  : [];
const TRANSPARENT_TEXTURE_CATALOG = loadedTextureCatalog.length
  ? loadedTextureCatalog
  : FALLBACK_TEXTURE_IDS.map(id => ({
      id,
      file: `${id}.png`,
      localAvailable: true,
      localUrl: `${TRANSPARENT_TEXTURE_LOCAL_DIR}${id}.png`
    }));
const CATALOG_TEXTURES = TRANSPARENT_TEXTURE_CATALOG.map(texture => {
  if (!texture || typeof texture !== "object" || !texture.id) return null;
  const id = texture.id;
  const label = texture.label || id.replace(/-/g, " ").replace(/\b\w/g, char => char.toUpperCase());
  const result = {
    ...texture,
    id,
    label,
    category: textureCategory(id, label),
    sourceUrl: texture.url || `${TRANSPARENT_TEXTURE_BASE_URL}${texture.file || `${id}.png`}`,
    url: texture.url || `${TRANSPARENT_TEXTURE_BASE_URL}${texture.file || `${id}.png`}`,
    localUrl: texture.localUrl || `${TRANSPARENT_TEXTURE_LOCAL_DIR}${texture.file || `${id}.png`}`,
    recommended: TEXTURE_RECOMMENDED_IDS.has(id),
    purpose: texture.purpose || "Transparent texture overlay.",
    ...textureDefaults(id)
  };
  return result;
}).filter(Boolean);

const LAYER_TEXTURES = [
  { id: "none", label: "None", category: "None", url: null, localUrl: null, sourceUrl: null, defaultBlend: "multiply", defaultOpacity: 0 },
  ...CATALOG_TEXTURES
];

const LAYER_TEXTURE_BY_ID = Object.fromEntries(LAYER_TEXTURES.map(texture => [texture.id, texture]));
const TEXTURE_SORTER = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const TEXTURE_CATEGORY_ORDER = ["None", ...new Set(
  LAYER_TEXTURES
    .filter(texture => texture.id !== "none")
    .map(texture => texture.category || "Other")
    .sort((a, b) => TEXTURE_SORTER.compare(a, b))
)];

function sortedTextures(textures = LAYER_TEXTURES, { includeNone = true } = {}) {
  return [...textures]
    .filter(texture => includeNone || texture.id !== "none")
    .sort((a, b) => {
      if (a.id === "none") return -1;
      if (b.id === "none") return 1;
      const categoryCompare = TEXTURE_SORTER.compare(a.category || "Other", b.category || "Other");
      if (categoryCompare) return categoryCompare;
      return TEXTURE_SORTER.compare(a.label || a.id, b.label || b.id);
    });
}

function groupedTextures(textures = LAYER_TEXTURES, { includeNone = true } = {}) {
  const sorted = sortedTextures(textures, { includeNone });
  return TEXTURE_CATEGORY_ORDER
    .map(category => ({
      category,
      textures: sorted.filter(texture => (texture.category || "Other") === category)
    }))
    .filter(group => group.textures.length);
}

function textureGroupHeading(category) {
  const heading = document.createElement("div");
  heading.className = "texture-group-heading";
  heading.textContent = category;
  return heading;
}

function groupedTextureSelectOptions(textures = LAYER_TEXTURES, { includeNone = true } = {}) {
  return groupedTextures(textures, { includeNone }).map(group => {
    if (group.category === "None") {
      return new Option("None", "none");
    }
    const optionGroup = document.createElement("optgroup");
    optionGroup.label = group.category;
    group.textures.forEach(texture => {
      optionGroup.append(new Option(texture.label, texture.id));
    });
    return optionGroup;
  });
}

const LAYER_TEXTURE_BACKGROUNDS = Object.fromEntries(LAYER_TEXTURES.map(texture => [
  texture.id,
  textureAssetUrl(texture) ? `url("${textureAssetUrl(texture)}")` : "none"
]));
const embeddedTextureUrls = new Map();
const embeddedTexturePromises = new Map();
const textureImageCache = new Map();
const textureImagePromises = new Map();
const MAPLIBRE_TEXTURE_IMAGE_SIZE = 512;
const MAPLIBRE_TEXTURE_RENDER_VERSION = 3;
const MAPLIBRE_TEXTURE_LAYER_PREFIX = "rv-semantic-texture-";
const MAPLIBRE_LAND_TEXTURE_SOURCE_ID = "rv-land-texture-mask";
const MAPLIBRE_TEXTURE_KEYS = Object.freeze(["land", "water", "parks", "buildings"]);
const mapLibreTextureLayerIds = new Set();
const mapLibreTextureImageSignatures = new Map();
let mapLibreTextureRenderSignature = "";
let mapLibreTextureRefreshTimer = 0;
let mapLibreTextureBuildId = 0;
let applyingMapLibreTextureLayers = false;

const LAYER_TEXTURE_SIZES = Object.fromEntries(LAYER_TEXTURES.map(texture => [texture.id, "auto"]));
const textureDimensionCache = new Map();
const textureDimensionPromises = new Map();
const MAX_BAKED_TEXTURE_TILE_PX = 2000;
const MAX_RENDER_TEXTURE_TILE_PX = 2048;

const LINE_TEXTURE_DASHES = {
  none: null,
  "vintage-speckles": "1 5",
  "subtle-freckles": "1 6",
  "retina-dust": "1 7",
  "subtle-grunge": "7 5 1 5"
};

function readableTextureName(value) {
  return LAYER_TEXTURE_BY_ID[value]?.label || String(value || "").replace(/-/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function textureDimensions(type) {
  return textureDimensionCache.get(type) || { width: 32, height: 32, known: false };
}

function loadTextureDimensions(type) {
  if (!type || type === "none") return Promise.resolve(textureDimensions(type));
  if (textureDimensionCache.get(type)?.known) return Promise.resolve(textureDimensionCache.get(type));
  if (textureDimensionPromises.has(type)) return textureDimensionPromises.get(type);
  const texture = LAYER_TEXTURE_BY_ID[type];
  const url = textureAssetUrl(texture);
  if (!url) return Promise.resolve(textureDimensions(type));
  const promise = new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const dimensions = {
        width: Math.max(1, image.naturalWidth || 32),
        height: Math.max(1, image.naturalHeight || 32),
        known: true
      };
      textureDimensionCache.set(type, dimensions);
      resolve(dimensions);
    };
    image.onerror = () => resolve(textureDimensions(type));
    image.src = url;
  }).finally(() => {
    textureDimensionPromises.delete(type);
  });
  textureDimensionPromises.set(type, promise);
  return promise;
}

function loadTextureImage(type) {
  if (!type || type === "none") return Promise.resolve(null);
  if (textureImageCache.has(type)) return Promise.resolve(textureImageCache.get(type));
  if (textureImagePromises.has(type)) return textureImagePromises.get(type);
  const texture = LAYER_TEXTURE_BY_ID[type];
  const url = textureAssetUrl(texture);
  if (!url) return Promise.resolve(null);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      textureImageCache.set(type, image);
      textureDimensionCache.set(type, {
        width: Math.max(1, image.naturalWidth || 32),
        height: Math.max(1, image.naturalHeight || 32),
        known: true
      });
      resolve(image);
    };
    image.onerror = () => reject(new Error(`Could not load texture image: ${readableTextureName(type)}.`));
    image.src = url;
  }).finally(() => {
    textureImagePromises.delete(type);
  });
  textureImagePromises.set(type, promise);
  return promise;
}

function warmTextureDimensions() {
  const activeTypes = new Set();
  Object.values(layerStyles).forEach(style => {
    const texture = layerTexture(style?.texture || {});
    if (texture.enabled && texture.type && texture.type !== "none") activeTypes.add(texture.type);
    if (texture.enabled && texture.secondaryEnabled && texture.secondaryType && texture.secondaryType !== "none") {
      activeTypes.add(texture.secondaryType);
    }
  });
  Promise.allSettled([...activeTypes].map(loadTextureDimensions)).then(() => {
    renderSecondaryTextureOptions();
    updateTextureCompatibilityScore();
  });
}

function textureTileSize(type, displaySize) {
  const dimensions = textureDimensions(type);
  const maxSide = Math.max(dimensions.width, dimensions.height, 1);
  return {
    width: Math.max(1, Math.round(displaySize * dimensions.width / maxSide)),
    height: Math.max(1, Math.round(displaySize * dimensions.height / maxSide))
  };
}

function mapTextureZoomScale(zoom = map.getZoom()) {
  if (!textureScalesWithMap()) return 1;
  return clamp(
    2 ** ((zoom - MAP_TEXTURE_REFERENCE_ZOOM) * MAP_TEXTURE_ZOOM_SCALE_RATE),
    MAP_TEXTURE_MIN_ZOOM_SCALE,
    MAP_TEXTURE_MAX_ZOOM_SCALE
  );
}

function secondaryTextureDisplaySize(texture, zoom = map.getZoom()) {
  return Math.max(
    1,
    clamp(texture.secondaryScale || texture.scale || 1, 0.35, MAP_TEXTURE_MAX_SCALE) * MAP_TEXTURE_BASE_PX * mapTextureZoomScale(zoom)
  );
}

function textureBackgroundSizeList(texture, zoom = map.getZoom()) {
  const primarySize = mapTexturePixelSize(texture, zoom);
  const primaryTile = textureTileSize(texture.type, primarySize);
  if (!texture.secondaryEnabled || texture.secondaryType === "none") {
    return `${primaryTile.width}px ${primaryTile.height}px`;
  }
  const secondarySize = secondaryTextureDisplaySize(texture, zoom);
  const secondaryTile = textureTileSize(texture.secondaryType, secondarySize);
  return `${primaryTile.width}px ${primaryTile.height}px, ${secondaryTile.width}px ${secondaryTile.height}px`;
}

function currentTextureRepeatScore(texture = activeStyleKey ? styleTexture(activeStyleKey) : DEFAULT_LAYER_TEXTURE) {
  if (!texture || texture.type === "none" || !texture.secondaryEnabled || texture.secondaryType === "none") {
    return { score: 0, width: 0, height: 0, capped: false, pending: false };
  }
  const primaryDimensions = textureDimensions(texture.type);
  const secondaryDimensions = textureDimensions(texture.secondaryType);
  const pending = !primaryDimensions.known || !secondaryDimensions.known;
  const primaryTile = textureTileSize(texture.type, mapTexturePixelSize(texture));
  const secondaryTile = textureTileSize(texture.secondaryType, secondaryTextureDisplaySize(texture));
  const width = lcm(primaryTile.width, secondaryTile.width);
  const height = lcm(primaryTile.height, secondaryTile.height);
  const rawScore = Math.max(width, height);
  return {
    score: Math.min(MAX_BAKED_TEXTURE_TILE_PX, rawScore),
    width,
    height,
    capped: rawScore > MAX_BAKED_TEXTURE_TILE_PX,
    pending
  };
}

function textureCompatibilityColor(score) {
  const black = [17, 24, 39];
  const orange = [198, 116, 47];
  const red = [185, 72, 65];
  if (score <= 500) return `rgb(${black.join(" ")})`;
  if (score <= 1200) return `rgb(${mixRgb(black, orange, (score - 500) / 700).join(" ")})`;
  return `rgb(${mixRgb(orange, red, (score - 1200) / 800).join(" ")})`;
}

function updateTextureCompatibilityScore({ force = false } = {}) {
  if (!els.textureCompatibilityScore) return;
  const texture = activeStyleKey ? styleTexture(activeStyleKey) : null;
  if (mapLibreBasemapEnabled() && MAPLIBRE_TEXTURE_KEYS.includes(activeStyleKey)) {
    els.textureCompatibilityScore.textContent = `${MAPLIBRE_TEXTURE_IMAGE_SIZE}px`;
    els.textureCompatibilityScore.dataset.pairKey = mapLibreTextureImageSignature(activeStyleKey);
    els.textureCompatibilityScore.title = "GPU pattern size after combining the active textures.";
    els.textureCompatibilityScore.style.setProperty("--texture-compatibility-color", "#111827");
    if (els.updateTextureCompatibility) els.updateTextureCompatibility.hidden = true;
    return;
  }
  const result = currentTextureRepeatScore(texture);
  const pairKey = texture
    ? `${texture.type}|${texture.scale}|${texture.secondaryType}|${texture.secondaryScale}|${texture.secondaryEnabled}`
    : "";
  const stale = els.textureCompatibilityScore.dataset.pairKey && els.textureCompatibilityScore.dataset.pairKey !== pairKey;
  if (result.pending && !force) {
    if (texture?.type && texture.type !== "none") {
      loadTextureDimensions(texture.type).then(() => updateTextureCompatibilityScore({ force: true }));
    }
    if (texture?.secondaryType && texture.secondaryType !== "none") {
      loadTextureDimensions(texture.secondaryType).then(() => updateTextureCompatibilityScore({ force: true }));
    }
    els.textureCompatibilityScore.textContent = stale ? "stale" : "loading";
    els.textureCompatibilityScore.style.setProperty("--texture-compatibility-color", "#111827");
    if (els.updateTextureCompatibility) {
      els.updateTextureCompatibility.hidden = !stale;
    }
    return;
  }
  const suffix = result.capped ? "+" : "";
  els.textureCompatibilityScore.textContent = result.score ? `${Math.round(result.score)}${suffix}px` : "--";
  els.textureCompatibilityScore.dataset.pairKey = pairKey;
  els.textureCompatibilityScore.title = result.score ? `Repeat tile: ${result.width}px x ${result.height}px` : "";
  els.textureCompatibilityScore.style.setProperty("--texture-compatibility-color", textureCompatibilityColor(result.score));
  if (els.updateTextureCompatibility) {
    els.updateTextureCompatibility.hidden = true;
  }
}

function bakeCompositeMode(blend) {
  if (["normal", "multiply", "screen", "overlay", "soft-light", "darken", "lighten"].includes(blend)) {
    return blend === "normal" ? "source-over" : blend;
  }
  if (blend === "soft-light") return "soft-light";
  return "source-over";
}

function drawRepeatedTexture(context, image, tile, canvasWidth, canvasHeight, opacity = 1, blend = "normal") {
  if (!image || !tile.width || !tile.height || opacity <= 0) return;
  context.save();
  context.globalAlpha = clamp(opacity, 0, 1);
  context.globalCompositeOperation = bakeCompositeMode(blend);
  const offsetX = -tile.width + ((canvasWidth % tile.width) / 2);
  const offsetY = -tile.height + ((canvasHeight % tile.height) / 2);
  for (let y = offsetY; y < canvasHeight + tile.height; y += tile.height) {
    for (let x = offsetX; x < canvasWidth + tile.width; x += tile.width) {
      context.drawImage(image, x, y, tile.width, tile.height);
    }
  }
  context.restore();
}

function seamlessTextureGrid(tile, canvasWidth, canvasHeight) {
  const evenCellCount = (canvasSize, requestedSize) => {
    // One mirrored pair is one visible texture repeat. Keeping the canvas at
    // an integer number of pairs preserves the requested scale while making
    // the two outer edges identical. Cap tiny repeats to avoid thousands of
    // draw calls while a size slider is moving.
    const mirroredPairs = clamp(Math.round(canvasSize / Math.max(2, requestedSize)), 1, 32);
    return mirroredPairs * 2;
  };
  const columns = evenCellCount(canvasWidth, tile.width);
  const rows = evenCellCount(canvasHeight, tile.height);
  return {
    columns,
    rows,
    width: canvasWidth / columns,
    height: canvasHeight / rows
  };
}

function drawSeamlessRepeatedTexture(context, image, tile, canvasWidth, canvasHeight, opacity = 1, blend = "normal") {
  if (!image || !tile.width || !tile.height || opacity <= 0) return;
  const grid = seamlessTextureGrid(tile, canvasWidth, canvasHeight);
  context.save();
  context.globalAlpha = clamp(opacity, 0, 1);
  context.globalCompositeOperation = bakeCompositeMode(blend);
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const flipX = column % 2 === 1;
      const flipY = row % 2 === 1;
      const x = column * grid.width;
      const y = row * grid.height;
      context.save();
      context.translate(x + (flipX ? grid.width : 0), y + (flipY ? grid.height : 0));
      context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      context.drawImage(image, 0, 0, grid.width, grid.height);
      context.restore();
    }
  }
  context.restore();
}

async function exportCombinedTexturePng() {
  if (!activeStyleKey || !usesTextureSizeControl(activeStyleKey)) {
    els.status.textContent = "Choose Land, Water, or Texture before exporting a baked texture.";
    return;
  }
  const texture = styleTexture(activeStyleKey);
  if (texture.type === "none" && (!texture.secondaryEnabled || texture.secondaryType === "none")) {
    els.status.textContent = "Choose at least one texture before exporting a baked texture.";
    return;
  }
  const primaryImage = await loadTextureImage(texture.type);
  const secondaryImage = texture.secondaryEnabled && texture.secondaryType !== "none"
    ? await loadTextureImage(texture.secondaryType)
    : null;
  const primaryDisplaySize = mapTexturePixelSize(texture);
  const primaryTile = texture.type !== "none" ? textureTileSize(texture.type, primaryDisplaySize) : { width: 1, height: 1 };
  const secondaryDisplaySize = secondaryImage ? secondaryTextureDisplaySize(texture) : primaryDisplaySize;
  const secondaryTile = secondaryImage ? textureTileSize(texture.secondaryType, secondaryDisplaySize) : primaryTile;
  const repeatSize = cappedRepeatSize(lcm(primaryTile.width, secondaryTile.width), lcm(primaryTile.height, secondaryTile.height), MAX_RENDER_TEXTURE_TILE_PX);
  const width = repeatSize.width;
  const height = repeatSize.height;
  const wasCapped = width >= MAX_RENDER_TEXTURE_TILE_PX || height >= MAX_RENDER_TEXTURE_TILE_PX;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  drawRepeatedTexture(context, primaryImage, primaryTile, width, height, texture.opacity * texture.blendAmount, texture.blend);
  drawRepeatedTexture(context, secondaryImage, secondaryTile, width, height, texture.secondaryOpacity, texture.secondaryBlend);
  canvas.toBlob(blob => {
    if (!blob) {
      els.status.textContent = "Could not export the baked texture PNG.";
      return;
    }
    const filename = `${safeDownloadName(`${layerStyles[activeStyleKey].label} combined texture`)}.png`;
    downloadBlob(filename, blob);
    els.status.textContent = wasCapped
      ? `Exported ${width} x ${height} combined texture PNG, capped at ${MAX_RENDER_TEXTURE_TILE_PX}px and centered.`
      : `Exported ${width} x ${height} combined texture PNG.`;
  }, "image/png");
}



function styleTexture(key) {
  const style = layerStyles[key];
  style.texture = layerTexture(style.texture);
  return style.texture;
}



function applyTextureOverlays(theme = activeThemeFromLayerStyles()) {
  if (!theme) return;
  document.documentElement.style.setProperty("--route-theme-land-a", hexToRgbTriplet(theme.land.color));
  document.documentElement.style.setProperty("--route-theme-water-a", hexToRgbTriplet(theme.water.color));
  refreshLayerTextureOverlays();
}



function usesTextureSizeControl(key) {
  return key === "land" || key === "water" || key === "parks" || key === "buildings";
}

function refreshTextureControlHonesty(key = activeStyleKey) {
  if (!els.styleTextureMapLibreNote) return;
  const shouldShow = mapLibreBasemapEnabled() && usesTextureSizeControl(key);
  els.styleTextureMapLibreNote.hidden = !shouldShow;
}

function texturePatternId(key) {
  return `rv-${key}-texture-pattern`;
}

function textureScalesWithMap() {
  return Boolean(els.textureScaleWithMap?.checked);
}

function mapTexturePixelSize(texture, zoom = map.getZoom()) {
  return Math.max(1, clamp(texture.scale || 1, 0.35, MAP_TEXTURE_MAX_SCALE) * MAP_TEXTURE_BASE_PX * mapTextureZoomScale(zoom));
}

function textureAlpha(key) {
  const texture = styleTexture(key);
  return !texture.enabled || texture.type === "none" ? 0 : clamp(texture.opacity * texture.blendAmount, 0, 1);
}

function secondaryTextureAlpha(key) {
  const texture = styleTexture(key);
  return texture.enabled && texture.secondaryEnabled && texture.secondaryType !== "none" ? clamp(texture.secondaryOpacity, 0, 1) : 0;
}

function contrastTextureColor(color, texture) {
  const normalized = normalizeHex(color) || "#000000";
  const rgb = [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16)
  ];
  const lightness = (Math.max(...rgb) + Math.min(...rgb)) / 510;
  if (texture.blend === "screen") return "rgba(255,255,255,1)";
  if (texture.blend === "multiply" || texture.blend === "darken") return lightness > 0.48 ? "rgba(31,41,51,1)" : "rgba(255,255,255,1)";
  return lightness > 0.55 ? "rgba(31,41,51,1)" : "rgba(255,255,255,1)";
}

function ensureEmbeddedTextureUrl(type) {
  const texture = LAYER_TEXTURE_BY_ID[type];
  const url = textureAssetUrl(texture);
  if (!url || embeddedTextureUrls.has(type) || embeddedTexturePromises.has(type)) return;
  const promise = fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`Texture failed to load: ${url}`);
      return response.blob();
    })
    .then(blobToDataUrl)
    .then(dataUrl => {
      embeddedTextureUrls.set(type, dataUrl);
      refreshStyledLayers();
    })
    .catch(() => {
      // Direct same-origin URLs remain available for CSS and SVG fallback.
    })
    .finally(() => {
      embeddedTexturePromises.delete(type);
    });
  embeddedTexturePromises.set(type, promise);
}

function cappedRepeatSize(width, height, cap = MAX_RENDER_TEXTURE_TILE_PX) {
  return {
    width: Math.max(1, Math.min(cap, Math.round(width || 1))),
    height: Math.max(1, Math.min(cap, Math.round(height || 1)))
  };
}

function appendSvgTextureImage(pattern, type, alpha, blend = "multiply", size = 160, repeatSize = null) {
  const texture = LAYER_TEXTURE_BY_ID[type];
  const url = textureAssetUrl(texture);
  if (!url || !alpha) return;
  ensureEmbeddedTextureUrl(type);
  const renderUrl = embeddedTextureUrls.get(type) || url;
  const mode = TEXTURE_BLEND_MODES.some(([value]) => value === blend) ? blend : "multiply";
  const tileSize = typeof size === "number" ? textureTileSize(type, size) : size;
  const bounds = repeatSize || tileSize;
  const offsetX = -tileSize.width + ((bounds.width % tileSize.width) / 2);
  const offsetY = -tileSize.height + ((bounds.height % tileSize.height) / 2);
  for (let y = offsetY; y < bounds.height + tileSize.height; y += tileSize.height) {
    for (let x = offsetX; x < bounds.width + tileSize.width; x += tileSize.width) {
      const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
      image.setAttribute("href", renderUrl);
      image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", renderUrl);
      image.setAttribute("x", String(x));
      image.setAttribute("y", String(y));
      image.setAttribute("width", String(tileSize.width));
      image.setAttribute("height", String(tileSize.height));
      image.setAttribute("opacity", String(alpha));
      image.setAttribute("preserveAspectRatio", "none");
      image.style.mixBlendMode = mode;
      pattern.append(image);
    }
  }
}

function ensureSvgTexturePattern(renderer, key) {
  const container = renderer?._container;
  if (!container) return null;
  const texture = styleTexture(key);
  const alpha = textureAlpha(key);
  const secondaryAlpha = secondaryTextureAlpha(key);
  if (!alpha && !secondaryAlpha) return null;
  const svg = container.ownerSVGElement || container;
  const namespace = "http://www.w3.org/2000/svg";
  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS(namespace, "defs");
    svg.prepend(defs);
  }
  let pattern = defs.querySelector(`#${texturePatternId(key)}`);
  if (!pattern) {
    pattern = document.createElementNS(namespace, "pattern");
    pattern.id = texturePatternId(key);
    defs.append(pattern);
  }
  const baseColor = styleColor(key);
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  const patternSize = mapTexturePixelSize(texture);
  const primaryTile = textureTileSize(texture.type, patternSize);
  const secondarySize = secondaryTextureDisplaySize(texture);
  const secondaryTile = texture.secondaryEnabled && texture.secondaryType !== "none"
    ? textureTileSize(texture.secondaryType, secondarySize)
    : primaryTile;
  const repeatSize = cappedRepeatSize(lcm(primaryTile.width, secondaryTile.width), lcm(primaryTile.height, secondaryTile.height));
  const tileWidth = repeatSize.width;
  const tileHeight = repeatSize.height;
  pattern.setAttribute("width", String(tileWidth));
  pattern.setAttribute("height", String(tileHeight));
  pattern.dataset.baseTextureSize = String(patternSize);
  pattern.replaceChildren();
  const background = document.createElementNS(namespace, "rect");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", baseColor);
  pattern.append(background);
  appendSvgTextureImage(pattern, texture.type, alpha, texture.blend, primaryTile, repeatSize);
  appendSvgTextureImage(pattern, texture.secondaryType, secondaryAlpha, texture.secondaryBlend, secondaryTile, repeatSize);
  return `url(#${texturePatternId(key)})`;
}

function layerFill(key) {
  if (texturesSuppressed()) return styleColor(key);
  const renderer = key === "land" ? landRenderer : key === "water" ? oceanRenderer : null;
  return ensureSvgTexturePattern(renderer, key) || styleColor(key);
}

function waterBodyFill() {
  if (texturesSuppressed()) return styleColor("water");
  return ensureSvgTexturePattern(waterBodyRenderer, "water") || styleColor("water");
}

function texturesSuppressed() {
  return Boolean(els.mapCanvas?.classList.contains("is-camera-moving"));
}

function texturedLineOptions(key, baseOpacity = 1) {
  if (texturesSuppressed()) {
    return {
      opacity: clamp(baseOpacity, 0, 1),
      dashArray: null,
      lineCap: "round"
    };
  }
  const texture = styleTexture(key);
  const dashArray = LINE_TEXTURE_DASHES[texture.type] || null;
  const textureOpacity = texture.type === "none" ? 0 : texture.opacity;
  return {
    opacity: clamp(baseOpacity, 0, 1),
    dashArray: dashArray && textureOpacity > 0 ? dashArray : null,
    lineCap: texture.type === "dots" ? "round" : "round"
  };
}

function texturedStrokePaint(key, renderer) {
  if (texturesSuppressed()) return styleColor(key);
  return ensureSvgTexturePattern(renderer, key) || styleColor(key);
}

function mapLibreTextureEnabled(key) {
  const texture = styleTexture(key);
  const layerVisible = key === "land"
    ? els.toggleLand.checked
    : key === "water"
      ? els.toggleWater.checked
      : key === "parks"
        ? els.toggleParks.checked
        : els.toggleBuildings.checked;
  const hasPrimary = texture.enabled && texture.type !== "none" && textureAlpha(key) > 0;
  const hasSecondary = texture.enabled && texture.secondaryEnabled && texture.secondaryType !== "none" && secondaryTextureAlpha(key) > 0;
  return Boolean(els.toggleTexture.checked && layerVisible && (hasPrimary || hasSecondary));
}

function mapLibreTextureImageSignature(key) {
  const texture = styleTexture(key);
  const zoomKey = textureScalesWithMap() ? Math.round(map.getZoom() * 2) / 2 : "fixed";
  return JSON.stringify({
    renderVersion: MAPLIBRE_TEXTURE_RENDER_VERSION,
    key,
    color: styleColor(key),
    opacity: styleOpacity(key),
    zoomKey,
    texture
  });
}

async function buildMapLibreTextureImage(key) {
  if (!mapLibreTextureEnabled(key)) return null;
  const texture = styleTexture(key);
  const [primaryImage, secondaryImage] = await Promise.all([
    texture.type !== "none" ? loadTextureImage(texture.type).catch(() => null) : null,
    texture.secondaryEnabled && texture.secondaryType !== "none"
      ? loadTextureImage(texture.secondaryType).catch(() => null)
      : null
  ]);
  if (!primaryImage && !secondaryImage) return null;
  const canvas = document.createElement("canvas");
  canvas.width = MAPLIBRE_TEXTURE_IMAGE_SIZE;
  canvas.height = MAPLIBRE_TEXTURE_IMAGE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = styleColor(key);
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (primaryImage) {
    drawSeamlessRepeatedTexture(
      context,
      primaryImage,
      textureTileSize(texture.type, mapTexturePixelSize(texture)),
      canvas.width,
      canvas.height,
      textureAlpha(key),
      texture.blend
    );
  }
  if (secondaryImage) {
    drawSeamlessRepeatedTexture(
      context,
      secondaryImage,
      textureTileSize(texture.secondaryType, secondaryTextureDisplaySize(texture)),
      canvas.width,
      canvas.height,
      secondaryTextureAlpha(key),
      texture.secondaryBlend
    );
  }
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function ensureMapLibreTextureImage(key) {
  const imageId = `${MAPLIBRE_TEXTURE_LAYER_PREFIX}image-${key}`;
  const signature = mapLibreTextureImageSignature(key);
  if (mapLibreTextureImageSignatures.get(key) === signature && mapLibreMap?.hasImage?.(imageId)) {
    return imageId;
  }
  const image = await buildMapLibreTextureImage(key);
  if (!image || !mapLibreMap?.getStyle?.()) return null;
  if (mapLibreMap.hasImage(imageId)) mapLibreMap.updateImage(imageId, image);
  else mapLibreMap.addImage(imageId, image, { pixelRatio: 1 });
  mapLibreTextureImageSignatures.set(key, signature);
  return imageId;
}

function removeMapLibreTextureLayers() {
  const discoveredLayerIds = (mapLibreMap?.getStyle?.()?.layers || [])
    .map(layer => layer.id)
    .filter(layerId => String(layerId).startsWith(MAPLIBRE_TEXTURE_LAYER_PREFIX));
  new Set([...mapLibreTextureLayerIds, ...discoveredLayerIds]).forEach(layerId => {
    if (mapLibreMap?.getLayer?.(layerId)) mapLibreMap.removeLayer(layerId);
  });
  mapLibreTextureLayerIds.clear();
}

function mapLibreTextureStyleSignature(style, activeKeys) {
  const layers = (style?.layers || [])
    .filter(layer => !isMapLibreSurfaceEffectLayer(layer))
    .map(layer => [layer.id, layer.type, layer.source, layer["source-layer"], layer.layout?.visibility]);
  return JSON.stringify({
    layers,
    activeKeys,
    images: activeKeys.map(key => mapLibreTextureImageSignature(key))
  });
}

async function refreshMapLibreTextureLayers() {
  if (!mapLibreBasemapEnabled() || !mapLibreMap?.getStyle?.()) return;
  // Texture images are assembled asynchronously. If controls change while an
  // older pass is still running, keep the newest request queued instead of
  // silently losing it.
  if (applyingMapLibreTextureLayers) {
    scheduleMapLibreTextureRefresh(120);
    return;
  }
  const buildId = ++mapLibreTextureBuildId;
  const style = mapLibreMap.getStyle();
  const activeKeys = MAPLIBRE_TEXTURE_KEYS.filter(mapLibreTextureEnabled);
  const signature = mapLibreTextureStyleSignature(style, activeKeys);
  const layersPresent = mapLibreTextureLayerIds.size > 0 && [...mapLibreTextureLayerIds].every(id => mapLibreMap.getLayer(id));
  if (signature === mapLibreTextureRenderSignature && (layersPresent || !activeKeys.length)) return;
  applyingMapLibreTextureLayers = true;
  try {
    const patternEntries = await Promise.all(activeKeys.map(async key => [key, await ensureMapLibreTextureImage(key)]));
    if (buildId !== mapLibreTextureBuildId || !mapLibreMap?.getStyle?.()) return;
    const patterns = Object.fromEntries(patternEntries.filter(([, imageId]) => imageId));
    removeMapLibreTextureLayers();
    if (mapLibreMap.getSource(MAPLIBRE_LAND_TEXTURE_SOURCE_ID)) {
      mapLibreMap.removeSource(MAPLIBRE_LAND_TEXTURE_SOURCE_ID);
    }
    const baseLayers = (mapLibreMap.getStyle().layers || [])
      .filter(layer => !String(layer.id || "").startsWith(MAPLIBRE_TEXTURE_LAYER_PREFIX));

    if (patterns.land) {
      // The vector basemap already supplies precise water polygons at every
      // zoom. A background pattern beneath those polygons gives land a stable
      // texture without downloading and overscaling a coarse world land mask.
      const firstNonLandFill = baseLayers.find(layer => {
        if (layer.type !== "fill") return false;
        const groups = semanticGroupsForMapLibreLayer(layer);
        return groups.some(group => group === "water" || group === "parks" || group === "buildings");
      })?.id;
      const firstLineOrSymbol = baseLayers.find(layer => layer.type === "line" || layer.type === "symbol")?.id;
      const landTextureBefore = firstNonLandFill || firstLineOrSymbol;
      const layerId = `${MAPLIBRE_TEXTURE_LAYER_PREFIX}land-surface`;
      mapLibreMap.addLayer({
        id: layerId,
        type: "background",
        paint: {
          "background-pattern": patterns.land,
          "background-opacity": styleOpacity("land")
        }
      }, landTextureBefore);
      mapLibreTextureLayerIds.add(layerId);
    }

    baseLayers.forEach((layer, index) => {
      if (layer.type !== "fill" || !layer.source) return;
      const key = MAPLIBRE_TEXTURE_KEYS.find(candidate => semanticGroupsForMapLibreLayer(layer).includes(candidate));
      // Land uses the dedicated background pattern above. Repeating the same
      // pattern over every land-use fill would stack opaque patterns and make
      // the texture look like a full-screen overlay.
      if (!key || key === "land" || !patterns[key]) return;
      const layerId = `${MAPLIBRE_TEXTURE_LAYER_PREFIX}${key}-${index}`;
      const nextLayerId = baseLayers[index + 1]?.id;
      const textureLayer = {
        id: layerId,
        type: "fill",
        source: layer.source,
        layout: { visibility: layer.layout?.visibility || "visible" },
        paint: {
          "fill-pattern": patterns[key],
          "fill-opacity": styleOpacity(key)
        }
      };
      if (layer["source-layer"]) textureLayer["source-layer"] = layer["source-layer"];
      if (layer.filter) textureLayer.filter = structuredClone(layer.filter);
      if (Number.isFinite(layer.minzoom)) textureLayer.minzoom = layer.minzoom;
      if (Number.isFinite(layer.maxzoom)) textureLayer.maxzoom = layer.maxzoom;
      mapLibreMap.addLayer(textureLayer, nextLayerId);
      mapLibreTextureLayerIds.add(layerId);
    });
    reorderMapLibreSurfaceLayers();
    mapLibreTextureRenderSignature = signature;
  } catch (error) {
    console.warn("Map textures could not be applied to semantic regions.", error);
  } finally {
    applyingMapLibreTextureLayers = false;
  }
}

function scheduleMapLibreTextureRefresh(delay = 80) {
  if (!mapLibreBasemapEnabled()) {
    window.clearTimeout(mapLibreTextureRefreshTimer);
    mapLibreTextureRefreshTimer = 0;
    return;
  }
  // Style/tile events can arrive continuously while the map is loading. Do
  // not restart the debounce clock for every event or textures may starve
  // indefinitely. The pending pass always reads the latest control values.
  if (mapLibreTextureRefreshTimer) return;
  mapLibreTextureRefreshTimer = window.setTimeout(() => {
    mapLibreTextureRefreshTimer = 0;
    void refreshMapLibreTextureLayers();
  }, delay);
}

function refreshLayerTextureOverlays(zoom = map.getZoom()) {
  // Provider styling only suppresses the old full-frame DOM textures. The
  // MapLibre renderer can still apply textures to clipped semantic regions.
  if (mapThemeMode === "provider" && !mapLibreBasemapEnabled()) {
    Object.values(layerTextureOverlays).forEach(overlay => { overlay.style.opacity = "0"; });
    return;
  }
  if (mapLibreBasemapEnabled()) scheduleMapLibreTextureRefresh();
  Object.entries(layerTextureOverlays).forEach(([key, overlay]) => {
    // MapLibre textures are clipped semantic pattern layers. Never leave the
    // legacy DOM overlay visible above them, including the old global texture.
    if (mapLibreBasemapEnabled()) {
      overlay.style.opacity = "0";
      return;
    }
    const isBaseColorLayer = key === "land" || key === "water";
    if (isBaseColorLayer && !mapLibreBasemapEnabled()) {
      overlay.style.opacity = "0";
      return;
    }
    const texture = styleTexture(key);
    const visible = key === "land" ? els.toggleLand.checked : key === "water" ? els.toggleWater.checked : els.toggleTexture.checked;
    const primaryOpacity = !texture.enabled || texture.type === "none" ? 0 : texture.opacity * texture.blendAmount;
    const secondaryOpacity = texture.enabled && texture.secondaryEnabled && texture.secondaryType !== "none" ? texture.secondaryOpacity : 0;
    const opacity = visible ? Math.max(primaryOpacity, secondaryOpacity) * styleOpacity(key) : 0;
    const secondary = texture.secondaryEnabled && texture.secondaryType !== "none" ? LAYER_TEXTURE_BACKGROUNDS[texture.secondaryType] : null;
    const overlayBlend = primaryOpacity > 0
      ? texture.blend
      : texture.secondaryEnabled && secondaryOpacity > 0
        ? texture.secondaryBlend
        : "normal";
    overlay.style.opacity = String(clamp(opacity, 0, 1));
    overlay.style.mixBlendMode = isTextureBlendMode(overlayBlend) ? overlayBlend : "multiply";
    overlay.style.backgroundImage = [LAYER_TEXTURE_BACKGROUNDS[texture.type] || "none", secondary].filter(Boolean).join(", ");
    overlay.style.backgroundSize = textureBackgroundSizeList(texture, zoom);
    overlay.style.backgroundRepeat = "repeat";
    overlay.style.backgroundPosition = secondary ? "center center, center center" : "center center";
  });
}
