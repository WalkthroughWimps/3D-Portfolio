import {createRefsCabinet} from './cabinet.js';
import {CABINET_MATERIALS} from './cabinet-materials.js';
import {createRefsSelectorBacking} from './selector-backing.js';
import {createRefsSelector} from './selector.js';
import {createRefsPlateHousing} from './plate-housing.js';
import {createRefsSphericalIris} from './spherical-iris.js';
import {createRefsGlassDisplay} from './glass-display.js';
import {createRefsPortraitWindow} from './portrait-window.js';
import {normalizeRefsPlate, REFS_MAX_PLATES} from './plate-art.js';
import {getRefsCompartmentContours} from './contours.js';
import {createRefsDoors} from './doors.js';
import {createRefsCabinetInteriors} from './cabinet-interiors.js';
import {createRefsButterfly} from './butterfly.js';
import {createRefsFaceOperations} from './face-operations.js';
import {normalizeRefsDoors, REFS_DEFAULT_DOORS} from './door-options.js';
import {REFS_ORIGINAL_QUOTE_TEXTS} from './reference-quotes.js';
import {REFS_EXPORTED_DEFAULTS} from './exported-defaults.js';
export {REFS_DOOR_IDS} from './door-options.js';
export {REFS_MAX_PLATES} from './plate-art.js';

const SNAP_RADIUS = 318;
// Give the largest supported aspect and guide circle room without changing
// the default sketch's world-space footprint (1536px on a 3-unit plane).
const CANVAS_SIZE = 1536;
const DRAWING_SCALE = 1.25;
const WORLD_PER_DRAWING_UNIT = DRAWING_SCALE * 3 / CANVAS_SIZE;
const FACE_OPENING_RADIUS = 333;
// The authored About-face preset is the single source of startup/reset values.
export const REFS_DEFAULT_OPTIONS = Object.freeze({
  ...REFS_EXPORTED_DEFAULTS,
  doors: REFS_DEFAULT_DOORS,
  plates: Object.freeze(REFS_EXPORTED_DEFAULTS.plates.map(plate => Object.freeze({...plate})))
});
const limits = Object.freeze({scale: [.6, 1.4], width: [.7, 1.3], height: [.7, 1.3],
  x: [-.35, .35], y: [-.35, .35], angle: [-Math.PI, Math.PI], roundness: [0, 1],
  portraitRadius: [48, 105], apertureRadius: [95, 170], baySpacing: [175, 240],
  bayWidth: [35, 80], lineWeight: [.5, 2], opacity: [0, 1],
  cabinetDepth: [.04, .45], cabinetPosition: [-.5, .5], wallThickness: [.008, .05], irisBulgeRatio: [.03, 1],
  irisOpening: [0, 100], irisSize: [.35, 1],
  glassClarity: [0, 1], glassPolish: [0, 1], glassCurvature: [0, 1],
  cabinetWoodTint: [0, 1], cabinetGrainScale: [.5, 2], cabinetSheen: [0, 1],
  portraitFrameWidthRatio: [.14, .28],
  plateCount: [1, REFS_MAX_PLATES], plateSpacing: [.008, .06], plateIndex: [0, REFS_MAX_PLATES - 1],
  selectorAngle: [35, 80], selectorSpeed: [.4, 2], doorSpeed: [.2, 4]});
export const REFS_OPTION_LIMITS = limits;
// Frames use the Illustrator plate's drawing coordinates: x grows to face-right,
// y grows downward. The 365,405 origin is the middle of the square texture.
export const REFS_ELEMENT_IDS = Object.freeze(['container', 'portrait', 'aperture',
  'leftBay', 'rightBay', 'leftCrescent', 'rightCrescent', 'leftArch',
  'rightArch', 'plaque', 'leftHinge', 'rightHinge']);
const pairs = Object.freeze({leftBay: 'rightBay', rightBay: 'leftBay',
  leftCrescent: 'rightCrescent', rightCrescent: 'leftCrescent',
  leftArch: 'rightArch', rightArch: 'leftArch', leftHinge: 'rightHinge', rightHinge: 'leftHinge'});
