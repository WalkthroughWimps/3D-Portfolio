const isStudioEditor = document.body.dataset.mode === 'admin';
const orderPreviewCakeZoom = .62;
if (document.body.dataset.mode === 'preview') document.querySelector('.frosting-band-two')?.remove();
function readEditorStorage(key, fallback) {
  if (!isStudioEditor) return fallback;
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
const editor = document.querySelector('.editor');
const hub = document.querySelector('.editor-bauble');
const options = document.querySelector('.editor-options');
const panel = document.querySelector('.editor-panel');
const desktopEditor = document.querySelector('#desktop-editor');
const desktopContent = document.querySelector('#desktop-editor-content');
const modeToggle = document.querySelector('#editor-mode-toggle');
const editorModeStorageKey = 'atelier-cake-editor-mode';
const desktopEligible = () => matchMedia('(min-width: 960px) and (hover: hover) and (pointer: fine)').matches;
let editorMode = desktopEligible() && isStudioEditor ? (localStorage.getItem(editorModeStorageKey) || 'desktop') : 'phone';
let activeDesktopTab = 'site';
let activePhoneAction = null;
let lastEditorControl = null;
const transactionCategories = new Set();
let transactionReset = false;
const featuredImage = document.querySelector('.featured-cake img');
const storedState = readEditorStorage('atelier-cake-appearance', document.body.dataset.mode === 'preview' ? { colors: { cakeZoom: orderPreviewCakeZoom } } : {});
const textToolbar = document.querySelector('#text-toolbar');
const copyEdits = readEditorStorage('cake-copy-edits', {});
const orderOverlay = document.querySelector('#order-overlay');
const orderOpener = document.querySelector('[data-open-order]');
const managedRootProperties = [
  '--cake-tint', '--cake-texture', '--cake-texture-size', '--cake-texture-repeat', '--cake-texture-position', '--cake-texture-attachment', '--cake-texture-blend',
  '--cake-nav-ink', '--cake-nav-surface', '--eyebrow-color', '--crust-color', '--icing', '--ink', '--accent', '--display-font',
  '--icing-blur', '--layer-tilt', '--pore-opacity', '--cake-contact-blend', '--cake-feather', '--cake-fill-depth',
  '--cake-drift', '--cake-frequency', '--cake-hold', '--cake-ridge', '--cake-valley', '--copy-color', '--title-color'
];
const presetRootProperties = new Set(['--cake-tint', '--cake-texture', '--cake-texture-size', '--cake-texture-repeat', '--cake-texture-position', '--cake-texture-attachment', '--cake-texture-blend', '--cake-nav-ink', '--cake-nav-surface']);
const baselineRootProperties = new Map(managedRootProperties.map((name) => [name, document.documentElement.style.getPropertyValue(name)]));
const managedInlineStyles = new Map([
  [document.querySelector('#site-name'), ['font-size', 'font-weight', 'letter-spacing']],
  [document.querySelector('#site-intro'), ['font-size']],
  [featuredImage, ['border-radius', 'object-position', 'filter']]
].filter(([node]) => node).map(([node, properties]) => [node, new Map(properties.map((name) => [name, node.style.getPropertyValue(name)]))]));
const initialFeaturedImageSrc = featuredImage?.getAttribute('src');

const menu = {
  root: [['colors', '◒', 'Cake'], ['fonts', 'Aa', 'Text & layout'], ['layers', '▧', 'Icing'], ['cakeBlur', '◌', 'Cut texture'], ['history', '↶', 'History']]
};

const cakeColorPalettes = Object.freeze({
  redVelvet: { defaultTone: 'brick', tones: [{ id: 'brick', label: 'Brick red', hex: '#8b0f22' }, { id: 'burgundy', label: 'Burgundy', hex: '#65182b' }, { id: 'berry', label: 'Berry red', hex: '#a62d3e' }, { id: 'rose', label: 'Rose red', hex: '#b84a52' }] },
  vanilla: { defaultTone: 'vanilla', tones: [{ id: 'vanilla', label: 'Golden vanilla', hex: '#e7c17e' }, { id: 'cream', label: 'Cream', hex: '#efdbac' }, { id: 'butter', label: 'Butter', hex: '#dbb46c' }, { id: 'toasted', label: 'Toasted vanilla', hex: '#bd8645' }] },
  lemon: { defaultTone: 'lemon', tones: [{ id: 'lemon', label: 'Lemon', hex: '#ebbd53' }, { id: 'butter', label: 'Butter yellow', hex: '#f0d877' }, { id: 'gold', label: 'Golden zest', hex: '#d79b22' }, { id: 'citron', label: 'Pale citron', hex: '#f5e39e' }] },
  white: { defaultTone: 'ivory', tones: [{ id: 'ivory', label: 'Ivory', hex: '#e2dfd3' }, { id: 'cream', label: 'Cream', hex: '#efe7d5' }, { id: 'champagne', label: 'Champagne', hex: '#d6c29b' }, { id: 'toasted', label: 'Toasted cream', hex: '#c8ad7a' }] },
  chocolate: { defaultTone: 'cocoa', tones: [{ id: 'cocoa', label: 'Cocoa', hex: '#4e200f' }, { id: 'milk', label: 'Milk chocolate', hex: '#7c4b30' }, { id: 'mocha', label: 'Mocha', hex: '#62423c' }, { id: 'dark', label: 'Dark chocolate', hex: '#32130d' }] },
  carrot: { defaultTone: 'carrot', tones: [{ id: 'carrot', label: 'Carrot', hex: '#b7621b' }, { id: 'spiced', label: 'Spiced orange', hex: '#d78334' }, { id: 'amber', label: 'Golden amber', hex: '#d59829' }, { id: 'toasted', label: 'Toasted carrot', hex: '#924a20' }] },
  pistachio: { defaultTone: 'pistachio', tones: [{ id: 'pistachio', label: 'Pistachio', hex: '#beb060' }, { id: 'pale', label: 'Pale pistachio', hex: '#d8ca8b' }, { id: 'sage', label: 'Sage', hex: '#929257' }, { id: 'toasted', label: 'Toasted pistachio', hex: '#a27d42' }] }
});
Object.values(cakeColorPalettes).forEach(palette => { palette.tones.forEach(tone => Object.freeze(tone)); Object.freeze(palette.tones); Object.freeze(palette); });
const nonStyleColorKeys = new Set(['cakePreset', 'cakeZoom', 'cakeFoodTone', 'cakeFoodShade']);
const decorationDefaults = Object.freeze({ topperA: 'strawberry', topperB: 'rosette', topperAScale: 1, topperBScale: 1, topperPattern: 'cluster', candyColors: Object.freeze(['red', 'blue', 'yellow']), fillingFrequency: 1 });
const decorationMaterials = Object.freeze([
  ['none', 'None'], ['strawberry', 'Strawberry'], ['rosette', 'Rosette'], ['pipedDollop', 'Piped dollop'],
  ['pipedRuffle', 'Piped ruffle'], ['fondantDisc', 'Fondant disc'], ['fondantRibbon', 'Fondant ribbon'],
  ...Object.entries(window.CakeToppingVisuals).filter(([,v])=>v.label).map(([id,v])=>[id,v.label]),
  ...window.CAKE_MATERIAL_CATALOG.materials.map(item => [item.id, item.label])
]);
const candyPalette = Object.freeze([
  ['white', 'White', '#fff'], ['black', 'Black', '#181818'], ['brown', 'Brown', '#70452d'], ['tan', 'Tan', '#c8a477'],
  ['red', 'Red', '#d52c36'], ['orange', 'Orange', '#f27e22'], ['yellow', 'Yellow', '#f0cd28'], ['green', 'Green', '#3e9a53'],
  ['blue', 'Blue', '#3977cb'], ['skyBlue', 'Sky blue', '#69c8e9'], ['purple', 'Purple', '#8750b5'], ['pink', 'Pink', '#e784a9']
]);
const clampDecorationScale = value => value === null || value === undefined || value === '' ? 1 : effectiveNumber(value, 1, .5, 2);
function resolveDecorations(source = {}) {
  const result = { ...decorationDefaults, ...source };
  const hasPair = source.topperA !== undefined && source.topperA !== null || source.topperB !== undefined && source.topperB !== null;
  const legacyPair = !hasPair && source.topper === 'strawberryRosette';
  if (!hasPair && source.topper !== undefined) {
    if (source.topper === 'strawberryRosette') { result.topperA = 'strawberry'; result.topperB = 'rosette'; }
    else { result.topperA = source.topper; result.topperB = 'none'; }
  }
  if ((source.topperAScale === undefined || source.topperAScale === null) && source.topperScale !== undefined) result.topperAScale = clampDecorationScale(source.topperScale);
  if (legacyPair && (source.topperBScale === undefined || source.topperBScale === null) && source.topperScale !== undefined) result.topperBScale = clampDecorationScale(source.topperScale);
  result.topperAScale = clampDecorationScale(result.topperAScale);
  result.topperBScale = clampDecorationScale(result.topperBScale);
  result.fillingFrequency = result.fillingFrequency === null || result.fillingFrequency === undefined || result.fillingFrequency === ''
    ? 1 : effectiveNumber(result.fillingFrequency, 1, 0, 2);
  result.topperPattern = result.topperPattern === 'line' ? 'line' : 'cluster';
  result.candyColors = Array.isArray(result.candyColors) ? result.candyColors.filter(id => candyPalette.some(([key]) => key === id)) : [...decorationDefaults.candyColors];
  return result;
}
window.CakeDecorationSettings = { defaults: decorationDefaults, resolve: resolveDecorations, materials: decorationMaterials.map(([id,label]) => ({id,label})), candyColors: candyPalette.map(([id,label,hex]) => ({id,label,hex})) };

// The group schema drives mobile panels and remains the shared source for later desktop controls.
const panelSchema = {
  categories: {
    colors: { title: 'Cake', groups: ['cakeAppearance', 'topperChoices', 'topperArrangement', 'fillings', 'orderingMenu'] },
    fonts: { title: 'Text & layout', groups: ['textStyle', 'textColors'] },
    layers: { title: 'Icing', groups: ['icingAppearance'] },
    cakeBlur: { title: 'Cut texture', groups: ['cutContact', 'advancedEdges'] }
  },
  groups: {
    orderingMenu: { title: 'Ordering menu', description: 'Add or edit the cake flavors, icings, fillings, toppers, and sizes customers can order.', fields: ['orderingMenu'] },
    cakeAppearance: { title: 'Cake appearance', description: 'Choose a cake type, adjust crumb scale, and pick a food-inspired shade.', fields: ['cakePreset', 'cakeZoom', 'cakeFoodTone', 'cakeFoodShade'] },
    topperChoices: { title: 'Toppers', description: 'Choose up to two materials and set each size.', fields: ['topperA', 'topperAScale', 'topperB', 'topperBScale'] },
    topperArrangement: { title: 'Arrangement and colors', description: 'Choose how toppers sit on the cake and which candy colors appear.', fields: ['topperPattern', 'candyColors'] },
    fillings: { title: 'Fillings', description: 'Choose the material, size, and density of pieces between the layers.', fields: ['fillingMaterial', 'fillingScale', 'fillingFrequency'] },
    textStyle: { title: 'Text style', description: 'Set the title and body type, size, weight, and spacing.', fields: ['fontFamily', 'displaySize', 'bodySize', 'weight', 'spacing'] },
    textColors: { title: 'Text colors', description: 'Adjust the body copy and title colors.', fields: ['ink', 'accent'] },
    icingAppearance: { title: 'Icing appearance', description: 'Choose icing color and tune highlight contrast and layer slope.', fields: ['icing', 'icingSoftness', 'icingTilt'] },
    cutContact: { title: 'Contact', description: 'Set the overall contact strength, cavity filling, and downward crumb drag.', fields: ['blend', 'fill', 'valley'] },
    advancedEdges: { title: 'Advanced edge detail', description: 'Fine tune cavity rims, pore sensitivity, and how far icing and crumb details reach.', fields: ['feather', 'pores', 'lineFrequency', 'lineHold', 'lineDrift', 'ridge'] }
  },
  fieldHelp: {
    cakePreset: 'Selects the cake material and its starting crumb color.',
    cakeZoom: 'Changes how large the crumb pattern appears; it does not move or resize the cake layout.',
    cakeFoodTone: 'Choose a natural cake shade. A saved custom color stays until you choose a food shade.',
    cakeFoodShade: 'Move toward a lighter or deeper shade of the selected cake color.',
    topperA: 'Choose the first decoration material.',
    topperB: 'Choose a second decoration material, or none.',
    fillingMaterial: 'Choose a material for the exposed cake between icing layers.',
    topperAScale: 'Scale the first decoration independently. 100% is its original size.',
    topperBScale: 'Scale the second decoration independently. 100% is its original size.',
    topperPattern: 'Arrange the selected decorations in a cluster or line.',
    candyColors: 'Choose the candy colors in the order they should appear. Select a color again to remove it.',
    fillingFrequency: 'Set how densely filling pieces appear across the exposed cake. Zero removes them.',
    fillingScale: 'Scale filling pieces independently. 100% is their original size.',
    pores: 'Controls how strongly identified nearby cavities receive icing.',
    icingSoftness: 'Adjusts the interior icing highlight contrast; it does not blur the contact edge.',
    icingTilt: 'Changes the slope shared by the frosting bands.',
    blend: 'Sets the strength of cavity coverage, boundary deformation, and copied crumb.',
    fill: 'Controls how much icing enters identified cavities; zero leaves pocket filling off.',
    feather: 'Softens cavity-rim coverage without blurring outside the source feature.',
    lineDrift: 'Adds a small sideways shift to the downward crumb tail.',
    lineFrequency: 'Sets the available amount of contact detail and downward crumb reach.',
    lineHold: 'Sets how far nearby cavities can be reached from the icing edge.',
    ridge: 'Sets how far the lower icing edge can descend into a nearby cavity.',
    valley: 'Sets how far real cake walls can drag down into the upper icing edge.'
  }
};

let moved = false;
let dragTarget = hub;
let startX = 0;
let startY = 0;
let activeText = null;
let pressTimer = null;
let pendingTextPress = null;
let panelSnapshot = null;
let panelTrigger = null;
let changeHistory = [];
let redoHistory = [];
let activeCakeRenderKey = null;
let activeCakeTintURL = null;
let cakeRenderRequestId = 0;

const clone = (value) => JSON.parse(JSON.stringify(value));
const stateSnapshot = () => clone(storedState);
const effectiveNumber = (raw, fallback, min, max) => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};
const colorHex = (color) => {
  const hex = String(color).trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) return `#${(hex.length === 3 ? [...hex].map(channel => channel + channel).join('') : hex).toLowerCase()}`;
  const channels = String(color).match(/[\d.]+/g)?.slice(0, 3).map(Number);
  return channels?.length === 3 ? `#${channels.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}` : '#000000';
};
const cakePresetFor = (id) => window.CAKE_PRESET_BY_ID[id] || window.CAKE_PRESET_BY_ID.redVelvet;
const presetBackground = (path) => `url("${path}")`;
const rgbFromColor = (color) => {
  const hex = String(color).trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  const rgb = String(color).match(/rgba?\(([^)]+)\)/i)?.[1]?.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!hex) return rgb?.length === 3 ? rgb : null;
  const full = hex.length === 3 ? [...hex].map(channel => channel + channel).join('') : hex;
  return [0, 2, 4].map(offset => Number.parseInt(full.slice(offset, offset + 2), 16));
};
const colorLuma = (color) => {
  const rgb = rgbFromColor(color);
  return rgb ? rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 : 0;
};
function cakeFoodColorState(colors = storedState.colors || {}) {
  const preset = cakePresetFor(colors.cakePreset ?? 'redVelvet');
  const palette = cakeColorPalettes[preset.id] || cakeColorPalettes.redVelvet;
  const tint = colorHex(colors['--cake-tint'] ?? preset.tint).toLowerCase();
  const toneColor = (tone) => tone.id === palette.defaultTone ? colorHex(preset.tint) : tone.hex;
  const tone = palette.tones.find(item => item.id === colors.cakeFoodTone)
    || palette.tones.find(item => toneColor(item).toLowerCase() === tint)
    || null;
  return { preset, palette, tone, toneColor, legacy: !tone, shade: effectiveNumber(colors.cakeFoodShade ?? 0, 0, -25, 25), tint };
}
function shadeFoodColor(hex, shade) {
  const rgb = rgbFromColor(hex);
  if (!rgb) return hex;
  const amount = effectiveNumber(shade, 0, -25, 25) / 100;
  const result = rgb.map(channel => Math.round(amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount)));
  return `#${result.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}
function formatControlValue(action, raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return String(raw);
  if (['cakeZoom', 'topperScale', 'topperAScale', 'topperBScale', 'fillingScale'].includes(action)) return `${Math.round(value * 100)}%`;
  if (action === 'fillingFrequency') return value === 0 ? 'None' : `${Math.round(value * 100)}%`;
  if (action === 'cakeFoodShade') return value === 0 ? 'Base' : `${Math.abs(value)}% ${value > 0 ? 'lighter' : 'deeper'}`;
  return String(raw);
}
function refreshRangeAnnouncement(input) {
  if (input?.type === 'range') input.setAttribute('aria-valuetext', formatControlValue(input.dataset.control, input.value));
}
function refreshCakeFoodControls() {
  const toneInput = panel.querySelector('[data-control="cakeFoodTone"]');
  const shadeInput = panel.querySelector('[data-control="cakeFoodShade"]');
  if (!toneInput || !shadeInput) return;
  const food = cakeFoodColorState();
  toneInput.replaceChildren();
  if (food.legacy) toneInput.add(new Option('Saved custom shade', 'legacy'));
  food.palette.tones.forEach(tone => toneInput.add(new Option(tone.label, tone.id)));
  toneInput.value = food.legacy ? 'legacy' : food.tone.id;
  shadeInput.disabled = food.legacy;
  shadeInput.value = String(food.shade);
  refreshRangeAnnouncement(shadeInput);
  const shadeOutput = panel.querySelector('[data-for-control="cakeFoodShade"]');
  if (shadeOutput) shadeOutput.textContent = formatControlValue('cakeFoodShade', shadeInput.value);
  const toneHelp = toneInput.closest('.control-field')?.querySelector('.control-help');
  const swatch = toneInput.closest('.control-field')?.querySelector('.cake-shade-swatch');
  if (swatch) swatch.style.backgroundColor = food.tint;
  if (toneHelp) toneHelp.textContent = food.legacy
    ? 'Your saved custom cake shade is preserved. Choose a food-inspired shade to replace it.'
    : 'Choose a natural cake shade. A lighter or deeper adjustment keeps its food-inspired hue.';
}
function syncCakeRendering(colors) {
  const id = colors.cakePreset ?? 'redVelvet';
  const preset = cakePresetFor(id);
  const tint = colors['--cake-tint'] !== null && colors['--cake-tint'] !== undefined ? colors['--cake-tint'] : preset.tint;
  const normalizedTint = colorHex(tint);
  const custom = preset.customMethod === 'luminance-odds-tint-with-bounded-chroma' && normalizedTint.toLowerCase() !== preset.tint.toLowerCase();
  const renderKey = `${preset.id}|${normalizedTint.toLowerCase()}|${preset.texture}|${preset.customMethod}`;
  const textureScale = window.CakeTextureRenderer?.resolveScale(preset.id, colors.cakeZoom, innerWidth, innerHeight);
  const root = document.documentElement;
  root.style.setProperty('--cake-tint', tint);
  root.style.setProperty('--cake-texture', presetBackground(preset.texture));
  root.style.setProperty('--cake-texture-size', textureScale?.backgroundSize || preset.backgroundSize);
  root.style.setProperty('--cake-texture-repeat', textureScale?.backgroundRepeat || preset.backgroundRepeat);
  root.style.setProperty('--cake-texture-position', textureScale?.backgroundPosition || preset.backgroundPosition);
  root.style.setProperty('--cake-texture-attachment', textureScale?.backgroundAttachment || preset.backgroundAttachment);
  root.style.setProperty('--cake-texture-blend', preset.defaultBlend);
  const foreground = colorLuma(tint) >= window.CAKE_PRESET_FOREGROUND.cakeThresholdLuma
    ? window.CAKE_PRESET_FOREGROUND.lightCake : window.CAKE_PRESET_FOREGROUND.darkCake;
  root.style.setProperty('--cake-nav-ink', foreground.ink);
  root.style.setProperty('--cake-nav-surface', foreground.navSurface);

  if (renderKey === activeCakeRenderKey) {
    if (custom && activeCakeTintURL) {
      root.style.setProperty('--cake-texture', presetBackground(activeCakeTintURL));
      root.style.setProperty('--cake-texture-blend', 'normal');
    }
    return;
  }
  activeCakeRenderKey = renderKey;
  activeCakeTintURL = null;
  delete root.dataset.cakeTintRenderMs;
  const requestId = ++cakeRenderRequestId;
  window.CakeTextureRenderer.activateTint(null);
  if (!custom) return;
  const isLatest = () => requestId === cakeRenderRequestId && activeCakeRenderKey === renderKey;
  window.CakeTextureRenderer.renderCustom(preset.id, normalizedTint, isLatest).then((result) => {
    if (!result || !isLatest()) return;
    window.CakeTextureRenderer.activateTint(result.key);
    activeCakeTintURL = result.url;
    root.dataset.cakeTintRenderMs = String(Math.round(result.elapsedMs));
    root.style.setProperty('--cake-texture', presetBackground(result.url));
    root.style.setProperty('--cake-texture-blend', 'normal');
    decorateIcing();
  }).catch(() => {
    // Keep the synchronously applied native image if decode, pixel access, or encoding fails.
    if (isLatest()) window.CakeTextureRenderer.activateTint(null);
  });
}

function restoreState(snapshot) {
  Object.keys(storedState).forEach((key) => delete storedState[key]);
  Object.assign(storedState, clone(snapshot));
  saveState();
  applyState();
  decorateIcing();
}

function commitPanelChange(label) {
  if (!panelSnapshot) return;
  const before = JSON.stringify(panelSnapshot);
  const after = JSON.stringify(storedState);
  if (before !== after) {
    changeHistory.push({ label, state: panelSnapshot });
    redoHistory = [];
    saveState();
  }
  panelSnapshot = null;
}

function saveState() {
  if (Object.keys(storedState).length) localStorage.setItem('atelier-cake-appearance', JSON.stringify(storedState));
  else localStorage.removeItem('atelier-cake-appearance');
}

function applyState() {
  const root = document.documentElement;
  const title = document.querySelector('#site-name');
  const intro = document.querySelector('#site-intro');
  managedRootProperties.forEach((name) => {
    const initial = baselineRootProperties.get(name);
    if (initial) root.style.setProperty(name, initial);
    else root.style.removeProperty(name);
  });
  managedInlineStyles.forEach((properties, node) => properties.forEach((initial, name) => {
    if (initial) node.style.setProperty(name, initial);
    else node.style.removeProperty(name);
  }));
  if (featuredImage && initialFeaturedImageSrc !== null && initialFeaturedImageSrc !== undefined) featuredImage.setAttribute('src', initialFeaturedImageSrc);

  const colors = storedState.colors || {};
  syncCakeRendering(colors);
  Object.entries(colors).forEach(([key, value]) => {
    if (!nonStyleColorKeys.has(key) && key !== 'description' && !presetRootProperties.has(key) && value !== null && value !== undefined) root.style.setProperty(key, value);
  });
  if (colors['--ink'] !== null && colors['--ink'] !== undefined) root.style.setProperty('--copy-color', colors['--ink']);
  if (colors.description !== null && colors.description !== undefined) root.style.setProperty('--copy-color', colors.description);
  if (colors['--accent'] !== null && colors['--accent'] !== undefined) root.style.setProperty('--title-color', colors['--accent']);
  const hasExplicitBodyColor = colors['--ink'] !== null && colors['--ink'] !== undefined
    || colors.description !== null && colors.description !== undefined
    || colors['--copy-color'] !== null && colors['--copy-color'] !== undefined
    || copyEdits['site-intro']?.color !== undefined
    || /\bcolor\s*:/i.test(copyEdits['site-intro']?.html || '');
  const hasExplicitTitleColor = colors['--accent'] !== null && colors['--accent'] !== undefined
    || colors['--title-color'] !== null && colors['--title-color'] !== undefined
    || copyEdits['site-name']?.color !== undefined
    || /\bcolor\s*:/i.test(copyEdits['site-name']?.html || '');
  if (colorLuma(getComputedStyle(root).getPropertyValue('--icing')) < window.CAKE_PRESET_FOREGROUND.cakeThresholdLuma) {
    if (!hasExplicitBodyColor) root.style.setProperty('--copy-color', '#fff4df');
    if (!hasExplicitTitleColor) root.style.setProperty('--title-color', '#fff4df');
  }
  const taglineCopy = copyEdits['site-tagline'] || {};
  const hasExplicitTaglineColor = colors['--eyebrow-color'] !== null && colors['--eyebrow-color'] !== undefined
    || taglineCopy.color !== undefined
    || /\bcolor\s*:/i.test(taglineCopy.html || '');
  if (taglineCopy.color !== null && taglineCopy.color !== undefined) root.style.setProperty('--eyebrow-color', taglineCopy.color);
  else if (!hasExplicitTaglineColor) {
    const eyebrowColor = colorLuma(getComputedStyle(root).getPropertyValue('--icing')) < window.CAKE_PRESET_FOREGROUND.cakeThresholdLuma ? '#fff4df' : '#5e1021';
    root.style.setProperty('--eyebrow-color', eyebrowColor);
  }

  const type = storedState.type || {};
  if (type.fontFamily !== null && type.fontFamily !== undefined) root.style.setProperty('--display-font', type.fontFamily);
  const titleCopy = copyEdits['site-name'] || {};
  const introCopy = copyEdits['site-intro'] || {};
  if (type.displaySize !== null && type.displaySize !== undefined) title.style.fontSize = `${type.displaySize}rem`;
  else if (titleCopy.size) title.style.fontSize = titleCopy.size;
  if (type.bodySize !== null && type.bodySize !== undefined) intro.style.fontSize = `${type.bodySize}rem`;
  else if (introCopy.size) intro.style.fontSize = introCopy.size;
  if (type.weight !== null && type.weight !== undefined) title.style.fontWeight = type.weight;
  else if (titleCopy.weight) title.style.fontWeight = titleCopy.weight;
  if (type.spacing !== null && type.spacing !== undefined) title.style.letterSpacing = `${type.spacing}em`;
  const layers = storedState.layers || {};
  if (layers.icingSoftness !== null && layers.icingSoftness !== undefined) root.style.setProperty('--icing-blur', `${effectiveNumber(layers.icingSoftness, .16, 0, 3)}px`);
  if (layers.icingTilt !== null && layers.icingTilt !== undefined) root.style.setProperty('--layer-tilt', `${layers.icingTilt}deg`);
  if (layers.pores !== null && layers.pores !== undefined) root.style.setProperty('--pore-opacity', layers.pores);
  const blur = storedState.blur || {};
  if (blur.blend !== null && blur.blend !== undefined) root.style.setProperty('--cake-contact-blend', blur.blend);
  if (blur.feather !== null && blur.feather !== undefined) root.style.setProperty('--cake-feather', `${blur.feather}px`);
  if (blur.fill !== null && blur.fill !== undefined) root.style.setProperty('--cake-fill-depth', blur.fill);
  if (blur.lineDrift !== null && blur.lineDrift !== undefined) root.style.setProperty('--cake-drift', `${blur.lineDrift}px`);
  if (blur.lineFrequency !== null && blur.lineFrequency !== undefined) root.style.setProperty('--cake-frequency', blur.lineFrequency);
  if (blur.lineHold !== null && blur.lineHold !== undefined) root.style.setProperty('--cake-hold', blur.lineHold);
  if (blur.ridge !== null && blur.ridge !== undefined) root.style.setProperty('--cake-ridge', `${blur.ridge}px`);
  if (blur.valley !== null && blur.valley !== undefined) root.style.setProperty('--cake-valley', `${blur.valley}px`);
  const photo = storedState.photo || {};
  if (featuredImage && photo.shape !== null && photo.shape !== undefined) featuredImage.style.borderRadius = photo.shape;
  if (featuredImage && photo.crop !== null && photo.crop !== undefined) featuredImage.style.objectPosition = `${photo.crop}% center`;
  if (featuredImage && photo.softness !== null && photo.softness !== undefined) featuredImage.style.filter = `blur(${photo.softness}px)`;
  if (featuredImage && photo.swap !== null && photo.swap !== undefined) featuredImage.src = `assets/images/cakes/cake-${photo.swap}.jpg`;
  decorateIcing();
}

function makeButton([id, icon, label], isControl) {
  return `<button class="${isControl ? 'is-control' : ''}" type="button" data-action="${id}" aria-label="${label}" aria-controls="editor-panel" aria-expanded="false"><span class="icon" aria-hidden="true">${icon}</span><span class="label">${label}</span></button>`;
}

function largestFreeArc(radius) {
  const rect = editor.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const free = [];
  for (let angle = 0; angle < 360; angle += 3) {
    const radians = angle * Math.PI / 180;
    const x = centerX + Math.cos(radians) * radius;
    const y = centerY + Math.sin(radians) * radius;
    if (x > 36 && x < innerWidth - 36 && y > 36 && y < innerHeight - 36) free.push(angle);
  }
  const arcs = [];
  free.forEach((angle) => {
    const previous = arcs.at(-1);
    if (previous && angle === previous.at(-1) + 3) previous.push(angle);
    else arcs.push([angle]);
  });
  if (arcs.length > 1 && arcs[0][0] === 0 && arcs.at(-1).at(-1) === 357) {
    arcs[0] = arcs.pop().map((angle) => angle - 360).concat(arcs[0]);
  }
  return arcs.sort((a, b) => b.length - a.length)[0] || [180];
}

function placeBaubles() {
  const nodes = [...options.querySelectorAll('button')];
  if (!nodes.length) return;
  // Rows build from the middle outward: five becomes 3 + 2, six becomes 3 + 2 + 1.
  // This keeps a corner cluster feeling gathered rather than leaving one item dangling.
  const rows = [];
  let remaining = nodes.length;
  for (const count of [3, 2, 1, 3, 2]) {
    if (!remaining) break;
    const take = Math.min(count, remaining);
    rows.push(take);
    remaining -= take;
  }
  let nodeIndex = 0;
  rows.forEach((count, rowIndex) => {
    const radius = 84 + rowIndex * 68;
    const arc = largestFreeArc(radius);
    const arcCenter = arc[Math.floor(arc.length / 2)];
    const requestedSpan = count === 1 ? 0 : (count - 1) * (rowIndex ? 45 : 52);
    const safeSpan = Math.min(requestedSpan, Math.max(0, (arc.length - 8) * 3));
    for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
      const angle = arcCenter + (count === 1 ? 0 : (itemIndex / (count - 1) - .5) * safeSpan);
      const radians = angle * Math.PI / 180;
      const node = nodes[nodeIndex++];
      node.style.setProperty('--x', `${Math.round(Math.cos(radians) * radius)}px`);
      node.style.setProperty('--y', `${Math.round(Math.sin(radians) * radius)}px`);
      node.style.setProperty('--delay', `${(rowIndex * 45) + (itemIndex * 26)}ms`);
    }
  });
  positionPanel();
}

function render() {
  editor.classList.remove('is-focused');
  editor.dataset.branch = 'root';
  options.inert = !editor.classList.contains('is-open');
  options.setAttribute('aria-hidden', String(options.inert));
  options.innerHTML = menu.root.map((item) => makeButton(item, false)).join('');
  hub.textContent = '✦';
  hub.setAttribute('aria-label', 'Close appearance settings');
  requestAnimationFrame(placeBaubles);
}

function panelConfig(action) {
  const colors = storedState.colors || {};
  const type = storedState.type || {};
  const decorations = storedState.decorations || {};
  const resolvedDecorations = resolveDecorations(decorations);
  const layers = storedState.layers || {};
  const blur = storedState.blur || {};
  const effectiveBlur = window.CakeContactRenderer.resolveSettings(blur);
  const foodColor = cakeFoodColorState(colors);
  const value = (group, key, fallback) => group[key] !== null && group[key] !== undefined ? group[key] : fallback;
  const rootStyle = getComputedStyle(document.documentElement);
  const titleStyle = getComputedStyle(document.querySelector('#site-name'));
  const introStyle = getComputedStyle(document.querySelector('#site-intro'));
  const rootFontSize = parseFloat(rootStyle.fontSize) || 16;
  const toRem = (size) => (parseFloat(size) / rootFontSize).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  const softness = effectiveNumber(layers.icingSoftness ?? .16, .16, 0, 3);
  const poreSensitivity = effectiveNumber(layers.pores ?? .42, .42, 0, 1);
  const titleSpacing = Number.parseFloat(titleStyle.letterSpacing);
  const normalizedSpacing = Number.isFinite(titleSpacing) ? titleSpacing / parseFloat(titleStyle.fontSize) : 0;
  return {
    cakePreset: ['Cake type', `<select data-kind="color" data-key="cakePreset">${window.CAKE_PRESETS.map(preset => `<option value="${preset.id}">${preset.label}</option>`).join('')}</select>`],
    cakeZoom: ['Cake zoom', `<input type="range" min=".45" max="1.8" step=".01" value="${effectiveNumber(colors.cakeZoom ?? 1, 1, .45, 1.8)}" data-kind="zoom" data-state-group="colors" data-key="cakeZoom">`],
    cakeFoodTone: ['Cake shade', `<select data-kind="cake-tone" data-state-group="colors" data-key="cakeFoodTone">${foodColor.legacy ? '<option value="legacy">Saved custom shade</option>' : ''}${foodColor.palette.tones.map(tone => `<option value="${tone.id}">${tone.label}</option>`).join('')}</select><span class="cake-shade-swatch" aria-hidden="true"></span>`],
    cakeFoodShade: ['Lighter / deeper', `<input type="range" min="-25" max="25" step="1" value="${foodColor.shade}" data-kind="cake-shade" data-state-group="colors" data-key="cakeFoodShade"${foodColor.legacy ? ' disabled' : ''}>`],
    topperA: ['First topper', `<select data-kind="decoration" data-state-group="decorations" data-key="topperA">${decorationMaterials.map(([id,label]) => `<option value="${id}">${label}</option>`).join('')}</select>`],
    topperAScale: ['First topper size', `<input type="range" min=".5" max="2" step=".01" value="${resolvedDecorations.topperAScale}" data-kind="decoration-scale" data-state-group="decorations" data-key="topperAScale">`],
    topperB: ['Second topper', `<select data-kind="decoration" data-state-group="decorations" data-key="topperB">${decorationMaterials.map(([id,label]) => `<option value="${id}">${label}</option>`).join('')}</select>`],
    topperBScale: ['Second topper size', `<input type="range" min=".5" max="2" step=".01" value="${resolvedDecorations.topperBScale}" data-kind="decoration-scale" data-state-group="decorations" data-key="topperBScale">`],
    topperPattern: ['Arrangement', `<select data-kind="decoration" data-state-group="decorations" data-key="topperPattern"><option value="cluster">Cluster</option><option value="line">Line</option></select>`],
    candyColors: ['Candy colors', `<div class="candy-color-picker"><input type="hidden" data-kind="decoration-list" data-state-group="decorations" data-key="candyColors"><div class="candy-color-grid" role="group" aria-label="Candy colors">${candyPalette.map(([id,label,hex]) => `<button type="button" class="candy-color-swatch" data-color-id="${id}" aria-label="${label}" aria-pressed="false" style="--swatch:${hex}"></button>`).join('')}</div><ol class="candy-color-order" aria-label="Selected candy color order"></ol></div>`],
    fillingMaterial: ['Filling material', `<select data-kind="decoration" data-state-group="decorations" data-key="filling"><option value="none">None</option>${window.CAKE_MATERIAL_CATALOG.materials.map(material => `<option value="${material.id}">${material.label}</option>`).join('')}</select>`],
    fillingScale: ['Filling size', `<input type="range" min=".5" max="2" step=".01" value="${effectiveNumber(decorations.fillingScale ?? 1, 1, .5, 2)}" data-kind="decoration-scale" data-state-group="decorations" data-key="fillingScale">`],
    fillingFrequency: ['Filling density', `<input type="range" min="0" max="2" step=".01" value="${resolvedDecorations.fillingFrequency}" data-kind="decoration-scale" data-state-group="decorations" data-key="fillingFrequency">`],
    icing: ['Icing color', `<input type="color" value="${value(colors, '--icing', colorHex(rootStyle.getPropertyValue('--icing')))}" data-kind="color" data-key="--icing">`],
    ink: ['Body text color', `<input type="color" value="${value(colors, 'description', value(colors, '--ink', colorHex(introStyle.color)))}" data-kind="color" data-key="--ink">`],
    accent: ['Title text', `<input type="color" value="${value(colors, '--accent', colorHex(titleStyle.color))}" data-kind="color" data-key="--accent">`],
    fontFamily: ['Title font', `<select data-kind="type" data-key="fontFamily"><option value="'Playwrite IT Moderna', cursive">Scripted</option><option value="'Cormorant Garamond', serif">Editorial serif</option><option value="'DM Sans', sans-serif">Clean sans</option></select>`],
    displaySize: ['Title size', `<input type="range" min=".65" max="6" step=".01" value="${value(type, 'displaySize', toRem(titleStyle.fontSize))}" data-kind="type" data-key="displaySize">`],
    bodySize: ['Body size', `<input type="range" min=".65" max="6" step=".01" value="${value(type, 'bodySize', toRem(introStyle.fontSize))}" data-kind="type" data-key="bodySize">`],
    weight: ['Title weight', `<input type="range" min="200" max="700" step="100" value="${value(type, 'weight', titleStyle.fontWeight)}" data-kind="type" data-key="weight">`],
    spacing: ['Letter spacing', `<input type="range" min="-.04" max=".12" step=".001" value="${value(type, 'spacing', normalizedSpacing.toFixed(3))}" data-kind="type" data-key="spacing">`],
    icingSoftness: ['Icing highlight softness', `<input type="range" min="0" max="3" step=".01" value="${softness}" data-kind="layer" data-key="icingSoftness">`],
    icingTilt: ['Layer slope', `<input type="range" min="-.8" max=".8" step=".1" value="${value(layers, 'icingTilt', '0')}" data-kind="layer" data-key="icingTilt">`],
    pores: ['Pore sensitivity', `<input type="range" min="0" max="1" step=".01" value="${poreSensitivity}" data-kind="layer" data-key="pores">`],
    blend: ['Contact amount', `<input type="range" min="0" max="1" step=".01" value="${effectiveBlur.blend}" data-kind="blur" data-key="blend">`],
    feather: ['Edge softness', `<input type="range" min="0" max="5" step=".01" value="${effectiveBlur.feather}" data-kind="blur" data-key="feather">`],
    fill: ['Pocket filling', `<input type="range" min="0" max="1" step=".01" value="${effectiveBlur.fill}" data-kind="blur" data-key="fill">`],
    lineDrift: ['Lateral variation', `<input type="range" min="0" max="14" step="1" value="${effectiveBlur.lineDrift}" data-kind="blur" data-key="lineDrift">`],
    lineFrequency: ['Contact detail', `<input type="range" min="0" max="26" step="1" value="${effectiveBlur.lineFrequency}" data-kind="blur" data-key="lineFrequency">`],
    lineHold: ['Reach', `<input type="range" min="0" max="64" step="1" value="${effectiveBlur.lineHold}" data-kind="blur" data-key="lineHold">`],
    ridge: ['Icing reach', `<input type="range" min="0" max="12" step="1" value="${effectiveBlur.ridge}" data-kind="blur" data-key="ridge">`],
    valley: ['Downward crumb drag', `<input type="range" min="0" max="12" step="1" value="${effectiveBlur.valley}" data-kind="blur" data-key="valley">`]
  }[action];
}

function positionPanel() {
  if (editorMode === 'desktop') return;
  if (!panel.classList.contains('is-visible')) return;
  const hubRect = hub.getBoundingClientRect();
  const baubleRects = [hubRect, ...[...options.querySelectorAll('button')]
    .filter((button) => getComputedStyle(button).opacity !== '0')
    .map((button) => button.getBoundingClientRect())];
  const clusterTop = Math.min(...baubleRects.map((rect) => rect.top));
  const clusterBottom = Math.max(...baubleRects.map((rect) => rect.bottom));
  const roomAbove = Math.max(0, clusterTop - 14);
  const roomBelow = Math.max(0, innerHeight - clusterBottom - 14);
  const placeAbove = roomAbove >= roomBelow;
  const available = Math.max(120, Math.min(innerHeight - 16, placeAbove ? roomAbove : roomBelow));
  panel.style.maxHeight = `${available}px`;
  const panelRect = panel.getBoundingClientRect();
  const left = Math.max(8, Math.min(innerWidth - panelRect.width - 8, hubRect.left + hubRect.width / 2 - panelRect.width / 2));
  panel.style.left = `${left}px`;
  panel.style.top = `${Math.max(8, Math.min(innerHeight - panelRect.height - 8, placeAbove ? clusterTop - panelRect.height - 14 : clusterBottom + 14))}px`;
  panel.dataset.side = placeAbove ? 'above' : 'below';
}

function updateMaterialFieldHelp(field, key, id) {
  const help = field.querySelector('.control-help');
  if (!help) return;
  const fallback = key === 'topper' ? 'strawberryRosette' : 'none';
  const material = window.CAKE_MATERIAL_CATALOG.byId[id];
  if (material) help.textContent = material.selectorDescriptions[key];
  else if (id === fallback) help.textContent = key === 'topper'
    ? 'Keep the original strawberry and rosette decoration.'
    : 'Leave the cut cake without added filling pieces.';
  else help.textContent = `Saved choice “${String(id)}” is unavailable; preview uses ${key === 'topper' ? 'Strawberry & rosette' : 'no filling'}.`;
}

function renderControlField(action) {
  if (action === 'orderingMenu') {
    const field = document.createElement('div'); field.className = 'control-field';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Manage ordering menu';
    button.addEventListener('click', () => window.CakeStudioMenu?.open()); field.append(button); return field;
  }
  const [title, control] = panelConfig(action);
  const field = document.createElement('div');
  field.className = `control-field${['topperA', 'topperB', 'fillingMaterial', 'cakeFoodTone'].includes(action) ? ' is-material-choice' : ''}${action === 'cakeFoodTone' ? ' is-food-choice' : ''}${action === 'candyColors' ? ' is-candy-choice' : ''}`;
  field.innerHTML = action === 'candyColors'
    ? `<div class="control-row candy-colors-row"><span>${title}</span><span class="control-input">${control}</span></div>${panelSchema.fieldHelp[action] ? `<p class="control-help">${panelSchema.fieldHelp[action]}</p>` : ''}`
    : `<label class="control-row"><span>${title}</span><span class="control-input">${control}</span></label>${panelSchema.fieldHelp[action] ? `<p class="control-help">${panelSchema.fieldHelp[action]}</p>` : ''}`;
  const input = field.querySelector('input, select');
  const stateGroup = input.dataset.stateGroup || (input.dataset.kind === 'color' ? 'colors' : input.dataset.kind === 'type' ? 'type' : input.dataset.kind === 'blur' ? 'blur' : 'layers');
  input.dataset.stateGroup = stateGroup;
  input.dataset.control = action;
  input.setAttribute('aria-label', title);
  if (action === 'cakePreset') {
    const savedId = storedState.colors?.cakePreset ?? 'redVelvet';
    if (!window.CAKE_PRESET_BY_ID[savedId]) {
      const option = document.createElement('option');
      option.value = savedId;
      option.textContent = 'Saved cake type (unavailable)';
      input.append(option);
    }
    input.value = savedId;
  } else if (action === 'cakeFoodTone') {
    const food = cakeFoodColorState();
    if (food.legacy && !input.querySelector('option[value="legacy"]')) {
      const option = document.createElement('option');
      option.value = 'legacy';
      option.textContent = 'Saved custom shade';
      input.prepend(option);
    }
    input.value = food.legacy ? 'legacy' : food.tone.id;
    const swatch = field.querySelector('.cake-shade-swatch');
    if (swatch) swatch.style.backgroundColor = food.tint;
    const help = field.querySelector('.control-help');
    if (help && food.legacy) help.textContent = 'Your saved custom cake shade is preserved. Choose a food-inspired shade to replace it.';
  } else if (action === 'cakeFoodShade') {
    const food = cakeFoodColorState();
    input.value = String(food.shade);
    input.disabled = food.legacy;
  }
  else if (action === 'ink' && storedState.colors?.description !== null && storedState.colors?.description !== undefined) input.value = storedState.colors.description;
  else if (action === 'topperA' || action === 'topperB' || action === 'fillingMaterial') {
    const key = action === 'fillingMaterial' ? 'filling' : action;
    const raw = storedState.decorations?.[key];
    const resolved = resolveDecorations(storedState.decorations);
    const fallback = key === 'filling' ? 'none' : resolved[key];
    const value = key === 'filling' ? (raw ?? 'none') : fallback;
    if (![...input.options].some(option => option.value === value)) {
      const saved = document.createElement('option'); saved.value = value; saved.textContent = `Saved choice (${value})`; input.append(saved);
    }
    input.value = value;
    if (key === 'filling') updateMaterialFieldHelp(field, key, raw === null || raw === undefined ? input.value : raw);
  } else if (action === 'topperPattern') {
    input.value = resolveDecorations(storedState.decorations).topperPattern;
  } else if (action === 'candyColors') {
    const resolved = resolveDecorations(storedState.decorations);
    input.value = JSON.stringify(resolved.candyColors);
    const picker = field.querySelector('.candy-color-picker');
    const refresh = () => {
      const restoreLabel = input.dataset.restoreFocusLabel;
      const restoreColor = input.dataset.restoreFocusColor;
      delete input.dataset.restoreFocusLabel; delete input.dataset.restoreFocusColor;
      const selected = JSON.parse(input.value || '[]');
      picker.querySelectorAll('[data-color-id]').forEach(button => button.setAttribute('aria-pressed', String(selected.includes(button.dataset.colorId))));
      const list = picker.querySelector('.candy-color-order'); list.replaceChildren();
      selected.forEach((id, index) => {
        const tone = candyPalette.find(item => item[0] === id); if (!tone) return;
        const item = document.createElement('li');
        const name = document.createElement('span'); name.textContent = tone[1];
        const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.setAttribute('aria-label', `Move ${tone[1]} earlier`); up.disabled = index === 0;
        const down = document.createElement('button'); down.type = 'button'; down.textContent = '↓'; down.setAttribute('aria-label', `Move ${tone[1]} later`); down.disabled = index === selected.length - 1;
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${tone[1]}`);
        up.addEventListener('click', () => { [selected[index - 1], selected[index]] = [selected[index], selected[index - 1]]; commitColorOrder(selected, `Move ${tone[1]} earlier`, id); });
        down.addEventListener('click', () => { [selected[index + 1], selected[index]] = [selected[index], selected[index + 1]]; commitColorOrder(selected, `Move ${tone[1]} later`, id); });
        remove.addEventListener('click', () => { selected.splice(index, 1); commitColorOrder(selected, `Remove ${tone[1]}`, id); });
        item.append(name, up, down, remove); list.append(item);
      });
      if (restoreLabel || restoreColor) requestAnimationFrame(() => {
        const action = restoreLabel && [...picker.querySelectorAll('.candy-color-order button')].find(button => button.getAttribute('aria-label') === restoreLabel && !button.disabled);
        (action || picker.querySelector(`[data-color-id="${restoreColor}"]`))?.focus({ preventScroll: true });
      });
    };
    const commitColorOrder = (selected, action, id) => {
      input.dataset.restoreFocusLabel = action; input.dataset.restoreFocusColor = id;
      input.value = JSON.stringify(selected); input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    picker.querySelectorAll('[data-color-id]').forEach(button => button.addEventListener('click', () => {
      const selected = JSON.parse(input.value || '[]'), id = button.dataset.colorId;
      input.value = JSON.stringify(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id]);
      input.dispatchEvent(new Event('input', { bubbles: true })); refresh();
    }));
    input.addEventListener('input', refresh); refresh();
  }
  else if (input.type !== 'range' && storedState[stateGroup]?.[input.dataset.key] !== null && storedState[stateGroup]?.[input.dataset.key] !== undefined) input.value = storedState[stateGroup][input.dataset.key];
  if (input.type === 'range') {
    refreshRangeAnnouncement(input);
    const output = document.createElement('output');
    output.className = 'range-value';
    output.dataset.forControl = action;
    output.textContent = formatControlValue(action, input.value);
    field.querySelector('.control-input').append(output);
  }
  input.addEventListener('input', updateControl);
  return field;
}

