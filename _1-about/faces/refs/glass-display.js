export const REFS_GEM_FONT_FAMILY = '"Segoe UI", Arial, sans-serif';
export const REFS_GEM_ATTRIBUTION_SCALE = .82;
const gemFont = size => `600 ${size}px ${REFS_GEM_FONT_FAMILY}`;

/** Fit every glyph inside a circular field, using the wider middle chords. */
export function layoutRefsGemText(context, value, diameter = 2048) {
  const content = String(value ?? '').replace(/\r\n?/g, '\n');
  const paragraphs = content.split('\n'), tokens = [];
  const byline = paragraphs.length > 1 && paragraphs.at(-1).trim().startsWith('—')
    && paragraphs.slice(0, -1).some(paragraph => paragraph.trim());
  let attributionStart = Infinity;
  paragraphs.forEach((paragraph, index) => {
    if (index) tokens.push('\n');
    if (byline && index === paragraphs.length - 1) attributionStart = tokens.length;
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) tokens.push(word);
  });
  // The texture itself ends at the circular plate. Leave a narrow ink margin
  // while making use of the curved area rather than a central rectangle.
  const radius = diameter * .48, center = diameter / 2;
  const fits = size => {
    context.font = gemFont(size);
    context.textAlign = 'center'; context.textBaseline = 'alphabetic';
    const lineHeight = size * 1.06;
    const maximum = Math.min(80, Math.floor((2 * radius - size) / lineHeight) + 1);
    for (let slots = 1; slots <= maximum; slots++) {
      let token = 0, remainder = '', lines = [], rejected = false;
      for (let row = 0; row < slots && (token < tokens.length || remainder); row++) {
        const fontSize = size * (token >= attributionStart ? REFS_GEM_ATTRIBUTION_SCALE : 1);
        context.font = gemFont(fontSize);
        const y = center + (row - (slots - 1) / 2) * lineHeight;
        const edge = Math.abs(y - center) + fontSize * .53;
        if (edge >= radius) break;
        const limit = 2 * Math.sqrt(radius * radius - edge * edge) - diameter * .025;
        if (limit <= 0) break;
        let line = '';
        while (token < tokens.length || remainder) {
          if (!remainder && tokens[token] === '\n') { token++; break; }
          const word = remainder || tokens[token];
          const candidate = line ? `${line} ${word}` : word;
          if (context.measureText(candidate).width <= limit) {
            line = candidate; remainder = ''; token++; continue;
          }
          if (line) break;
          // Retry a smaller type size/other line count before splitting an
          // ordinary word merely because an outer circular chord is narrow.
          // Only truly oversized unbroken strings need character wrapping.
          if (context.measureText(word).width <= 2 * radius - diameter * .025) {
            rejected = true; break;
          }
          let amount = 0;
          while (amount < word.length && context.measureText(word.slice(0, amount + 1)).width <= limit)
            amount++;
          if (!amount) break;
          line = word.slice(0, amount);
          remainder = word.slice(amount);
          if (!remainder) token++;
          break;
        }
        if (rejected) break;
        lines.push({text: line, y, limit, fontSize});
      }
      if (!rejected && token === tokens.length && !remainder) {
        const occupied = lines.filter(line => line.text).map(line => {
          context.font = gemFont(line.fontSize);
          const metrics = context.measureText(line.text);
          const ascent = Number.isFinite(metrics.actualBoundingBoxAscent)
            ? metrics.actualBoundingBoxAscent : line.fontSize / 2;
          const descent = Number.isFinite(metrics.actualBoundingBoxDescent)
            ? metrics.actualBoundingBoxDescent : line.fontSize / 2;
          const left = Number.isFinite(metrics.actualBoundingBoxLeft)
            ? metrics.actualBoundingBoxLeft : metrics.width / 2;
          const right = Number.isFinite(metrics.actualBoundingBoxRight)
            ? metrics.actualBoundingBoxRight : metrics.width / 2;
          return {line, top: line.y - ascent, bottom: line.y + descent, left, right};
        });
        if (!occupied.length) return {size, lines, diameter};
        // Center the visible ink, including asymmetric ascenders and descenders,
        // rather than the trial slots or the font's middle baseline.
        const top = Math.min(...occupied.map(row => row.top));
        const bottom = Math.max(...occupied.map(row => row.bottom));
        const shift = center - (top + bottom) / 2;
        const safe = occupied.every(({top: rowTop, bottom: rowBottom, left, right}) => {
          const edge = Math.max(Math.abs(rowTop + shift - center),
            Math.abs(rowBottom + shift - center));
          if (edge >= radius) return false;
          const chord = Math.sqrt(radius * radius - edge * edge) - diameter * .0125;
          return Math.max(left, right) <= chord;
        });
        if (safe) return {size, lines: lines.map(line => {
          const row = occupied.find(entry => entry.line === line);
          if (!row) return {...line, y: line.y + shift};
          const edge = Math.max(Math.abs(row.top + shift - center),
            Math.abs(row.bottom + shift - center));
          return {...line, y: line.y + shift,
            limit: 2 * Math.sqrt(radius * radius - edge * edge) - diameter * .025};
        }), diameter};
      }
    }
    return null;
  };
  let low = Math.max(1, Math.floor(diameter / 256));
  const maximumSize = content.length < 80 ? Math.max(360, Math.floor(diameter * .42)) : 360;
  let high = maximumSize;
  let best = fits(low);
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const layout = fits(middle);
    if (layout) { best = layout; low = middle + 1; }
    else high = middle - 1;
  }
  // A word can jump to the next circular chord at a larger size, so fit is
  // locally nonmonotone. Check nearby sizes after the fast binary pass.
  if (best && content.length < 300) {
    const ceiling = Math.min(maximumSize, best.size + 20);
    for (let size = best.size + 1; size <= ceiling; size++) {
      const layout = fits(size);
      if (layout) best = layout;
    }
  }
  return best;
}

