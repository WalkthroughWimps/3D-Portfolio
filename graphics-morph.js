// graphics-morph.js (basic single-path morph, no rotation)
// Load path `d` strings dynamically from SVG/Shapes-01..12.svg (first <path> in each),
// verify transparent container rect; start on a random shape fully formed.
const SHAPE_FILES = Array.from({ length: 12 }, (_, i) => `assets/svg/Shapes-${String(i + 1).padStart(2, '0')}.svg`);
const SHAPES = [];
let ART_W = 360, ART_H = 360; // default artboard size; validated from rect
let ABORTED = false;

async function loadShapes() {
  let firstRect = null;
  for (const file of SHAPE_FILES) {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
    const text = await res.text();
    // Verify transparent container rect and capture size
    const rectMatch = text.match(/<rect[^>]*\bwidth\s*=\s*"(\d+(?:\.\d+)?)"[^>]*\bheight\s*=\s*"(\d+(?:\.\d+)?)"[^>]*\bfill\s*=\s*"none"/i);
    if (!rectMatch) {
      console.error(`Transparent container rect missing in ${file}. Aborting.`);
      ABORTED = true;
      return;
    }
    const w = parseFloat(rectMatch[1]);
    const h = parseFloat(rectMatch[2]);
    if (!firstRect) {
      firstRect = { w, h };
      ART_W = w; ART_H = h;
    } else {
      // Enforce consistent artboard to avoid scale jitter
      if (Math.abs(w - firstRect.w) > 0.01 || Math.abs(h - firstRect.h) > 0.01) {
        console.error(`Artboard mismatch in ${file} (${w}x${h}) vs ${firstRect.w}x${firstRect.h}. Aborting.`);
        ABORTED = true;
        return;
      }
    }
    const m = text.match(/<path[^>]*\bd\s*=\s*"([^"]+)"/i);
    if (!m) throw new Error(`No <path d> found in ${file}`);
    SHAPES.push(m[1]);
  }
}

// Use CSS variables directly so colors follow the current theme and update if changed
const COLOR_FILL_VAR = 'var(--purple-secondary)';
const COLOR_STROKE_VAR = 'var(--orange-tertiary)';

// Elements
const basePath = document.getElementById('gearMorph');
let rotator = document.getElementById('morphRotator');

function init() {
  // Ensure the path sits directly under rotator (no extra wrappers)
  if (rotator && basePath && basePath.parentNode !== rotator) rotator.appendChild(basePath);
  ['gearMorphB','morphSlotATranslate','morphSlotBTranslate','morphSlotA','morphSlotB','morphTranslate'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el !== basePath && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });

  // Head circle and layout
  const headCircle = document.getElementById('head-inner');
  const CX = headCircle ? parseFloat(headCircle.getAttribute('cx')) : 45.7;
  const CY = headCircle ? parseFloat(headCircle.getAttribute('cy')) : 35.5;
  const R  = headCircle ? parseFloat(headCircle.getAttribute('r'))  : 23.1;
  const group = document.getElementById('morphGroup');

  // Fixed artboard centering to avoid jitter: translate to head center, scale by art size, translate to art center
  const s = Math.min((2 * R) / ART_W, (2 * R) / ART_H);
  const artCX = ART_W / 2;
  const artCY = ART_H / 2;
  if (group) group.setAttribute('transform', `translate(${CX},${CY}) scale(${s}) translate(${-artCX},${-artCY})`);

  // Per-shape offsets to align centers
  // No per-shape offsets; artboard centering keeps shapes pinned

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Style the base path
  const strokeW = basePath.getAttribute('stroke-width') || '4';
  // Prefer style properties with CSS vars so they recompute on theme changes
  basePath.style.fill = COLOR_FILL_VAR;
  basePath.style.stroke = COLOR_STROKE_VAR;
  basePath.setAttribute('stroke-width', strokeW);
  basePath.setAttribute('vector-effect', 'non-scaling-stroke');

  // Initialize with a random starting shape
  let idx = Math.floor(Math.random() * SHAPES.length);
  basePath.setAttribute('d', SHAPES[idx]); // start fully formed on random shape
  if (rotator) rotator.setAttribute('transform', 'rotate(0)');

  // Config
  const TRANSITION_MS = 750;
  const HOLD_MS = 2000;
  const EASING = 'linear'; // basic settings

  // Pick a random next index, excluding the current one (no direct repeats)
  const nextIndex = () => {
    const n = SHAPES.length;
    if (n <= 1) return 0;
    const r = Math.floor(Math.random() * (n - 1));
    return r >= idx ? r + 1 : r;
  };

  // Tweens
  let morphTween = null;
  let nextTimer = null;

  const morphTo = (n) => {
    // Stop previous tweens
    if (morphTween) morphTween.stop();
    if (nextTimer) { clearTimeout(nextTimer); nextTimer = null; }
    const D = reduced ? 0 : TRANSITION_MS;

    // Morph the single path
    morphTween = KUTE.fromTo(
      basePath,
      { path: SHAPES[idx] },
      { path: SHAPES[n]   },
      { duration: D, easing: EASING }
    ).start();

    // Fallback schedule (ensures consistent cadence even if complete not fired)
    if (nextTimer) clearTimeout(nextTimer);
    nextTimer = setTimeout(loop, D + HOLD_MS);

    idx = n;
  };

  const loop = () => morphTo(nextIndex());

  // Start fully formed on shape-01; wait HOLD_MS before first morph
  if (SHAPES.length > 1) setTimeout(loop, HOLD_MS);
}

(async () => {
  try {
    await loadShapes();
    if (ABORTED) return;
    if (!basePath || SHAPES.length === 0) {
      console.warn('gearMorph not found or no SHAPES provided.');
      return;
    }
    init();
  } catch (err) {
    console.error(err);
  }
})();