function renderResetPreview() {
  panel.dataset.palette = 'history';
  panel.scrollTop = 0;
  panel.innerHTML = '<h2>Reset appearance</h2><p>Preview the original cake, type, and color settings. Your saved copy edits stay untouched.</p><div class="panel-actions"><button type="button" data-cancel>Cancel</button><button type="button" data-confirm>Confirm reset</button></div>';
  panel.querySelector('[data-cancel]').addEventListener('click', cancelPanel);
  panel.querySelector('[data-confirm]').addEventListener('click', () => { commitPanelChange('Reset appearance'); closePanel(); });
  panel.classList.add('is-visible');
  requestAnimationFrame(() => panel.querySelector('[data-cancel]')?.focus());
  requestAnimationFrame(positionPanel);
}

function renderHistoryPanel(focusFirst = true) {
  panel.dataset.palette = 'history';
  panel.scrollTop = 0;
  const entries = [...changeHistory].reverse().map((entry, index) => `<li>${index + 1}. ${entry.label}</li>`).join('') || '<li>No changes yet.</li>';
  panel.innerHTML = `<h2>History</h2><ol class="history-list">${entries}</ol><p>${redoHistory.length ? `Redo available (${redoHistory.length})` : 'No redo steps available.'}</p><div class="panel-actions"><button type="button" data-history-action="undo" ${changeHistory.length ? '' : 'disabled'}>Undo</button><button type="button" data-history-action="redo" ${redoHistory.length ? '' : 'disabled'}>Redo</button><button type="button" data-history-action="reset">Reset appearance</button><button type="button" data-panel-close>Close</button></div>`;
  panel.querySelector('[data-history-action="undo"]').addEventListener('click', () => { undoChange(); renderHistoryPanel(); });
  panel.querySelector('[data-history-action="redo"]').addEventListener('click', () => { redoChange(); renderHistoryPanel(); });
  panel.querySelector('[data-history-action="reset"]').addEventListener('click', () => { panelSnapshot = stateSnapshot(); resetAppearance(); renderResetPreview(); });
  panel.querySelector('[data-panel-close]').addEventListener('click', closePanel);
  panel.classList.add('is-visible');
  if (focusFirst) requestAnimationFrame(() => panel.querySelector('button:not(:disabled)')?.focus());
  requestAnimationFrame(positionPanel);
}