/** A polished quote stone in the empty center of the spherical iris leaves. */
export function createRefsGlassDisplay(THREE, iris, options, contrast) {
  const mount = iris.getDisplayMount(), metrics = iris.getDisplayMetrics();
  const root = new THREE.Group(); root.name = 'refs.iris.glass-display';
  // The mount remains on the rear seat; the broad gem front is recessed
  // 1–2.5 native units behind the fixed frame at Z 48.5.
  root.position.z = 19 - metrics.nativePlaneZ;
  mount.add(root);
  const frontZ = 27, faceRadius = 78, textRadius = 76;
  const profile = [[0, 0], [66, 0], [74, 2], [79, 6], [80.8, 11],
    [80.8, 17], [80.3, 21], [79.5, 24], [78.5, 26.5], [faceRadius, frontZ], [0, frontZ]];
  const shoulder = new THREE.SplineCurve(profile.slice(0, -1).map(([r, z]) => new THREE.Vector2(r, z)));
  const bodyProfile = [...shoulder.getPoints(100), new THREE.Vector2(60, frontZ),
    new THREE.Vector2(30, frontZ), new THREE.Vector2(0, frontZ)];
  // LatheGeometry supplies analytic profile normals and matching seam normals.
  // Keep its angular-major vertex order intact rather than averaging across
  // unrelated profile points, which creates a radial specular streak.
  const bodyGeometry = new THREE.LatheGeometry(bodyProfile, 128).rotateX(Math.PI / 2);
  const bodyMaterial = new THREE.MeshPhysicalMaterial({color: '#153d67', roughness: .6,
    metalness: .02, clearcoat: .12, clearcoatRoughness: .5,
    emissive: '#153d67', emissiveIntensity: .08, side: THREE.DoubleSide});
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.name = 'refs.display.rounded-gem-body'; root.add(body);

  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
  const context = canvas.getContext('2d');
  const textTexture = new THREE.CanvasTexture(canvas);
  textTexture.colorSpace = THREE.SRGBColorSpace; textTexture.anisotropy = 8;
  const textGeometry = new THREE.CircleGeometry(textRadius, 128);
  const textMaterial = new THREE.MeshBasicMaterial({map: textTexture, transparent: true,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false});
  const text = new THREE.Mesh(textGeometry, textMaterial);
  text.name = 'refs.display.plate-gem-text'; text.position.z = frontZ + .35;
  text.renderOrder = 2; root.add(text);
  let displayedText = null, disposed = false;
  function setText(value) {
    if (disposed) return;
    const next = typeof value === 'string' ? value : '';
    if (next === displayedText) return;
    displayedText = next;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (next.trim()) {
      const layout = layoutRefsGemText(context, next, canvas.width);
      if (!layout) { text.visible = false; return; }
      const {size, lines} = layout;
      context.textAlign = 'center'; context.textBaseline = 'alphabetic';
      context.shadowColor = 'rgba(0,10,25,.7)'; context.shadowBlur = Math.max(2, size * .018);
      context.fillStyle = '#f5faff';
      lines.forEach(line => {
        context.font = gemFont(line.fontSize);
        context.fillText(line.text, canvas.width / 2, line.y);
      });
    }
    textTexture.needsUpdate = true;
    text.visible = Boolean(next.trim());
  }

  // Lens curve changes only the shallow front crown; the rolled shoulder
  // and physical body remain fixed through iris and plate motion.
  function lensGeometry(curvature, offset = 0) {
    const positions = [], uvs = [], indices = [], radial = 16, around = 128;
    const rise = .05 + 1.04 * curvature;
    for (let ring = 0; ring <= radial; ring++) {
      const t = ring / radial, r = faceRadius * t;
      const z = frontZ + .38 + rise * (1 - t * t) ** 2 + offset;
      for (let i = 0; i <= around; i++) {
        const a = i * 2 * Math.PI / around;
        const x = r * Math.cos(a), y = r * Math.sin(a);
        positions.push(x, y, z);
        uvs.push(.5 + x / (2 * faceRadius), .5 + y / (2 * faceRadius));
        if (ring && i) {
          const here = ring * (around + 1) + i, previous = here - (around + 1);
          indices.push(previous - 1, here - 1, here, previous - 1, here, previous);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }
  // The lens sits in front of the lettering. A lit clearcoat here can cross
  // the quote as the cube turns, so keep the shallow tint free of light glints.
  // The polished edge below supplies the visible contrast-responsive sheen.
  const lensMaterial = new THREE.MeshBasicMaterial({color: '#153d67', transparent: true,
    opacity: .03, depthWrite: false, side: THREE.DoubleSide});
  const lens = new THREE.Mesh(lensGeometry(options.glassCurvature), lensMaterial);
  lens.name = 'refs.display.broad-glass-face'; lens.renderOrder = 3; root.add(lens);

  const sheenCanvas = document.createElement('canvas'); sheenCanvas.width = sheenCanvas.height = 512;
  const sheenContext = sheenCanvas.getContext('2d');
  // Polish is confined to the stone edge so it cannot wash out a long quote.
  const glow = sheenContext.createRadialGradient(256, 256, 194, 256, 256, 254);
  glow.addColorStop(0, 'rgba(255,255,255,0)');
  glow.addColorStop(.72, 'rgba(235,247,255,.08)');
  glow.addColorStop(.9, 'rgba(235,247,255,.42)');
  glow.addColorStop(1, 'rgba(235,247,255,0)');
  sheenContext.fillStyle = glow; sheenContext.fillRect(0, 0, 512, 512);
  const sheenTexture = new THREE.CanvasTexture(sheenCanvas);
  const sheenMaterial = new THREE.MeshBasicMaterial({map: sheenTexture, transparent: true,
    opacity: .12, depthWrite: false, side: THREE.DoubleSide, toneMapped: false});
  const sheen = new THREE.Mesh(lensGeometry(options.glassCurvature, .018), sheenMaterial);
  sheen.name = 'refs.display.soft-glass-reflection'; sheen.renderOrder = 4; root.add(sheen);

  let previousCurvature = options.glassCurvature, currentContrast = contrast;
  function setContrast(gain) {
    currentContrast = gain;
    const fraction = Math.max(0, Math.min(1, gain / 2.4));
    bodyMaterial.emissiveIntensity = .08 + .23 * fraction;
    bodyMaterial.specularIntensity = .18 + .12 * fraction;
    textMaterial.opacity = .88 + .12 * fraction;
    lensMaterial.opacity = (.09 - .065 * options.glassClarity) * (.55 + .45 * fraction);
    sheenMaterial.opacity = (.02 + .1 * fraction) * options.glassPolish;
  }
  function configure(next) {
    if (disposed) return;
    options = next;
    root.visible = Boolean(next.cabinetEnabled && next.dummyIrisEnabled && next.glassDisplayEnabled);
    bodyMaterial.color.set(next.glassBackingColor);
    bodyMaterial.emissive.set(next.glassBackingColor);
    bodyMaterial.roughness = .72 - .2 * next.glassPolish;
    bodyMaterial.clearcoat = .05 + .15 * next.glassPolish;
    bodyMaterial.clearcoatRoughness = .65 - .2 * next.glassPolish;
    lensMaterial.color.set(next.glassBackingColor);
    sheenMaterial.color.set('#ffffff');
    if (next.glassCurvature !== previousCurvature) {
      lens.geometry.dispose(); lens.geometry = lensGeometry(next.glassCurvature);
      sheen.geometry.dispose(); sheen.geometry = lensGeometry(next.glassCurvature, .018);
      previousCurvature = next.glassCurvature;
    }
    setContrast(currentContrast);
  }
  configure(options);
  return {root, configure, setContrast, setText,
    getState() { return {text: displayedText ?? '', nativeBackZ: 19,
      nativeFrontZ: 46 + .38 + .05 + 1.04 * options.glassCurvature + .018}; },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent();
      for (const geometry of [bodyGeometry, textGeometry, lens.geometry, sheen.geometry]) geometry.dispose();
      for (const material of [bodyMaterial, textMaterial, lensMaterial, sheenMaterial]) material.dispose();
      textTexture.dispose(); sheenTexture.dispose();
    }};
}
