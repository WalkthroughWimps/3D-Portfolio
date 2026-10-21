export const ART_SAMPLES = Object.freeze({
  gardenFloral: 'Garden · Floral',
  gardenSeasons: 'Garden · Seasons',
  gardenDusty: 'Garden · Dusty',
  gardenTrees: 'Garden · Season Trees',
  roomBedroom: 'Room · Bedroom',
  roomKitchen: 'Room · Kitchen',
  roomBathroom: 'Room · Bathroom',
  roomGrainy: 'Room · Grainy'
});

export const ART_FILES = Object.freeze({
  gardenFloral: 'Garden Floral.jpg', gardenSeasons: 'Garden Seasons.jpg',
  gardenDusty: 'Garden Dusty.jpg', gardenTrees: 'Garden Season Trees.jpg',
  roomBedroom: 'Room Bedroom.jpg', roomKitchen: 'Room Kitchen.jpg',
  roomBathroom: 'Room Bathroom.jpg', roomGrainy: 'Room Grainy.jpg'
});

export const LEGACY_SAMPLES = Object.freeze({
  portrait: 'gardenFloral', landscape: 'gardenSeasons', garden: 'gardenTrees', currents: 'roomKitchen'
});
export const resolveSample = id => Object.hasOwn(ART_SAMPLES, id) ? id : LEGACY_SAMPLES[id] || 'gardenFloral';

const gardenLines = Object.freeze(['Ideas take root.', 'I make with art', 'and code in bloom.']);
const roomLines = Object.freeze(['Ideas live here.', 'I shape art and code', 'into places to explore.']);
export const SAMPLE_LINES = Object.freeze(Object.fromEntries(Object.keys(ART_SAMPLES).map(id =>
  [id, id.startsWith('garden') ? gardenLines : roomLines])));

function circle(ctx, x, y, r, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function cover(ctx, image, size, x = 0, y = 0) {
  const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
  const edge = Math.min(width, height), sx = (width - edge) / 2, sy = (height - edge) / 2;
  ctx.drawImage(image, sx, sy, edge, edge, x, y, size, size);
}

/** Direct Cartesian artwork: every front-facing annulus samples this same sharp canvas. */
export function paintSample(canvas, sample, photo) {
  const ctx = canvas.getContext('2d'), size = canvas.width, center = size / 2;
  const lines = Array.isArray(sample?.lines) ? sample.lines : SAMPLE_LINES[sample] || [];
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, size, size);
  if (photo) cover(ctx, photo, size);
  else {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#69b9c1'); gradient.addColorStop(.52, '#d9889a'); gradient.addColorStop(1, '#f4c879');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
  }

  if (!lines.some(line => line.trim())) return;
  // Quiet the lower third while retaining the supplied perspective scene around the words.
  const shade = ctx.createLinearGradient(0, size * .62, 0, size * .96);
  shade.addColorStop(0, '#122b4400'); shade.addColorStop(.35, '#152d5799'); shade.addColorStop(1, '#122440bb');
  ctx.fillStyle = shade; ctx.fillRect(0, size * .62, size, size * .38);

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const scale = size / 2048;
  lines.forEach((line, index) => {
    if (!line) return;
    const y = [1455, 1630, 1805][index] * scale, maxWidth = [1550, 1450, 1210][index] * scale;
    let fontSize = 118 * scale; ctx.font = `900 ${fontSize}px Arial, sans-serif`;
    while (ctx.measureText(line).width > maxWidth && fontSize > 50 * scale) {
      fontSize -= 2 * scale; ctx.font = `900 ${fontSize}px Arial, sans-serif`;
    }
    const textWidth = Math.min(maxWidth, ctx.measureText(line).width), pad = 34 * scale;
    ctx.fillStyle = '#142b46b8'; ctx.beginPath();
    ctx.roundRect(center - textWidth / 2 - pad, y - fontSize - 13 * scale,
      textWidth + pad * 2, fontSize + 38 * scale, 30 * scale); ctx.fill();
    ctx.strokeStyle = '#142840'; ctx.lineWidth = 12 * scale; ctx.strokeText(line, center, y, maxWidth);
    ctx.fillStyle = '#fff9e9'; ctx.fillText(line, center, y, maxWidth);
  });
}

/** The reverse is deliberately stable abstract color, with no readable front content. */
export function paintRear(canvas) {
  const ctx = canvas.getContext('2d'), size = canvas.width, center = size / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center * 1.2);
  gradient.addColorStop(0, '#73406b'); gradient.addColorStop(.45, '#258e9b'); gradient.addColorStop(1, '#f4a356');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
  const colors = ['#ffe0a0', '#f48b88', '#7bd4cf', '#8a65a9', '#f6c66f', '#476b9d', '#e5f0bd'];
  for (let ring = 0; ring < 22; ring++) {
    const radius = 38 + ring * 27, cells = 8 + ring * 3;
    for (let cell = 0; cell < cells; cell++) {
      const start = (cell + ((ring * 13) % 11) / 11) / cells * Math.PI * 2;
      const width = (.3 + ((ring * 17 + cell * 29) % 61) / 100) / cells * Math.PI * 2;
      ctx.strokeStyle = colors[(ring * 5 + cell * 3) % colors.length]; ctx.lineWidth = 7 + (ring + cell) % 9;
      ctx.beginPath(); ctx.arc(center, center, radius, start, start + width); ctx.stroke();
    }
  }
  for (let i = 0; i < 18; i++) {
    const angle = i / 18 * Math.PI * 2, x = center + Math.cos(angle) * 105, y = center + Math.sin(angle) * 105;
    circle(ctx, x, y, 20 + (i * 7) % 19, colors[i % colors.length]);
  }
}