function showPanel(action, focusFirst = true) {
  if (panelSnapshot) cancelPanel();
  else closePanel();
  panel.inert = false;
  panelTrigger = options.querySelector(`[data-action="${action}"]`);
  options.querySelectorAll('[aria-expanded="true"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  options.querySelector(`[data-action="${action}"]`)?.setAttribute('aria-expanded', 'true');
  activePhoneAction = action;
  if (action === 'history') { renderHistoryPanel(); return; }
  const category = panelSchema.categories[action];
  if (!category) return;
  panelSnapshot = stateSnapshot();
  panel.dataset.palette = action;
  panel.scrollTop = 0;
  panel.innerHTML = `<h2>${category.title}</h2><p class="transaction-summary" role="status" hidden></p>${category.groups.map((groupId, index) => {
    const group = panelSchema.groups[groupId];
    return `<details class="control-group" data-group="${groupId}" ${index === 0 || action === 'colors' && index === 1 || action === 'fonts' ? 'open' : ''}><summary>${group.title}</summary><p class="group-description">${group.description}</p><div class="group-controls"></div></details>`;
  }).join('')}<div class="panel-actions"><button type="button" data-cancel>Cancel all</button><button type="button" data-confirm>Confirm all changes</button></div>`;
  category.groups.forEach((groupId) => {
    const group = panelSchema.groups[groupId];
    const controls = panel.querySelector(`[data-group="${groupId}"] .group-controls`);
    group.fields.forEach((field) => controls.append(renderControlField(field)));
  });
  panel.querySelectorAll('details').forEach((details) => details.addEventListener('toggle', () => requestAnimationFrame(positionPanel)));
  panel.querySelector('[data-cancel]').addEventListener('click', cancelPanel);
  panel.querySelector('[data-confirm]').addEventListener('click', () => { commitPanelChange(transactionLabel(category.title)); transactionCategories.clear(); transactionReset = false; closePanel(); });
  panel.classList.add('is-visible');
  if (focusFirst) requestAnimationFrame(() => panel.querySelector('summary, input, select, button')?.focus());
  requestAnimationFrame(positionPanel);
}

function renderDesktopWorkspace() {
  if (panel.parentElement !== desktopContent) desktopContent.append(panel);
  panel.classList.add('is-visible');
  panel.inert = false;
  panel.style.cssText = '';
  panel.classList.add('desktop-panel');
  panel.dataset.palette = activeDesktopTab === 'history' ? 'history' : 'root';
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', `desktop-tab-${activeDesktopTab}`);
  panel.innerHTML = `<h2>${activeDesktopTab === 'history' ? 'History' : activeDesktopTab === 'site' ? 'Site' : 'Cake'}</h2>
    <p class="transaction-summary" role="status" hidden></p>
    <div class="desktop-groups"></div>
    <section class="desktop-history" ${activeDesktopTab === 'history' ? '' : 'hidden'}><ol class="history-list"></ol><p class="desktop-redo-status"></p><div class="desktop-history-actions"><button type="button" data-history-action="undo">Undo</button><button type="button" data-history-action="redo">Redo</button><button type="button" data-history-action="reset">Reset appearance</button></div></section>
    <div class="panel-actions"><button type="button" data-cancel>Cancel all</button><button type="button" data-confirm>Confirm all changes</button></div>`;
  const groupsContainer = panel.querySelector('.desktop-groups');
  const categories = Object.entries(panelSchema.categories);
  categories.forEach(([categoryId, category]) => {
    const belongs = activeDesktopTab === 'site' ? categoryId === 'fonts' : activeDesktopTab === 'cake' ? categoryId !== 'fonts' : false;
    category.groups.forEach((groupId) => {
      const group = panelSchema.groups[groupId];
      const details = document.createElement('details');
      details.className = 'control-group desktop-control-group';
      details.dataset.group = groupId;
      details.dataset.category = categoryId;
      details.open = groupId === 'advancedEdges' ? false : true;
      details.hidden = !belongs;
      details.innerHTML = `<summary>${group.title}</summary><p class="group-description">${group.description}</p><div class="group-controls"></div>`;
      group.fields.forEach((field) => details.querySelector('.group-controls').append(renderControlField(field)));
      groupsContainer.append(details);
    });
  });
  const historyList = panel.querySelector('.history-list');
  historyList.innerHTML = [...changeHistory].reverse().map((entry, index) => `<li>${index + 1}. ${entry.label}</li>`).join('') || '<li>No changes yet.</li>';
  panel.querySelector('.desktop-redo-status').textContent = redoHistory.length ? `Redo available (${redoHistory.length})` : 'No redo steps available.';
  panel.querySelector('[data-history-action="undo"]').disabled = !changeHistory.length;
  panel.querySelector('[data-history-action="redo"]').disabled = !redoHistory.length;
  panel.querySelector('[data-history-action="undo"]').addEventListener('click', () => { undoChange(); renderDesktopWorkspace(); });
  panel.querySelector('[data-history-action="redo"]').addEventListener('click', () => { redoChange(); renderDesktopWorkspace(); });
  panel.querySelector('[data-history-action="reset"]').addEventListener('click', () => { if (!panelSnapshot) panelSnapshot = stateSnapshot(); transactionReset = true; resetAppearance(); renderDesktopWorkspace(); });
  panel.querySelector('[data-cancel]').addEventListener('click', cancelDesktopPreview);
  panel.querySelector('[data-confirm]').addEventListener('click', () => { commitPanelChange(transactionLabel('Appearance')); transactionCategories.clear(); transactionReset = false; renderDesktopWorkspace(); });
  panel.querySelectorAll('.desktop-history-actions button').forEach((button) => button.tabIndex = activeDesktopTab === 'history' ? 0 : -1);
  panel.querySelectorAll('.desktop-control-group input,.desktop-control-group select,.desktop-control-group summary').forEach((node) => { if (node.closest('[hidden]')) node.tabIndex = -1; });
  panel.querySelector('.panel-actions').hidden = !panelSnapshot;
  refreshTransactionSummary();
}

function setDesktopTab(tab, focusTab = false) {
  activeDesktopTab = tab;
  desktopEditor.querySelectorAll('[role="tab"]').forEach((button) => {
    const selected = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && focusTab) button.focus();
  });
  if (editorMode === 'desktop') {
    panel.setAttribute('aria-labelledby', `desktop-tab-${tab}`);
    panel.querySelector('h2').textContent = tab === 'history' ? 'History' : tab === 'site' ? 'Site' : 'Cake';
    panel.dataset.palette = tab === 'history' ? 'history' : 'root';
    panel.querySelector('.desktop-history').hidden = tab !== 'history';
    panel.querySelectorAll('.desktop-control-group').forEach((group) => {
      const visible = tab === 'site' ? group.dataset.category === 'fonts' : tab === 'cake' ? group.dataset.category !== 'fonts' : false;
      group.hidden = !visible;
      group.querySelectorAll('summary,input,select,button').forEach((node) => { node.tabIndex = visible ? 0 : -1; });
    });
    panel.querySelectorAll('.desktop-history-actions button').forEach((button) => button.tabIndex = tab === 'history' ? 0 : -1);
  }
}

