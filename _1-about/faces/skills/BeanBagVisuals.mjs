import * as THREE from 'three';

export const BEAN_BAG_COLORS = Object.freeze(['#db7866', '#e1bd55', '#619bc2', '#8ca86d']);

function clothTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#e6e0cb'; ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 3) {
    ctx.strokeStyle = i % 2 ? '#c7bea8' : '#f8f3e5'; ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i, 64); ctx.moveTo(0, i); ctx.lineTo(64, i); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

/** Shared geometry and cloth for four physical identities and their replacements. */
export function createBeanBagVisuals() {
  const geometry = new THREE.SphereGeometry(1, 20, 12), position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    position.setXYZ(i, Math.sign(x) * Math.abs(x) ** .62 * .055, Math.sign(y) * Math.abs(y) ** .62 * .055, z * .026 * (.9 + .1 * Math.cos(x * 9)));
  }
  geometry.computeVertexNormals();
  const cloth = clothTexture(), materials = BEAN_BAG_COLORS.map(color => new THREE.MeshStandardMaterial({color, map: cloth, roughness: 1}));
  const seamPoints = [];
  for (let i = 0; i < 64; i++) {
    const angle = i / 64 * Math.PI * 2;
    seamPoints.push(new THREE.Vector3(Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** .55 * .051, Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** .55 * .051, .011));
  }
  const seamGeometry = new THREE.BufferGeometry().setFromPoints(seamPoints), seamMaterial = new THREE.LineBasicMaterial({color: '#f0dbc3'});
  let disposed = false;
  return {
    create(index) {
      if (disposed || !Number.isInteger(index) || index < 0 || index >= 8) throw new RangeError('Invalid bean bag identity');
      const bag = new THREE.Group(); bag.name = `Bean bag ${index + 1}`; bag.userData.beanBagId = index;
      bag.add(new THREE.Mesh(geometry, materials[index % BEAN_BAG_COLORS.length]), new THREE.LineLoop(seamGeometry, seamMaterial)); return bag;
    },
    dispose() {
      if (disposed) return; disposed = true; geometry.dispose(); seamGeometry.dispose(); seamMaterial.dispose(); cloth.dispose();
      for (const material of materials) material.dispose();
    }
  };
}
