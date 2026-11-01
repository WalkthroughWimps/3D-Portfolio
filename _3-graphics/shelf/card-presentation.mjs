import * as THREE from 'three';

// Real silhouettes: the atlas has square, white outside corners, but cards do not.
export function cardShape(half = .418, radius = .078) {
  const shape = new THREE.Shape();
  shape.moveTo(-half + radius, -half); shape.lineTo(half - radius, -half);
  shape.quadraticCurveTo(half, -half, half, -half + radius); shape.lineTo(half, half - radius);
  shape.quadraticCurveTo(half, half, half - radius, half); shape.lineTo(-half + radius, half);
  shape.quadraticCurveTo(-half, half, -half, half - radius); shape.lineTo(-half, -half + radius);
  shape.quadraticCurveTo(-half, -half, -half + radius, -half);
  return shape;
}
export function cardFaceGeometry(tile) {
  const geometry = new THREE.ShapeGeometry(cardShape(), 8);
  const positions = geometry.attributes.position, uv = geometry.attributes.uv;
  const col = tile % 4, row = Math.floor(tile / 4);
  for (let i = 0; i < positions.count; i++) {
    const x = (positions.getX(i) + .418) / .836, y = (positions.getY(i) + .418) / .836;
    uv.setXY(i, (col * 512 + .5 + x * 511) / 2048, 1 - ((row + 1) * 512 - .5 - y * 511) / 2048);
  }
  return geometry;
}
export function cardEdgeGeometry(thickness) {
  const geometry = new THREE.ExtrudeGeometry(cardShape(.42, .08), {depth:thickness,bevelEnabled:false,curveSegments:8});
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, -thickness / 2, 0);
  return geometry;
}

// Recolor only route pixels in the runtime texture. Keep source artwork intact,
// and exclude the colored city markers and blue connections from the route mask.
export function blackRouteTexture(image, map) {
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  const mask = document.createElement('canvas'); mask.width = canvas.width; mask.height = canvas.height;
  const ink = mask.getContext('2d'), nodes = new Map(map.nodes.map(node => [node.id, node]));
  const xy = node => [(node.p[0] / map.width + .5) * canvas.width, (node.p[1] / map.height + .5) * canvas.height];
  ink.strokeStyle = '#fff'; ink.lineWidth = canvas.width * .009; ink.lineCap = 'round';
  for (const [a, b] of map.edges) {
    if (!nodes.has(a) || !nodes.has(b)) continue;
    ink.beginPath(); ink.moveTo(...xy(nodes.get(a))); ink.lineTo(...xy(nodes.get(b))); ink.stroke();
  }
  ink.globalCompositeOperation = 'destination-out';
  for (const node of map.nodes) {
    ink.beginPath(); ink.arc(...xy(node), node.radius / map.width * canvas.width * 1.12, 0, Math.PI * 2); ink.fill();
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), region = ink.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < pixels.data.length; i += 4) {
    const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
    if (region[i + 3] > 32 && r > 80 && r > g * 1.4 && r > b * 1.35) {
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 24;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