function refreshTransactionSummary() {
  const summary = panel.querySelector('.transaction-summary');
  if (!summary) return;
  const labels = [...transactionCategories].map((id) => panelSchema.categories[id]?.title).filter(Boolean);
  const message = transactionReset ? 'Previewing a full appearance reset. Confirm or cancel the reset.' : labels.length ? `Pending edits: ${labels.join(', ')}. Confirm or cancel all changes together.` : '';
  summary.textContent = message;
  summary.hidden = !message;
  const actions = panel.querySelector('.panel-actions');
  if (actions) actions.hidden = !panelSnapshot;
}

function transactionLabel(fallback) {
  if (transactionReset) return 'Reset appearance';
  const labels = [...transactionCategories].map((id) => panelSchema.categories[id]?.title).filter(Boolean);
  return `${labels.length ? labels.join(', ') : fallback} settings`;
}

function cancelDesktopPreview() {
  if (panelSnapshot) restoreState(panelSnapshot);
  panelSnapshot = null;
  transactionCategories.clear();
  transactionReset = false;
  renderDesktopWorkspace();
  desktopEditor.querySelector(`[data-tab="${activeDesktopTab}"]`)?.focus({ preventScroll: true });
}

function setEditorMode(mode, manual = false) {
  const next = mode === 'desktop' && desktopEligible() ? 'desktop' : 'phone';
  if (next === editorMode && !manual && document.body.dataset.editorMode === next) return;
  const wasDesktop = editorMode === 'desktop';
  const focusedControl = document.activeElement?.dataset?.control || lastEditorControl;
  const focusedTab = desktopEditor.contains(document.activeElement);
  editorMode = next;
  if (manual) localStorage.setItem(editorModeStorageKey, next);
  document.body.dataset.editorMode = next;
  modeToggle.textContent = next === 'desktop' ? 'Phone editor' : 'Desktop editor';
  modeToggle.setAttribute('aria-label', `Switch to ${next === 'desktop' ? 'phone' : 'desktop'} editor`);
  desktopEditor.inert = next !== 'desktop';
  desktopEditor.setAttribute('aria-hidden', String(next !== 'desktop'));
  if (next === 'desktop') {
    if (!wasDesktop && activePhoneAction) activeDesktopTab = activePhoneAction === 'history' ? 'history' : activePhoneAction === 'fonts' ? 'site' : 'cake';
    editor.inert = true;
    editor.setAttribute('aria-hidden', 'true');
    editor.classList.remove('is-open');
    renderDesktopWorkspace();
    if (focusedTab) desktopEditor.querySelector(`[data-tab="${activeDesktopTab}"]`).focus({ preventScroll: true });
    else if (!manual && focusedControl) panel.querySelector(`[data-control="${focusedControl}"]`)?.focus({ preventScroll: true });
  } else {
    editor.inert = false;
    editor.removeAttribute('aria-hidden');
    panel.classList.remove('desktop-panel');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-labelledby');
    if (panel.parentElement !== editor) editor.append(panel);
    if (wasDesktop) {
      panel.classList.remove('is-visible');
      panel.inert = true;
      const snapshot = panelSnapshot;
      const categories = new Set(transactionCategories);
      const resetPreview = transactionReset;
      // Recreate controls from live preview values without replacing the original rollback state.
      panelSnapshot = null;
      editor.classList.add('is-open');
      render();
      activePhoneAction ||= activeDesktopTab === 'site' ? 'fonts' : activeDesktopTab === 'history' ? (transactionCategories.values().next().value || 'history') : 'colors';
      if (activePhoneAction === 'history' && !snapshot) {
        panelSnapshot = null;
        panelTrigger = options.querySelector('[data-action="history"]');
        renderHistoryPanel(false);
      } else {
        panelSnapshot = null;
        showPanel(activePhoneAction, false);
        panelSnapshot = snapshot || panelSnapshot;
        transactionCategories.clear();
        categories.forEach((category) => transactionCategories.add(category));
        transactionReset = resetPreview;
        refreshTransactionSummary();
      }
      if (!manual && focusedControl) panel.querySelector(`[data-control="${focusedControl}"]`)?.focus({ preventScroll: true });
    } else {
      closePanel();
      editor.classList.remove('is-open');
      hub.setAttribute('aria-expanded', 'false');
      options.inert = true;
      options.setAttribute('aria-hidden', 'true');
    }
    if (wasDesktop && !manual && !focusedControl) hub.focus({ preventScroll: true });
    if (manual) modeToggle.focus({ preventScroll: true });
  }
  modeToggle.hidden = !desktopEligible();
}

