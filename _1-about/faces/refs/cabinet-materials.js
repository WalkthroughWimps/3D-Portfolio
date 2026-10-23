// Cabinet-owned, deterministic 512px grain. A species is rasterized only when used.
const SIZE = 512;
const WOODS = Object.freeze({
  oak: {base: [174, 119, 66], range: 26, lines: 9, pore: 17, seed: 13},
  walnut: {base: [94, 59, 42], range: 20, lines: 7, pore: 11, seed: 29},
  mahogany: {base: [145, 67, 48], range: 17, lines: 12, pore: 7, seed: 47}
});
export const CABINET_MATERIALS = Object.freeze(['painted', ...Object.keys(WOODS), 'brushedMetal']);
export const isCabinetWood = name => Object.hasOwn(WOODS, name);
const fract = n => n - Math.floor(n);
const hash = (x, y, seed) => fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453);
const smooth = t => t * t * (3 - 2 * t);
function noise(x, y, seed, periodX, periodY) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const wrap = (value, period) => ((value % period) + period) % period;
  const a = hash(wrap(ix, periodX), wrap(iy, periodY), seed);
  const b = hash(wrap(ix + 1, periodX), wrap(iy, periodY), seed);
  const c = hash(wrap(ix, periodX), wrap(iy + 1, periodY), seed);
  const d = hash(wrap(ix + 1, periodX), wrap(iy + 1, periodY), seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

function makeGrain(THREE, name) {
  const profile = WOODS[name];
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d');
  const image = context.createImageData(SIZE, SIZE), pixels = image.data;
  const heightCanvas = document.createElement('canvas'); heightCanvas.width = heightCanvas.height = SIZE;
  const heightContext = heightCanvas.getContext('2d');
  const heightImage = heightContext.createImageData(SIZE, SIZE), heights = heightImage.data;
  // Long fibres run vertically. Slow lateral drift, fine pores and subtle
  // growth bands give the three species distinct character without striping.
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE;
    const drift = (noise(v * 3, 0, profile.seed, 3, 1) - .5) * .045 +
      (noise(v * 17, u * 2, profile.seed + 1, 17, 2) - .5) * .009;
    const t = u + drift;
    const broad = noise(t * profile.lines, v, profile.seed + 2, profile.lines, 1) - .5;
    const fibre = noise(t * 80, v * 2, profile.seed + 3, 80, 2) - .5;
    const pores = noise(t * 220, v * 92, profile.seed + 4, 220, 92);
    const pore = pores > .76 ? -(pores - .76) * profile.pore : 0;
    const tone = broad * profile.range * 1.7 + fibre * 8 + pore;
    const offset = (y * SIZE + x) * 4;
    for (let channel = 0; channel < 3; channel++)
      pixels[offset + channel] = Math.max(0, Math.min(255, profile.base[channel] + tone));
    pixels[offset + 3] = 255;
    const height = Math.max(0, Math.min(255, 128 + broad * 36 + fibre * 24 + pore * 2));
    heights[offset] = heights[offset + 1] = heights[offset + 2] = height;
    heights[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  heightContext.putImageData(heightImage, 0, 0);
  const color = new THREE.CanvasTexture(canvas), bump = new THREE.CanvasTexture(heightCanvas);
  color.colorSpace = THREE.SRGBColorSpace;
  bump.colorSpace = THREE.NoColorSpace;
  for (const texture of [color, bump]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  return {color, bump};
}

function makeBrushedMetal(THREE) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const image = context.createImageData(256, 256), pixels = image.data;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const streak = (noise(x / 256 * 179, y / 256, 71, 179, 1) - .5) * 12 +
      (noise(x / 256 * 251, y / 256 * 3, 73, 251, 3) - .5) * 5;
    const gray = 232 + streak, offset = (y * 256 + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = gray;
    pixels[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const color = new THREE.CanvasTexture(canvas), bump = new THREE.CanvasTexture(canvas);
  color.colorSpace = THREE.SRGBColorSpace;
  bump.colorSpace = THREE.NoColorSpace;
  for (const texture of [color, bump]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  return {color, bump};
}

export function createCabinetMaterialLibrary(THREE) {
  const textures = new Map();
  let disposed = false;
  return {
    get(name) {
      if (disposed || !(isCabinetWood(name) || name === 'brushedMetal')) return null;
      if (!textures.has(name)) textures.set(name, name === 'brushedMetal' ?
        makeBrushedMetal(THREE) : makeGrain(THREE, name));
      return textures.get(name);
    },
    setScale(scale) {
      for (const [name, pair] of textures) if (isCabinetWood(name))
        for (const texture of [pair.color, pair.bump])
          texture.repeat.set(scale, scale);
    },
    get count() { return textures.size; },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const pair of textures.values()) for (const texture of new Set([pair.color, pair.bump]))
        texture.dispose();
      textures.clear();
    }
  };
}