const frame = (x, y, width, height) => ({x, y, width, height});
export function diagramToCanvas({x, y}, input = REFS_DEFAULT_OPTIONS) {
  const p = normalizeRefsOptions(input);
  return {x: CANVAS_SIZE / 2 + (x - 365) * DRAWING_SCALE * p.width,
    y: CANVAS_SIZE / 2 + (y - 405) * DRAWING_SCALE * p.height};
}
export function canvasToDiagram({x, y}, input = REFS_DEFAULT_OPTIONS) {
  const p = normalizeRefsOptions(input);
  return {x: 365 + (x - CANVAS_SIZE / 2) / (DRAWING_SCALE * p.width),
    y: 405 + (y - CANVAS_SIZE / 2) / (DRAWING_SCALE * p.height)};
}
/** Source diagram x-right/y-down to upright face x-right/z-up, in world units. */
export function diagramToFace({x, y}, input = REFS_DEFAULT_OPTIONS) {
  const p = normalizeRefsOptions(input), angle = p.angle;
  const dx = (x - 365) * WORLD_PER_DRAWING_UNIT * p.width;
  const dz = (405 - y) * WORLD_PER_DRAWING_UNIT * p.height;
  return {x: p.x + p.scale * (Math.cos(angle) * dx + Math.sin(angle) * dz),
    z: p.y + p.scale * (-Math.sin(angle) * dx + Math.cos(angle) * dz)};
}
export function faceToDiagram({x, z}, input = REFS_DEFAULT_OPTIONS) {
  const p = normalizeRefsOptions(input), angle = p.angle;
  const dx = (x - p.x) / p.scale, dz = (z - p.y) / p.scale;
  return {x: 365 + (Math.cos(angle) * dx - Math.sin(angle) * dz) / (WORLD_PER_DRAWING_UNIT * p.width),
    y: 405 - (Math.sin(angle) * dx + Math.cos(angle) * dz) / (WORLD_PER_DRAWING_UNIT * p.height)};
}
function getBaseFrames(p) {
  const r = p.portraitRadius, a = p.apertureRadius;
  const b = p.bayWidth, d = p.baySpacing;
  const base = {
    // Curio's adjustable side bow can extend beyond the original 636-wide shell.
    container: frame(365, 405.5, p.outline === 'curio' ? Math.max(636, 2 * (660 + 23 * p.roundness / .5 - 365)) : 636, 637),
    portrait: frame(365, 205, r * 2, r * 2),
    aperture: frame(365, 459, a * 2, a * 2),
    leftBay: frame(365 - d, 425.5, b, 279), rightBay: frame(365 + d, 425.5, b, 279),
    leftCrescent: frame(89, 405.5, 38, 175), rightCrescent: frame(641, 405.5, 38, 175),
    leftArch: frame(253, 627.5, 60, 81), rightArch: frame(477, 627.5, 60, 81),
    plaque: frame(365, 653, 121, 54),
    leftHinge: frame(170, 418.5, 10, 475), rightHinge: frame(560, 418.5, 10, 475)
  };
  return base;
}
export function getRefsElementFrames(options = REFS_DEFAULT_OPTIONS) {
  const p = normalizeRefsOptions(options), base = getBaseFrames(p);
  return Object.fromEntries(REFS_ELEMENT_IDS.map(id => [id, {...base[id], ...p.elements[id]}]));
}
/** Editor hit targets and the canvas renderer use these same resolved frames. */
export function getRefsElementDescriptors(options = REFS_DEFAULT_OPTIONS) {
  const p = normalizeRefsOptions(options), frames = getRefsElementFrames(p);
  return REFS_ELEMENT_IDS.map(id => ({id, frame: frames[id], pairedId: pairs[id] ?? null,
    canvasFrame: {...diagramToCanvas(frames[id], p),
      width: frames[id].width * DRAWING_SCALE * p.width,
      height: frames[id].height * DRAWING_SCALE * p.height},
    hitType: id.includes('Hinge') ? 'axis' : ['portrait', 'aperture'].includes(id) ? 'ellipse' : 'shape',
    visible: !id.includes('Hinge') || (p.hinges && p[id])}));
}
/** Patch one frame. Mirroring copies its size/y and reflects x around the plate center. */
export function patchRefsElement(options, id, patch) {
  const current = normalizeRefsOptions(options);
  if (!REFS_ELEMENT_IDS.includes(id)) return current;
  const source = getRefsElementFrames(current)[id];
  const next = {...source, ...patch};
  const elements = {...current.elements, [id]: next};
  if (current.pairLinked && pairs[id]) elements[pairs[id]] = {...next, x: 730 - next.x};
  return normalizeRefsOptions({...current, elements});
}
/** A deliberate base-size edit also updates an existing custom frame. */
export function patchRefsSizeOption(options, key, value) {
  const current = normalizeRefsOptions(options);
  const next = normalizeRefsOptions({...current, [key]: value});
  const affected = {apertureRadius: ['aperture'], portraitRadius: ['portrait'],
    bayWidth: ['leftBay', 'rightBay'], baySpacing: ['leftBay', 'rightBay']}[key];
  if (!affected) return next;
  const before = getRefsElementFrames(current), baseBefore = getBaseFrames(current), baseAfter = getBaseFrames(next);
  const elements = {...next.elements};
  for (const id of affected) {
    if (!elements[id]) continue;
    const old = before[id], from = baseBefore[id], to = baseAfter[id];
    elements[id] = {...elements[id], x: old.x + to.x - from.x,
      width: ['apertureRadius', 'portraitRadius'].includes(key) ? 2 * next[key] :
        key === 'bayWidth' ? next[key] : old.width + to.width - from.width,
      height: ['apertureRadius', 'portraitRadius'].includes(key) ? 2 * next[key] :
        old.height + to.height - from.height};
  }
  return normalizeRefsOptions({...next, elements});
}
export function normalizeRefsOptions(value = {}) {
  const result = {...REFS_DEFAULT_OPTIONS};
  for (const [key, [min, max]] of Object.entries(limits)) {
    const number = Number(value[key]);
    if (Number.isFinite(number)) result[key] = Math.max(min, Math.min(max, number));
  }
  // Enlarge the former default once; preserve custom sizes and subsequent
  // intentional adjustments, including a versioned .8 selection.
  if (Number(value.quoteDisplayVersion) < 2 || value.quoteDisplayVersion === undefined) {
    if (Number(value.irisSize) === .8) result.irisSize = 1;
  }
  result.quoteDisplayVersion = 2;
  result.plateCount = Math.round(result.plateCount);
  // Earlier archives carried five default plates and had no content schema.
  // A versioned five-plate set is an intentional new choice.
  if (value.platesVersion !== 1 && (value.plateCount === undefined || Number(value.plateCount) === 5))
    result.plateCount = 7;
  const hasIncomingPlates = Array.isArray(value.plates);
  const assignOriginalQuotes = hasIncomingPlates && value.originalQuotesVersion !== 1;
  if (assignOriginalQuotes) result.plateCount = Math.max(3, result.plateCount);
  result.plateIndex = Math.max(0, Math.min(result.plateCount - 1, Math.round(result.plateIndex)));
  result.platesVersion = 1;
  const incomingPlates = hasIncomingPlates ? value.plates : REFS_DEFAULT_OPTIONS.plates;
  result.plates = Array.from({length: Math.min(REFS_MAX_PLATES,
    Math.max(result.plateCount, incomingPlates.length))}, (_, index) => {
    const plate = normalizeRefsPlate(incomingPlates[index] ?? REFS_DEFAULT_OPTIONS.plates[index]);
    // Apply the requested assignment once, retaining photos, colors and crop.
    // Later edits or intentionally blank text remain editable after saving.
    if (assignOriginalQuotes && index < REFS_ORIGINAL_QUOTE_TEXTS.length)
      plate.text = REFS_ORIGINAL_QUOTE_TEXTS[index];
    return plate;
  });
  result.originalQuotesVersion = 1;
  result.doors = normalizeRefsDoors(value.doors);
  if (typeof value.butterflyEnabled === 'boolean') result.butterflyEnabled = value.butterflyEnabled;
  if (Object.hasOwn(result.doors, value.butterflyHost)) result.butterflyHost = value.butterflyHost;
  if (['curio', 'rounded', 'circular'].includes(value.outline)) result.outline = value.outline;
  if (['precision', 'sketch'].includes(value.style)) result.style = value.style;
  for (const key of ['cabinetFaceMaterial', 'cabinetSideMaterial'])
    if (CABINET_MATERIALS.includes(value[key])) result[key] = value[key];
  for (const key of ['ink', 'accent', 'cabinetFaceColor', 'cabinetSideColor', 'cabinetTrimColor',
    'glassBackingColor', 'glassTint', 'plateLightColor'])
    if (typeof value[key] === 'string' && /^#[\da-f]{6}$/i.test(value[key])) result[key] = value[key];
  for (const key of ['innerTrim', 'guides', 'anchors', 'opening', 'hinges', 'leftHinge', 'rightHinge', 'pairLinked',
    'cabinetEnabled', 'cabinetFrontEnabled', 'cabinetCutaway', 'selectorBackingEnabled',
    'housingEnabled', 'mechanismEnabled', 'dummyIrisEnabled', 'glassDisplayEnabled',
    'portraitWindowEnabled', 'portraitGlassEnabled', 'portraitLockEnabled'])
    if (typeof value[key] === 'boolean') result[key] = value[key];
  const incoming = value.elements && typeof value.elements === 'object' && !Array.isArray(value.elements) ? value.elements : {};
  result.elements = {};
  for (const id of REFS_ELEMENT_IDS) {
    const candidate = incoming[id];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const clean = {};
    for (const key of ['x', 'y', 'width', 'height']) {
      const n = Number(candidate[key]);
      if (Number.isFinite(n)) clean[key] = Math.max(key === 'width' || key === 'height' ? 8 : -1000,
        Math.min(key === 'width' || key === 'height' ? 760 : 1000, n));
    }
    if (Object.keys(clean).length) {
      // Reserve a 16px transparent border even at the widest legacy aspect.
      const base = getBaseFrames(result)[id];
      for (const axis of ['x', 'y']) {
        const extent = axis === 'x' ? 'width' : 'height';
        const origin = axis === 'x' ? 365 : 405;
        const half = (CANVAS_SIZE / 2 - 16) / (DRAWING_SCALE * 1.3);
        const size = clean[extent] ?? base[extent];
        clean[axis] = Math.max(origin - half + size / 2,
          Math.min(origin + half - size / 2, clean[axis] ?? base[axis]));
      }
      result.elements[id] = clean;
    }
  }
  return result;
}

/** Compass construction points stay visible as small, quiet drafting marks. */
export const REFS_SNAP_POINTS = Object.freeze([
  ['n', 0, 1], ['ne', Math.SQRT1_2, Math.SQRT1_2], ['e', 1, 0],
  ['se', Math.SQRT1_2, -Math.SQRT1_2], ['s', 0, -1],
  ['sw', -Math.SQRT1_2, -Math.SQRT1_2], ['w', -1, 0],
  ['nw', -Math.SQRT1_2, Math.SQRT1_2]
].map(([id, x, z]) => Object.freeze({id, x, z})));

export const REFS_LAYOUT = Object.freeze({labelOffset: .074});

// Use the same contrast response curve as the shared cube interior.
export function refsContrastGain(value = .5) {
  const c = Math.max(0, Math.min(1, Number.isFinite(value) ? value : .5));
  return .08 + (2.4 - .08) * c * c * (3 - 2 * c);
}

/** Single sampled container path for the ink line and cabinet wall. Diagram units. */
export function getRefsContainerContour(input = REFS_DEFAULT_OPTIONS) {
  const options = normalizeRefsOptions(input);
  const cubicSteps = options.style === 'precision' ? 72 : 18;
  const arcSteps = options.style === 'precision' ? 96 : 48;
  const right = [];
  const line = (x, y) => right.push({x, y});
  const cubic = (a, b, c, d, e, f) => {
    const from = right.at(-1);
    for (let i = 1; i <= cubicSteps; i++) {
      const t = i / cubicSteps, u = 1 - t;
      line(u ** 3 * from.x + 3 * u ** 2 * t * a + 3 * u * t ** 2 * c + t ** 3 * e,
        u ** 3 * from.y + 3 * u ** 2 * t * b + 3 * u * t ** 2 * d + t ** 3 * f);
    }
  };
  const arc = (cx, cy, r, start, end) => {
    for (let i = 1; i <= arcSteps; i++) {
      const angle = start + (end - start) * i / arcSteps;
      line(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
  };
  line(365, 87);
  if (options.outline === 'circular') arc(365, 405, 318, -Math.PI / 2, Math.PI / 2);
  else if (options.outline === 'rounded') {
    line(391, 87); arc(391, 379, 292, -Math.PI / 2, 0);
    line(683, 432); arc(391, 432, 292, 0, Math.PI / 2); line(365, 724);
  } else {
    cubic(468, 87, 560, 114, 560, 153); line(560, 181);
    cubic(560, 198, 576, 211, 594, 211); line(618, 211); line(660, 276);
    const bow = 660 + 23 * options.roundness / .5;
    cubic(676.8, 302, bow, 354, bow, 405);
    cubic(bow, 456, 676.8, 515.6, 660, 536);
    line(618, 587); line(594, 587);
    cubic(577, 587, 560, 600, 560, 618); line(560, 656);
    cubic(560, 704, 461, 724, 365, 724);
  }
  const points = [...right, ...right.slice(1, -1).reverse().map(p => ({x: 730 - p.x, y: p.y}))];
  const base = getBaseFrames(options).container;
  const target = getRefsElementFrames(options).container;
  return points.map(p => ({x: target.x + (p.x - base.x) * target.width / base.width,
    y: target.y + (p.y - base.y) * target.height / base.height}));
}

/** Draw the exact texture geometry into any 1536px square 2D context. */
export function drawRefsSketch(ctx, input = REFS_DEFAULT_OPTIONS) {
  const options = normalizeRefsOptions(input);
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  const center = {x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2};
  const point = (x, y) => ({x: center.x + (x - 365) * DRAWING_SCALE,
    y: center.y + (y - 405) * DRAWING_SCALE});
  const path = draw => { ctx.beginPath(); draw(); };
  const frames = getRefsElementFrames(options);
  const original = getRefsElementFrames({...options, elements: {}});
  const compartments = getRefsCompartmentContours(original, frames);
  function compartmentPath(id) {
    const contour = compartments[id], first = point(contour[0].x, contour[0].y);
    ctx.moveTo(first.x, first.y);
    for (const vertex of contour.slice(1)) {
      const p = point(vertex.x, vertex.y); ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }
  function element(id, draw) {
    const a = original[id], b = frames[id];
    ctx.save();
    const c = point(a.x, a.y), target = point(b.x, b.y);
    ctx.translate(target.x, target.y);
    ctx.scale(b.width / a.width, b.height / a.height);
    ctx.translate(-c.x, -c.y);
    draw();
    ctx.restore();
  }
  // The opening and compass marks describe the fixed face, independent of art layout.
  if (options.opening) {
    ctx.save(); ctx.strokeStyle = options.accent; ctx.globalAlpha = .82;
    ctx.lineWidth = 2.8 * options.lineWeight;
    ctx.beginPath(); ctx.arc(center.x, center.y, FACE_OPENING_RADIUS * DRAWING_SCALE, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  // Stretch the art, including its frames and trim, around the texture center.
  ctx.save(); ctx.translate(center.x, center.y); ctx.scale(options.width, options.height);
  ctx.translate(-center.x, -center.y);

  function sketch(draw, color = options.ink, width = 2.7) {
    const visibleWidth = width * 1.55 * options.lineWeight;
    if (options.style === 'sketch') {
      ctx.save(); ctx.translate(1.25, -.8); ctx.globalAlpha = .24;
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.4, visibleWidth * .58);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; path(draw);
      // Path coordinates already include the element transform. Stroke in canvas
      // pixels so a narrow detail widened in the editor keeps a usable pen width.
      ctx.resetTransform(); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = .98; ctx.lineWidth = visibleWidth;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; path(draw);
    ctx.resetTransform(); ctx.stroke(); ctx.restore();
  }

  // B: the ink and cabinet wall consume the same resolved contour.
  sketch(() => {
    const contour = getRefsContainerContour(options);
    const first = point(contour[0].x, contour[0].y); ctx.moveTo(first.x, first.y);
    for (const vertex of contour.slice(1)) {
      const p = point(vertex.x, vertex.y); ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }, options.ink, 3.1);

  // C: upper portrait medallion with its concentric frame ring.
  sketch(() => compartmentPath('portrait'), options.ink, 2.8);
  if (options.innerTrim) element('portrait', () => sketch(() => {
    const p = point(365, 205); ctx.arc(p.x, p.y, (options.portraitRadius - 7) * DRAWING_SCALE, 0, Math.PI * 2);
  }, options.accent, 1.7));

  // D: main aperture and narrow concentric rim.
  sketch(() => compartmentPath('aperture'), options.ink, 3.1);
  if (options.innerTrim) element('aperture', () => sketch(() => {
    const p = point(365, 459); ctx.arc(p.x, p.y, (options.apertureRadius - 8) * DRAWING_SCALE, 0, Math.PI * 2);
  }, options.accent, 1.8));

  // E/F: paired vertical bays, drawn separately so both remain easy to edit.
  for (const sign of [-1, 1]) {
    const id = sign < 0 ? 'leftBay' : 'rightBay';
    const x = 365 + sign * options.baySpacing - options.bayWidth / 2;
    sketch(() => compartmentPath(id), options.ink, 2.6);
    if (options.innerTrim) element(id, () => sketch(() => { const a = point(x + 6, 292), b = point(x + options.bayWidth - 6, 559);
      ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y); }, options.accent, 1.3));
  }

  // G/H: shallow crescent pockets that follow the outside sweep.
  sketch(() => compartmentPath('leftCrescent'), options.ink, 2.8);
  sketch(() => compartmentPath('rightCrescent'), options.ink, 2.8);

  // I/J: lower bays with semicircular crowns and short flat baselines.
  for (const sign of [-1, 1]) {
    sketch(() => compartmentPath(sign < 0 ? 'leftArch' : 'rightArch'), options.ink, 2.7);
  }

  // K: lower center plaque bay.
  sketch(() => compartmentPath('plaque'), options.ink, 2.8);

  // Source plate: dashed hinge axes at x=170/560, y=181..656. No depth or hardware.
  if (options.hinges) for (const [id, x, visible] of [
    ['leftHinge', 170, options.leftHinge], ['rightHinge', 560, options.rightHinge]
  ]) if (visible) element(id, () => {
    ctx.save(); ctx.setLineDash([7, 5]);
    sketch(() => { const a = point(x, 181), b = point(x, 656);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }, options.accent, 1.2);
    ctx.restore();
  });

  ctx.restore();
  // Faint construction centerline and the eight compass snap marks.
  if (options.guides) {
    ctx.save(); ctx.strokeStyle = options.accent; ctx.globalAlpha = .34; ctx.lineWidth = 1.5; ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.moveTo(center.x, center.y - 444); ctx.lineTo(center.x, center.y + 444); ctx.stroke(); ctx.restore();
  }
  if (options.anchors) for (const snap of REFS_SNAP_POINTS) {
    const p = point(365 + snap.x * SNAP_RADIUS, 405 - snap.z * SNAP_RADIUS);
    ctx.save(); ctx.strokeStyle = 'rgba(103, 207, 208, .72)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(p.x, p.y, 4.2, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - 8, p.y); ctx.lineTo(p.x + 8, p.y);
    ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x, p.y + 8); ctx.stroke(); ctx.restore();
  }

}

function createCabinetSketch(options) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE; canvas.height = CANVAS_SIZE;
  drawRefsSketch(canvas.getContext('2d'), options);
  return canvas;
}

export function createRefsSnapBoard(THREE) {
  const root = new THREE.Group(); root.name = 'refs.layout.anchor-board.v1';
  const carrier = new THREE.Group(); carrier.name = 'refs.screen-upright-carrier'; root.add(carrier);
  const placement = new THREE.Group(); placement.name = 'refs.face-local-placement'; carrier.add(placement);
  let options = normalizeRefsOptions(REFS_DEFAULT_OPTIONS);
  let texture = new THREE.CanvasTexture(createCabinetSketch(options));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({map: texture, color: '#ffffff', transparent: true,
    opacity: .68, depthWrite: false, side: THREE.DoubleSide, toneMapped: false});
  const geometry = new THREE.PlaneGeometry(3, 3);
  const sketch = new THREE.Mesh(geometry, material); sketch.name = 'refs.cabinet.shape-map';
  sketch.rotation.order = 'YXZ';
  sketch.rotation.x = Math.PI / 2;
  sketch.position.y = -.08;
  placement.add(sketch);

  let disposed = false, contrast = refsContrastGain(.5), clearanceProbe = null, clearance = null;
  const cabinet = createRefsCabinet(THREE, placement, options, contrast);
  const plateHousing = createRefsPlateHousing(THREE, placement, options, cabinet.getMetrics(), contrast);
  const iris = createRefsSphericalIris(THREE, placement, options, cabinet.getMetrics(), contrast);
  iris.setCabinetMaterials(cabinet.getDoorMaterialSources());
  const glassDisplay = createRefsGlassDisplay(THREE, iris, options, contrast);
  cabinet.setPocket(iris.root.visible ? iris.getPocket() : null);
  const selectorBacking = createRefsSelectorBacking(THREE, placement, options,
    cabinet.getMetrics(), contrast, iris.getPocket());
  const doors = createRefsDoors(THREE, placement, options, cabinet.getMetrics(), contrast);
  doors.setCabinetMaterials(cabinet.getDoorMaterialSources());
  const cabinetInteriors = createRefsCabinetInteriors(THREE, doors, options, cabinet.getMetrics(), contrast);
  cabinetInteriors.setCabinetMaterials(cabinet.getDoorMaterialSources());
  const butterfly = createRefsButterfly(THREE, placement, doors, options);
  const selector = createRefsSelector(THREE, placement, options, cabinet.getMetrics(), contrast);
  const displayText = state => glassDisplay.setText(options.plates[state.currentIndex]?.text ?? '');
  const unsubscribeDisplayText = selector.subscribe(displayText);
  displayText(selector.getState());
  const portraitWindow = createRefsPortraitWindow(THREE, placement, options, cabinet.getMetrics(), contrast);
  const faceOperations = createRefsFaceOperations(placement, options, cabinet.getMetrics(), contrast, iris.getState());
  const listeners = new Set();
  function applyAppearance() {
    placement.scale.setScalar(options.scale);
    placement.position.set(options.x, 0, options.y);
    placement.rotation.y = options.angle;
    sketch.position.y = options.cabinetEnabled ? cabinet.getMetrics().frontY - .002 : -.08;
    material.opacity = Math.min(1, options.opacity / REFS_DEFAULT_OPTIONS.opacity * (.28 + .72 * contrast / 2.4));
  }
  applyAppearance();
  function configure(next, previous, redraw) {
    if (redraw || ['cabinetEnabled', 'cabinetFrontEnabled', 'cabinetCutaway', 'cabinetDepth', 'wallThickness'].some(
      key => next[key] !== previous[key])) cabinet.rebuild(next);
    cabinet.configureAppearance(next);
    iris.configure(next, cabinet.getMetrics());
    iris.setCabinetMaterials(cabinet.getDoorMaterialSources());
    cabinet.setPocket(iris.root.visible ? iris.getPocket() : null);
    selector.configure(next, cabinet.getMetrics());
    glassDisplay.configure(next);
    displayText(selector.getState());
    selectorBacking.configure(next, cabinet.getMetrics(), iris.root.visible ? iris.getPocket() : null);
    doors.configure(next, cabinet.getMetrics());
    doors.setCabinetMaterials(cabinet.getDoorMaterialSources());
    cabinetInteriors.configure(next, cabinet.getMetrics());
    cabinetInteriors.setCabinetMaterials(cabinet.getDoorMaterialSources());
    butterfly.configure(next);
    plateHousing.configure(next, cabinet.getMetrics());
    portraitWindow.configure(next, cabinet.getMetrics());
    faceOperations.configure(next, cabinet.getMetrics(), iris.getState());
  }
  return {
    root, carrier, placement, sketch, cabinet, cabinetInteriors, butterfly, selectorBacking, plateHousing, iris, glassDisplay, selector, portraitWindow, faceOperations, doors,
    getOptions() { return {...options, plates: options.plates.map(plate => ({...plate})),
      elements: Object.fromEntries(Object.entries(options.elements).map(([id, value]) => [id, {...value}])),
      doors: Object.fromEntries(Object.entries(options.doors).map(([id, value]) => [id, {...value}]))}; },
    getElementFrames() { return getRefsElementFrames(options); },
    getElementDescriptors() { return getRefsElementDescriptors(options); },
    getMetrics() { return cabinet.getMetrics(); },
    getClearance() { return clearance && {...clearance}; },
    setClearanceProbe(probe) {
      clearanceProbe = typeof probe === 'function' ? probe : null;
      return this.setOptions({});
    },
    getSelectorState() { return selector.getState(); },
    subscribeSelector(listener) { return selector.subscribe(listener); },
    selectPlate(index) { return this.setOptions({plateIndex: index}); },
    getPlate(index) {
      const slot = Number(index);
      return Number.isInteger(slot) && slot >= 0 && slot < REFS_MAX_PLATES ?
        {...(options.plates[slot] ?? {image: '', text: ''})} : null;
    },
    updatePlate(index, patch) {
      const slot = Number(index);
      if (!Number.isInteger(slot) || slot < 0 || slot >= REFS_MAX_PLATES ||
          !patch || typeof patch !== 'object' || Array.isArray(patch)) return this.getOptions();
      const plates = options.plates.map(plate => ({...plate}));
      while (plates.length <= slot) plates.push({image: '', text: ''});
      plates[slot] = normalizeRefsPlate({...plates[slot], ...patch});
      return this.setOptions({plates});
    },
    addPlate() {
      if (options.plateCount >= REFS_MAX_PLATES) return this.getOptions();
      return this.setOptions({plateCount: options.plateCount + 1,
        plateIndex: options.plateCount});
    },
    nextPlate() { return this.selectPlate((options.plateIndex + 1) % options.plateCount); },
    previousPlate() { return this.selectPlate((options.plateIndex + options.plateCount - 1) % options.plateCount); },
    update(dt) { selector.update(dt); iris.update(dt); doors.setWallpaperTexture(selectorBacking.getWallpaperTexture()); doors.update(dt); butterfly.update(dt); },
    setReducedMotion(value) { selector.setReducedMotion(value); iris.setReducedMotion(value); doors.setReducedMotion(value); butterfly.setReducedMotion(value); },
    suspend() { selector.suspend(); iris.suspend(); doors.suspend(); butterfly.suspend(); },
    resume() { selector.resume(); iris.resume(); doors.resume(); butterfly.resume(); },
    setViewContext(context) { butterfly.setViewContext(context); },
    getDoorState(id) { return doors.getState(id); },
    getDoorStates() { return doors.getStates(); },
    subscribeDoors(listener) { return doors.subscribe(listener); },
    getDoorOptions(id) { return options.doors[id] ? {...options.doors[id]} : null; },
    getPortal(id) { return doors.getPortal(id); },
    updateDoor(id, patch) {
      if (!Object.hasOwn(options.doors, id) || !patch || typeof patch !== 'object') return this.getOptions();
      return this.setOptions({doors: {...options.doors, [id]: {...options.doors[id], ...patch}}});
    },
    setDoorOpen(id, open) { return this.updateDoor(id, {open: Boolean(open)}); },
    toggleDoor(id) { const door = this.getDoorOptions(id); return door && this.setDoorOpen(id, !door.open); },
    patchElement(id, patch) { return this.setOptions(patchRefsElement(options, id, patch)); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setOptions(patch) {
      if (disposed) return {...options};
      const previousOptions = options;
      const nextOptions = normalizeRefsOptions({...options, ...patch});
      const redraw = ['width', 'height', 'outline', 'roundness', 'portraitRadius',
        'apertureRadius', 'baySpacing', 'bayWidth', 'lineWeight', 'ink', 'accent',
        'innerTrim', 'guides', 'anchors', 'opening', 'style', 'hinges',
        'leftHinge', 'rightHinge'].some(key => nextOptions[key] !== options[key]) ||
        JSON.stringify(nextOptions.elements) !== JSON.stringify(options.elements);
      options = nextOptions;
      configure(options, previousOptions, redraw);
      if (clearanceProbe && !(Object.keys(patch).length === 1 && Object.hasOwn(patch, 'irisOpening'))) {
        clearance = clearanceProbe(this);
        clearance = {...clearance, requestedDepth: nextOptions.cabinetDepth,
          appliedDepth: options.cabinetDepth};
      }
      if (redraw) {
        const next = new THREE.CanvasTexture(createCabinetSketch(options));
        next.colorSpace = THREE.SRGBColorSpace; next.anisotropy = 4;
        material.map = next; material.needsUpdate = true;
        texture.dispose(); texture = next;
      }
      applyAppearance();
      const snapshot = this.getOptions();
      for (const listener of listeners) listener(snapshot);
      return snapshot;
    },
    setContrast(gain) {
      contrast = Number.isFinite(gain) ? Math.max(0, Math.min(2.4, gain)) : refsContrastGain(.5);
      cabinet.setContrast(contrast);
      doors.setCabinetMaterials(cabinet.getDoorMaterialSources());
      cabinetInteriors.setCabinetMaterials(cabinet.getDoorMaterialSources());
      cabinetInteriors.setContrast(contrast);
      selector.setContrast(contrast);
      selectorBacking.setContrast(contrast);
      plateHousing.setContrast(contrast);
      iris.setContrast(contrast);
      iris.setCabinetMaterials(cabinet.getDoorMaterialSources());
      glassDisplay.setContrast(contrast);
      portraitWindow.setContrast(contrast);
      faceOperations.setContrast(contrast);
      doors.setContrast(contrast);
      applyAppearance();
    },
    dispose() {
      if (disposed) return; disposed = true;
      listeners.clear();
      unsubscribeDisplayText();
      selector.dispose();
      selectorBacking.dispose();
      plateHousing.dispose();
      glassDisplay.dispose();
      iris.dispose();
      portraitWindow.dispose();
      faceOperations.dispose();
      cabinetInteriors.dispose();
      butterfly.dispose();
      doors.dispose();
      cabinet.dispose();
      root.removeFromParent(); geometry.dispose(); texture.dispose(); material.dispose();
    }
  };
}