function updateControl(event) {
  if (!panelSnapshot) panelSnapshot = stateSnapshot();
  const transactionActions = panel.querySelector('.panel-actions');
  if (transactionActions) transactionActions.hidden = false;
  const { kind, key, stateGroup, control } = event.currentTarget.dataset;
  const category = event.currentTarget.closest('.desktop-control-group')?.dataset.category || activePhoneAction;
  if (category && panelSchema.categories[category]) { transactionCategories.add(category); activePhoneAction = category; }
  const group = stateGroup || (kind === 'color' ? 'colors' : kind === 'type' ? 'type' : kind === 'blur' ? 'blur' : 'layers');
  storedState[group] ||= {};
  if (group === 'decorations' && ['topperA', 'topperB', 'topperAScale', 'topperBScale'].includes(key)) {
    const resolved = resolveDecorations(storedState.decorations);
    ['topperA', 'topperB', 'topperAScale', 'topperBScale'].forEach(name => { storedState.decorations[name] = resolved[name]; });
  }
  if (key === 'cakePreset') {
    storedState.colors.cakePreset = event.currentTarget.value;
    const nextPreset = cakePresetFor(event.currentTarget.value);
    const nextPalette = cakeColorPalettes[nextPreset.id] || cakeColorPalettes.redVelvet;
    storedState.colors.cakeFoodTone = nextPalette.defaultTone;
    storedState.colors.cakeFoodShade = 0;
    storedState.colors['--cake-tint'] = nextPreset.tint;
  } else if (key === 'cakeFoodTone') {
    const food = cakeFoodColorState();
    const selectedTone = food.palette.tones.find(tone => tone.id === event.currentTarget.value);
    if (selectedTone) {
      storedState.colors.cakeFoodTone = selectedTone.id;
      storedState.colors.cakeFoodShade = 0;
      storedState.colors['--cake-tint'] = food.toneColor(selectedTone);
    }
  } else if (key === 'cakeFoodShade') {
    const food = cakeFoodColorState();
    if (!food.legacy && food.tone) {
      storedState.colors.cakeFoodTone = food.tone.id;
      storedState.colors.cakeFoodShade = Number(event.currentTarget.value);
      storedState.colors['--cake-tint'] = shadeFoodColor(food.toneColor(food.tone), event.currentTarget.value);
    }
  } else if (kind === 'decoration-list') {
    try { storedState.decorations[key] = JSON.parse(event.currentTarget.value); }
    catch { storedState.decorations[key] = [...decorationDefaults.candyColors]; }
  } else storedState[group][key] = event.currentTarget.value;
  if (group === 'decorations' && ['topperA', 'topperB', 'topperAScale', 'topperBScale', 'topperPattern', 'candyColors'].includes(key)) {
    const resolved = resolveDecorations(storedState.decorations);
    storedState.decorations.topper = resolved.topperA === 'strawberry' && resolved.topperB === 'rosette' ? 'strawberryRosette' : resolved.topperA;
    storedState.decorations.topperScale = resolved.topperAScale;
  }
  if (group === 'decorations' && (key === 'topper' || key === 'filling')) updateMaterialFieldHelp(event.currentTarget.closest('.control-field'), key, event.currentTarget.value);
  if (group === 'colors' && key === '--ink' && Object.hasOwn(storedState.colors, 'description')) storedState.colors.description = event.currentTarget.value;
  const output = panel.querySelector(`[data-for-control="${control}"]`);
  if (output) output.textContent = formatControlValue(control, event.currentTarget.value);
  refreshRangeAnnouncement(event.currentTarget);
  applyState();
  refreshTransactionSummary();
  if (key === 'cakePreset' || key === 'cakeFoodTone' || key === 'cakeFoodShade') refreshCakeFoodControls();
}

