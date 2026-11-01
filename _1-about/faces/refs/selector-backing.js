// One continuous face-owned wallpaper sheet spans the entire cabinet back.
import {createRefsIrisPocketGeometry, refsIrisPocketRim} from './spherical-iris.js';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const WALLPAPER_URL = new URL('./assets/vintage-floral-wallpaper-v1.png', import.meta.url).href;

export function createRefsSelectorBacking(THREE, parent, options, metrics, contrast = .5,
  initialPocket = null) {
  const root = new THREE.Group(); root.name = 'refs.selector-backing'; parent.add(root);
  const material = new THREE.MeshBasicMaterial({color: '#a9a17e', side: THREE.DoubleSide,
    toneMapped: false});
  const panel = new THREE.Mesh(new THREE.BufferGeometry(), material);
  panel.name = 'refs.selector-backing.floral-panel';
  root.add(panel);
  const liner = new THREE.Mesh(new THREE.BufferGeometry(), material);
  liner.name = 'refs.selector-backing.iris-mound-liner'; liner.userData.refsIrisPocket = true;
  root.add(liner);
  let texture = null, disposed = false, geometryKey = '', currentMetrics = null;
  let gain = contrast;

  function setContrast(value) {
    gain = Number.isFinite(value) ? clamp(value, .08, 2.4) : .5;
    // Keep the aged yellow paper subdued while following the site's live control.
    const level = (gain - .08) / 2.32;
    material.color.setRGB(.38 + .22 * level, .35 + .19 * level, .27 + .13 * level);
  }
  function configure(next, cabinetMetrics, pocket = null) {
    if (disposed) return;
    root.visible = Boolean(next.cabinetEnabled && next.selectorBackingEnabled);
    const contour = cabinetMetrics?.contour;
    if (!contour?.length) return;
    const key = JSON.stringify([contour, cabinetMetrics.rearY, pocket]);
    if (key === geometryKey) return;
    geometryKey = key;
    const xs = contour.map(p => p.x), zs = contour.map(p => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const width = Math.max(.001, maxX - minX), height = Math.max(.001, maxZ - minZ);
    const y = cabinetMetrics.rearY + .001;
    const hole = pocket && next.dummyIrisEnabled ? Array.from({length: 128}, (_, i) => {
      const a = 2 * Math.PI * i / 128;
      const radius = refsIrisPocketRim(pocket, .001);
      return new THREE.Vector2(pocket.x + radius * Math.cos(a),
        pocket.z + radius * Math.sin(a));
    }) : [];
    const all = [...contour, ...hole.map(p => ({x: p.x, z: p.y}))];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(
      all.flatMap(p => [p.x, y, p.z]), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(
      all.flatMap(p => [(p.x - minX) / width, (p.z - minZ) / height]), 2));
    geometry.setIndex(THREE.ShapeUtils.triangulateShape(
      contour.map(p => new THREE.Vector2(p.x, p.z)), hole.length ? [hole] : []).flat());
    geometry.computeVertexNormals();
    panel.geometry.dispose(); panel.geometry = geometry;
    liner.geometry.dispose();
    liner.geometry = hole.length ? createRefsIrisPocketGeometry(THREE, pocket, .001,
      {minX, minZ, width, height}) : new THREE.BufferGeometry();
    liner.visible = Boolean(hole.length);
    currentMetrics = {contour, minX, maxX, minZ, maxZ, frontY: y};
  }
  configure(options, metrics, initialPocket);
  setContrast(contrast);
  const loader = new THREE.TextureLoader();
  loader.load(WALLPAPER_URL, loaded => {
    if (disposed) { loaded.dispose(); return; }
    loaded.colorSpace = THREE.SRGBColorSpace;
    loaded.wrapS = THREE.ClampToEdgeWrapping;
    loaded.wrapT = THREE.ClampToEdgeWrapping;
    loaded.minFilter = THREE.LinearMipmapLinearFilter;
    loaded.magFilter = THREE.LinearFilter;
    loaded.generateMipmaps = true;
    loaded.anisotropy = 4;
    loaded.needsUpdate = true;
    texture = loaded;
    material.map = loaded;
    material.needsUpdate = true;
    setContrast(gain);
  });
  return {root, configure, setContrast, getMetrics: () => currentMetrics,
    getWallpaperTexture: () => texture,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      panel.geometry.dispose(); liner.geometry.dispose(); material.dispose(); texture?.dispose();
    }};
}