function closePanel() {
  panel.inert = true;
  panelSnapshot = null;
  transactionCategories.clear();
  transactionReset = false;
  panel.classList.remove('is-visible');
  options.querySelectorAll('[aria-expanded="true"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  if (editor.classList.contains('is-open')) panelTrigger?.focus({ preventScroll: true });
  panelTrigger = null;
}

function cancelPanel() {
  if (panelSnapshot) restoreState(panelSnapshot);
  closePanel();
}

function undoChange() {
  if (panelSnapshot) cancelPanel();
  const entry = changeHistory.pop();
  if (!entry) return;
  redoHistory.push({ label: entry.label, state: stateSnapshot() });
  restoreState(entry.state);
}

function redoChange() {
  if (panelSnapshot) cancelPanel();
  const entry = redoHistory.pop();
  if (!entry) return;
  changeHistory.push({ label: entry.label, state: stateSnapshot() });
  restoreState(entry.state);
}

function resetAppearance() {
  Object.keys(storedState).forEach((key) => delete storedState[key]);
  applyState();
  decorateIcing();
}

function saveCopy() {
  if (!activeText) return;
  copyEdits[activeText.dataset.editKey] = {
    html: activeText.innerHTML,
    align: activeText.style.textAlign,
    size: activeText.style.fontSize,
    weight: activeText.style.fontWeight
  };
  localStorage.setItem('cake-copy-edits', JSON.stringify(copyEdits));
}

function positionTextToolbar(node) {
  textToolbar.hidden = false;
  const rect = node.getBoundingClientRect();
  const toolbarRect = textToolbar.getBoundingClientRect();
  const left = Math.max(8, Math.min(innerWidth - toolbarRect.width - 8, rect.left));
  const below = rect.bottom + 8;
  textToolbar.style.left = `${left}px`;
  textToolbar.style.top = `${below + toolbarRect.height < innerHeight - 8 ? below : Math.max(8, rect.top - toolbarRect.height - 8)}px`;
}

function beginTextEdit(node) {
  if (activeText && activeText !== node) finishTextEdit();
  activeText = node;
  node.contentEditable = 'true';
  node.spellcheck = true;
  node.classList.add('is-editing');
  node.focus({ preventScroll: true });
  positionTextToolbar(node);
}

function finishTextEdit(restoreFocus = false) {
  if (!activeText) return;
  const editedNode = activeText;
  saveCopy();
  editedNode.contentEditable = 'false';
  editedNode.classList.remove('is-editing');
  activeText = null;
  textToolbar.hidden = true;
  if (restoreFocus) editedNode.focus({ preventScroll: true });
}

function clearPendingTextPress() {
  if (pressTimer !== null) window.clearTimeout(pressTimer);
  pressTimer = null;
  pendingTextPress = null;
}

function setupTextEditing() {
  const textNodes = [...document.querySelectorAll('main h1, main h2, main p, main a')]
    .filter((node) => !node.closest('form') && !node.classList.contains('form-note'));
  textNodes.forEach((node, index) => {
    node.classList.add('text-editable');
    if (!node.matches('a[href],button,input,select,textarea,[tabindex]')) node.tabIndex = 0;
    node.setAttribute('aria-describedby', [node.getAttribute('aria-describedby'), 'copy-edit-instruction'].filter(Boolean).join(' '));
    node.setAttribute('aria-keyshortcuts', 'F2');
    node.title = 'Press F2 to edit this text';
    node.dataset.editKey = node.id || `copy-${index}`;
    const saved = copyEdits[node.dataset.editKey];
    if (saved) {
      node.innerHTML = saved.html;
      node.style.textAlign = saved.align || '';
      const type = storedState.type || {};
      const appearanceOwnsSize = node.id === 'site-name' ? type.displaySize !== null && type.displaySize !== undefined : node.id === 'site-intro' && type.bodySize !== null && type.bodySize !== undefined;
      const appearanceOwnsWeight = node.id === 'site-name' && type.weight !== null && type.weight !== undefined;
      node.style.fontSize = appearanceOwnsSize ? node.style.fontSize : saved.size || '';
      node.style.fontWeight = appearanceOwnsWeight ? node.style.fontWeight : saved.weight || '';
    }
    node.addEventListener('pointerdown', (event) => {
      if (node.contentEditable === 'true') return;
      clearPendingTextPress();
      const originX = event.clientX;
      const originY = event.clientY;
      const press = { node, pointerId: event.pointerId, originX, originY };
      pendingTextPress = press;
      pressTimer = window.setTimeout(() => {
        if (pendingTextPress !== press) return;
        pendingTextPress = null;
        pressTimer = null;
        beginTextEdit(node);
      }, 550);
    });
    node.addEventListener('keydown', (event) => {
      if (event.key === 'F2' && node.contentEditable !== 'true') {
        event.preventDefault();
        clearPendingTextPress();
        beginTextEdit(node);
      } else if (event.key === 'Escape' && activeText === node) {
        event.preventDefault();
        finishTextEdit(true);
      }
    });
    node.addEventListener('input', saveCopy);
    node.addEventListener('blur', saveCopy);
    node.addEventListener('click', (event) => {
      if (node.contentEditable === 'true') event.preventDefault();
    });
  });
  window.addEventListener('pointermove', (event) => {
    const press = pendingTextPress;
    if (press && event.pointerId === press.pointerId && Math.hypot(event.clientX - press.originX, event.clientY - press.originY) > 8) clearPendingTextPress();
  });
  window.addEventListener('pointerup', (event) => {
    if (pendingTextPress?.pointerId === event.pointerId) clearPendingTextPress();
  });
  window.addEventListener('pointercancel', (event) => {
    if (pendingTextPress?.pointerId === event.pointerId) clearPendingTextPress();
  });
  window.addEventListener('blur', clearPendingTextPress);
}

function changeTextStyle(action) {
  if (!activeText) return;
  if (action === 'align-left') activeText.style.textAlign = 'left';
  if (action === 'align-center') activeText.style.textAlign = 'center';
  if (action === 'align-right') activeText.style.textAlign = 'right';
  if (action === 'font-down' || action === 'font-up') {
    const current = parseFloat(getComputedStyle(activeText).fontSize);
    activeText.style.fontSize = `${Math.max(11, Math.min(96, current + (action === 'font-up' ? 2 : -2)))}px`;
  }
  if (action === 'weight') activeText.style.fontWeight = getComputedStyle(activeText).fontWeight >= 600 ? '400' : '700';
  saveCopy();
  positionTextToolbar(activeText);
}

function dragStart(event, target = hub) {
  dragTarget = target;
  startX = event.clientX;
  startY = event.clientY;
  moved = false;
  dragTarget.setPointerCapture(event.pointerId);
}

function dragMove(event) {
  if (!dragTarget.hasPointerCapture(event.pointerId) || Math.hypot(event.clientX - startX, event.clientY - startY) < 6) return;
  moved = true;
  if (dragTarget === hub) editor.style.top = 'auto';
  editor.style.right = `${Math.max(12, Math.min(innerWidth - 64, innerWidth - event.clientX - 26))}px`;
  editor.style.bottom = `${Math.max(12, Math.min(innerHeight - 64, innerHeight - event.clientY - 26))}px`;
  editor.dataset.positioned = 'true';
  placeBaubles();
  positionPanel();
}

function hubAction(fromKeyboard = false) {
  if (!fromKeyboard && (moved || dragTarget !== hub)) return;
  if (!editor.dataset.positioned) {
    editor.style.right = '6rem';
    editor.style.top = '40svh';
    editor.style.bottom = 'auto';
    editor.dataset.positioned = 'true';
  }
  editor.classList.toggle('is-open');
  if (!editor.classList.contains('is-open')) {
    if (panelSnapshot) cancelPanel();
    else closePanel();
    hub.focus({ preventScroll: true });
  }
  options.inert = !editor.classList.contains('is-open');
  options.setAttribute('aria-hidden', String(options.inert));
  hub.setAttribute('aria-expanded', String(editor.classList.contains('is-open')));
  if (editor.classList.contains('is-open')) render('root');
  else { panel.classList.remove('is-visible'); panel.inert = true; }
}

function submitOrder(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const email = document.querySelector('#business-email').textContent.trim();
  const businessName = document.querySelector('#site-name').innerText.trim().replace(/\s+/g, ' ');
  const note = document.querySelector('#form-note');
  const message = encodeURIComponent(`Name: ${data.get('name')}\nEmail: ${data.get('email')}\nEvent date: ${data.get('date')}\n\n${data.get('details')}`);
  if (!email || email === 'hello@example.com') {
    note.textContent = 'Replace the sample email in the footer before sending inquiries.';
    return;
  }
  window.location.href = `mailto:${email}?subject=${encodeURIComponent(`New cake inquiry for ${businessName}`)}&body=${message}`;
  note.textContent = 'Your email app is opening with the inquiry ready to send.';
}

let decorateIcingRequest = 0;
let decorateIcingPromise = Promise.resolve(null);
function decorateIcing() {
  const requestId = ++decorateIcingRequest;
  window.CakeMaterialRenderer?.syncSelection();
  const layers = storedState.layers || {};
  const contactRequest = window.CakeContactRenderer.request({
    presetId: cakePresetFor((storedState.colors || {}).cakePreset).id,
    blur: clone(storedState.blur || {}),
    icingSoftness: effectiveNumber(layers.icingSoftness ?? .16, .16, 0, 3),
    poreSensitivity: effectiveNumber(layers.pores ?? .42, .42, 0, 1)
  });
  const work = Promise.resolve(contactRequest).catch(() => null).then(async () => {
    if (requestId !== decorateIcingRequest) return null;
    await window.CakeContactRenderer.whenIdle().catch(() => null);
    if (requestId !== decorateIcingRequest) return null;
    await Promise.resolve(window.CakeGarnishRenderer.request()).catch(() => null);
    await window.CakeGarnishRenderer.whenIdle().catch(() => null);
    if (requestId !== decorateIcingRequest) return null;
    return window.CakeMaterialRenderer?.request() ?? null;
  }).catch(() => null);
  decorateIcingPromise = work;
  return work;
}
window.whenAppearanceRenderIdle = async () => { let current; do { current = decorateIcingPromise; await current; } while (current !== decorateIcingPromise); return window.CakeMaterialRenderer?.status.last ?? null; };

applyState();
if (isStudioEditor) {
hub.addEventListener('pointerdown', dragStart);
editor.addEventListener('pointermove', dragMove);
hub.addEventListener('click', (event) => hubAction(event.detail === 0));
panel.inert = true;
options.addEventListener('pointerdown', (event) => {
  const selected = event.target.closest('button');
  if (selected) dragStart(event, selected);
});
options.addEventListener('click', (event) => {
  const selected = event.target.closest('button');
  if (!selected || moved) return;
  showPanel(selected.dataset.action);
});
document.querySelector('#order-form').addEventListener('submit', submitOrder);
if (orderOpener && orderOverlay) orderOpener.addEventListener('click', () => orderOverlay.showModal());
document.querySelector('.close-order').addEventListener('click', () => orderOverlay.close());
window.addEventListener('resize', () => {
  const eligible = desktopEligible();
  modeToggle.hidden = !eligible;
  if (!eligible && editorMode === 'desktop') setEditorMode('phone');
  else if (eligible && editorMode === 'phone' && localStorage.getItem(editorModeStorageKey) !== 'phone') setEditorMode('desktop');
  syncCakeRendering(storedState.colors || {});
  placeBaubles();
  positionPanel();
});
modeToggle.addEventListener('click', () => setEditorMode(editorMode === 'desktop' ? 'phone' : 'desktop', true));
panel.addEventListener('focusin', (event) => { lastEditorControl = event.target.dataset.control || null; });
desktopEditor.querySelector('.desktop-tabs').addEventListener('focusin', () => { lastEditorControl = null; });
hub.addEventListener('focusin', () => { lastEditorControl = null; });
desktopEditor.querySelectorAll('[role="tab"]').forEach((tab) => tab.addEventListener('click', () => setDesktopTab(tab.dataset.tab)));
desktopEditor.querySelector('.desktop-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = [...desktopEditor.querySelectorAll('[role="tab"]')];
  const index = tabs.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  setDesktopTab(tabs[next].dataset.tab, true);
});
modeToggle.hidden = !desktopEligible();
if (editorMode === 'desktop' && desktopEligible()) setEditorMode('desktop');
else setEditorMode('phone');
setupTextEditing();
textToolbar.addEventListener('click', (event) => {
  const action = event.target.closest('button')?.dataset.textAction;
  if (!action) return;
  if (action === 'done') finishTextEdit(true);
  else changeTextStyle(action);
});
textToolbar.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !activeText) return;
  event.preventDefault();
  finishTextEdit(true);
});
document.addEventListener('pointerdown', (event) => {
  if (activeText && !activeText.contains(event.target) && !textToolbar.contains(event.target)) finishTextEdit();
});
}

// Restricted choices for the customer preview; reuse the production renderer.
// No editor state or contact details are persisted by this path.
window.setOrderCakePreview = async (cake, options = window.CakeOrderOptions) => {
  if (document.body.dataset.mode !== 'preview') return;
  if (!options || !options.cakes.some(([id]) => id === cake.flavor)) return;
  if (!options.fillings.some(([id]) => id === cake.filling) || !Object.hasOwn(options.amounts, cake.amount)) return;
  if (!options.toppers.some(([id]) => id === cake.topperA) || !options.toppers.some(([id]) => id === cake.topperB)) return;
  const icing = options.icings.find(([id]) => id === cake.icing); if (!icing) return;
  const cakeVisual = options.visuals?.cakes?.[cake.flavor] || { base:cake.flavor };
  if (!window.CAKE_PRESET_BY_ID[cakeVisual.base]) return;
  const visualBase = (group, id) => options.visuals?.[group]?.[id]?.base || id;
  Object.keys(storedState).forEach(key => delete storedState[key]);
  Object.assign(storedState, {
    colors: { cakePreset: cakeVisual.base, cakeZoom: orderPreviewCakeZoom, '--icing': icing[2], ...(cakeVisual.color ? {'--cake-tint':cakeVisual.color} : {}) },
    decorations: { topperA: visualBase('toppers',cake.topperA), topperB: visualBase('toppers',cake.topperB), filling: visualBase('fillings',cake.filling), fillingFrequency: options.amounts[cake.amount].frequency, fillingScale: 1 }
  });
  applyState();
  await window.whenAppearanceRenderIdle();
};

let contactResizeFrame = null;
addEventListener('resize', () => { window.CakeMaterialRenderer?.cancel(); window.CakeContactRenderer.cancel(); window.CakeGarnishRenderer.cancel(); if (contactResizeFrame !== null) cancelAnimationFrame(contactResizeFrame); contactResizeFrame = requestAnimationFrame(() => { contactResizeFrame = null; decorateIcing(); }); });
addEventListener('pagehide', () => {
  // Invalidate the entire coordinator chain synchronously. A contact/garnish
  // promise started before suspension must not enqueue material work later.
  decorateIcingRequest++;
  decorateIcingPromise = Promise.resolve(null);
  window.CakeMaterialRenderer?.cancel();
  window.CakeContactRenderer.cancel();
  window.CakeGarnishRenderer.cancel();
});
addEventListener('pageshow', event => { if (event.persisted) decorateIcing(); });
