/* Source-relative icing contact. Native backgrounds remain owned by cake-presets.js. */
(() => {
  const defaults = Object.freeze({ blend: .65, fill: .78, feather: 1.2, lineDrift: 5, lineFrequency: 12, lineHold: 28, ridge: 5, valley: 4 });
  const limits=Object.freeze({blend:1,fill:1,feather:5,lineDrift:14,lineFrequency:26,lineHold:64,ridge:12,valley:12});
  const resolveSettings=(saved={},overrides={})=>Object.fromEntries(Object.keys(defaults).map(key=>{const value=Number(overrides[key]??saved[key]??defaults[key]);return [key,Number.isFinite(value)?Math.max(0,Math.min(limits[key],value)):defaults[key]];}));
  const sources = new Map();
  const structuralKeys = new Map();
  let generation = 0;
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));
  async function decode(url, preset) {
    const cacheKey = `${url}|${preset.id}|tile:${preset.tileSize ?? 'cover'}`;
    if (sources.has(cacheKey)) { const cached=sources.get(cacheKey); sources.delete(cacheKey); sources.set(cacheKey,cached); return cached; }
    const pending = loadPixels(url, preset.tileSize);
    sources.set(cacheKey, pending);
    while (sources.size > 8) sources.delete(sources.keys().next().value);
    status.sourceCacheEntries=sources.size;
    try { return await pending; } catch (error) { if(sources.get(cacheKey)===pending)sources.delete(cacheKey);status.sourceCacheEntries=sources.size;throw error; }
  }
  function frame(source, preset, width = innerWidth, height = innerHeight) {
    const scale = preset.tileSize ? preset.tileSize / source.width : Math.max(width / source.width, height / source.height);
    return { scale, tileSize: preset.tileSize, sourceWidth: source.width, sourceHeight: source.height, left: (width - source.width * scale) / 2, top: (height - source.height * scale) / 2, repeat: preset.backgroundRepeat === 'repeat', width, height };
  }
  function sample(source, mapping, x, y) {
    let sx = Math.floor((x - mapping.left) / mapping.scale), sy = Math.floor((y - mapping.top) / mapping.scale);
    if (mapping.repeat) { sx = (sx % source.width + source.width) % source.width; sy = (sy % source.height + source.height) % source.height; }
    sx = clamp(sx, 0, source.width - 1); sy = clamp(sy, 0, source.height - 1);
    const i = (sy * source.width + sx) * 4;
    return [source.rgba[i], source.rgba[i + 1], source.rgba[i + 2]];
  }
  function analyze(rgb, width, height, material = '') {
    const size = width * height, luma = new Float32Array(size), integral = new Float64Array((width + 1) * (height + 1)), square = new Float64Array(integral.length);
    for (let y = 0; y < height; y++) {
      let sum = 0, sumSquare = 0;
      for (let x = 0; x < width; x++) { const i = y * width + x; luma[i] = rgb[i * 3] * .2126 + rgb[i * 3 + 1] * .7152 + rgb[i * 3 + 2] * .0722; sum += luma[i]; sumSquare += luma[i] ** 2; integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + sum; square[(y + 1) * (width + 1) + x + 1] = square[y * (width + 1) + x + 1] + sumSquare; }
    }
    const candidate = new Uint8Array(size), deficit = new Float32Array(size), labels = new Int32Array(size), components = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, x0 = Math.max(0, x - 10), x1 = Math.min(width, x + 11), y0 = Math.max(0, y - 10), y1 = Math.min(height, y + 11), stride = width + 1;
      const mean = (integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0]) / ((x1 - x0) * (y1 - y0));
      deficit[i] = (mean - luma[i]) / Math.max(20, mean);
      const meanSquare = (square[y1 * stride + x1] - square[y0 * stride + x1] - square[y1 * stride + x0] + square[y0 * stride + x0]) / ((x1 - x0) * (y1 - y0));
      const relativeVariation = Math.sqrt(Math.max(0, meanSquare - mean ** 2)) / Math.max(20, mean);
      candidate[i] = deficit[i] > clamp(relativeVariation * .7, .055, .16) ? 1 : 0;
    }
    const queue = new Int32Array(size);
    for (let start = 0; start < size; start++) {
      if (!candidate[start] || labels[start]) continue;
      const id = components.length + 1, pixels = []; let head = 0, tail = 1; queue[0] = start; labels[start] = id;
      let x0 = width, x1 = 0, y0 = height, y1 = 0, totalDepth = 0, chroma = 0, greenSolid = 0, orangeSolid = 0;
      while (head < tail) {
        const i = queue[head++], x = i % width, y = Math.floor(i / width); pixels.push(i); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); totalDepth += deficit[i];
        const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; chroma += Math.max(r, g, b) - Math.min(r, g, b); greenSolid += g > r * 1.05 && g > b * 1.3 ? 1 : 0; orangeSolid += r > g * 2.15 && b < g * .4 ? 1 : 0;
        for (const j of [x ? i - 1 : -1, x + 1 < width ? i + 1 : -1, y ? i - width : -1, y + 1 < height ? i + width : -1]) if (j >= 0 && candidate[j] && !labels[j]) { labels[j] = id; queue[tail++] = j; }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      // Saturated shreds and elongated compact flecks are conservatively excluded. A photograph cannot prove semantic material identity.
      const inclusion = (chroma / pixels.length > 72 && (w / h > 2.5 || h / w > 2.5) && pixels.length / (w * h) > .52) || (material === 'pistachio' && greenSolid / pixels.length > .5) || (material === 'carrot' && orangeSolid / pixels.length > .65);
      components.push({ id, pixels, x0, x1, y0, y1, width: w, height: h, area: pixels.length, depth: totalDepth / pixels.length, inclusion });
    }
    return { width, height, rgb, labels, deficit, luma, components };
  }
  function smoothField(values, radius) {
    const prefix=new Float64Array(values.length+1),out=new Float32Array(values.length);for(let x=0;x<values.length;x++)prefix[x+1]=prefix[x]+values[x];
    for(let x=0;x<values.length;x++){const a=Math.max(0,x-radius),b=Math.min(values.length,x+radius+1);out[x]=(prefix[b]-prefix[a])/(b-a);}return out;
  }
  function physicalContour(structure, edgeY, side, s, poreFactor) {
    const width=structure.width,raw=new Float32Array(width),lum=new Float32Array(width);
    for(let x=0;x<width;x++){let count=0;for(let y=Math.max(0,edgeY-13);y<Math.min(structure.height,edgeY+14);y++){const i=y*width+x;raw[x]+=clamp(structure.deficit[i]*3,0,1);lum[x]+=structure.luma[i];count++;}raw[x]/=count;lum[x]/=count;}
    const mouth=smoothField(raw,14),mass=smoothField(raw,64),light=smoothField(lum,28),local=smoothField(lum,150),field=new Float32Array(width);
    for(let x=0;x<width;x++)field[x]=mouth[x]*.45+mass[x]*.55+clamp((local[x]-light[x])/Math.max(20,local[x]),-.2,.2)*.5;
    const shaped=smoothField(field,18);let mean=0,variance=0;for(const v of shaped)mean+=v;mean/=width;for(const v of shaped)variance+=(v-mean)**2;const deviation=Math.sqrt(variance/width);
    const amplitude=side==='top'?Math.min(14,s.valley*2.4):Math.min(16,s.ridge*2.7)*s.fill/.78*poreFactor;
    const strength=s.blend*Math.min(1,s.lineFrequency/12),out=new Float32Array(width);
    if(deviation<.003||!strength||!amplitude)return out;
    // Rounded variation comes from the actual crumb field, with no periodic or independently random contour.
    for(let x=0;x<width;x++)out[x]=amplitude*strength*clamp(.45+(shaped[x]-mean)/Math.max(.025,deviation*3.5),0,1);
    return smoothField(out,5);
  }
  function contact(structure, edgeY, side, controls = defaults) {
    const s = resolveSettings({},controls), width = structure.width, height = structure.height, alpha = new Float32Array(width * height), boundary = new Float32Array(width), pockets = [];
    const poreFactor=clamp(Number(controls.poreSensitivity??.42)/.42,0,1.75);
    const contour=physicalContour(structure,edgeY,side,s,poreFactor),crumb=new Float32Array(width),crumbDepth=new Float32Array(width);boundary.set(contour);
    if (s.blend <= 0 || s.lineFrequency <= 0) return { alpha, boundary, contour, crumb, crumbDepth, pockets };
    const reach = s.lineHold > 0 ? Math.min(18, 3 + s.lineHold * .3) : 0, density = clamp(s.lineFrequency / 12, 0, 2);
    for (const c of structure.components) {
      if (c.inclusion || c.area < 3 || c.width > 90 || c.height > 44) continue;
      const plane=edgeY+contour[Math.round((c.x0+c.x1)/2)];
      const near = side === 'bottom' ? Math.max(0, c.y0 - plane) : Math.max(0, plane - c.y1);
      const exterior = side === 'bottom' ? c.y1 >= plane : c.y0 < plane;
      if (!exterior || near > reach) continue;
      const access = clamp(c.width / 7, .18, 1), narrowDeep = clamp(c.width / Math.max(1, c.height), .14, 1), shadow = clamp(1 - c.depth * .85, .26, .88);
      const connectivity = c.y0 <= plane && c.y1 >= plane ? 1 : Math.exp(-near / 3.3);
      const strength = s.blend * s.fill * connectivity * access * narrowDeep * shadow * poreFactor;
      if (strength < .015) continue;
      let coverage = 0, retained = 0, weightedY = 0;
      const downDepth = Math.min(c.height, (2 + s.ridge * .8 + c.width * .42) * access * shadow * density);
      for (const i of c.pixels) {
        const x = i % width, y = Math.floor(i / width);
        const actualDistance=side==='bottom'?Math.max(0,y-edgeY-contour[x]):Math.max(0,edgeY+contour[x]-y),lip = Math.exp(-actualDistance / (side === 'bottom' ? Math.max(1.2, downDepth) : 1.8));
        // The deepest core keeps its shadow even when the mouth accepts icing.
        const depthRetention = clamp(1 - structure.deficit[i] * .9, .2, 1);
        const rim = structure.labels[Math.max(0,i-1)] !== c.id || structure.labels[Math.min(structure.labels.length-1,i+1)] !== c.id;
        const a = clamp(strength * lip * depthRetention * 3.5 * (rim ? 1 - Math.min(.28,s.feather*.06) : 1), 0, .88);
        alpha[i] = a; coverage += a; retained += 1 - a; weightedY += a * y;
        if (side === 'bottom' && s.ridge > 0 && y >= edgeY+contour[x] && c.y0 <= edgeY+contour[x]+2) boundary[x] = Math.max(boundary[x], contour[x]+Math.min(s.ridge,downDepth * .38, Math.min(y-edgeY-contour[x]+1,downDepth)*a*1.8));
      }
      let effective = 0, visibleArea = 0, exteriorWeightedY = 0;
      for (const i of c.pixels) { const x = i % width, y = Math.floor(i / width), visible = side === 'bottom' ? y >= edgeY+contour[x] : y < edgeY+contour[x]; if(visible){visibleArea++;const amount=side === 'bottom' && y < edgeY + boundary[x] ? 1 : alpha[i];effective += amount;exteriorWeightedY += amount*y;} }
      pockets.push({ id: c.id, x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, width: c.width, height: c.height, area: c.area, visibleArea, depth: c.depth, near, connectivity, strength, coverage: visibleArea ? effective / visibleArea : 0, remainingShadow: visibleArea ? 1 - effective / visibleArea : 1, overlayCoverage: coverage / c.area, influenceY: effective ? exteriorWeightedY / effective - edgeY : 0 });
    }
    // At the upper boundary the cut pulls real cake walls down into icing, never upward.
    if(side==='top'&&s.valley>0)for(const c of structure.components){
      if(c.inclusion||c.width<5||c.height<3||c.area<10||c.width>60)continue;
      const center=Math.round((c.x0+c.x1)/2),plane=edgeY+contour[center];if(c.y0>plane+1||c.y1<plane-3)continue;
      // A cavity supports a few contiguous wall fragments; single-pixel candidate columns are not repeated all along the cut.
      for(const wallX of[c.x0-1,c.x1+1])for(let dx=-2;dx<=2;dx++){const x=wallX+dx;if(x<1||x>=width-1)continue;const y=clamp(Math.round(edgeY+contour[x]-1),0,height-1),i=y*width+x;if(structure.labels[i])continue;const weight=(1-Math.abs(dx)/3)*clamp(c.width/14,.35,1)*clamp(1-c.depth*.7,.25,1);crumb[x]=Math.max(crumb[x],weight);crumbDepth[x]=Math.max(crumbDepth[x],Math.min(s.valley*1.3,1.4+c.height*.28+c.width*.07)*weight);}
    }
    for(let x=0;x<width;x++)if(crumb[x])boundary[x]+=crumb[x]*Math.min(1.8,s.valley*.35)*s.blend;
    boundary.set(smoothField(boundary,1));
    for(const p of pockets){const c=structure.components[p.id-1];let amount=0,visibleArea=0,weighted=0;for(const i of c.pixels){const x=i%width,y=Math.floor(i/width),visible=side==='bottom'?y>=edgeY+contour[x]:y<edgeY+contour[x];if(visible){visibleArea++;const a=side==='bottom'&&y<edgeY+boundary[x]?1:alpha[i];amount+=a;weighted+=a*y;}}p.visibleArea=visibleArea;p.coverage=visibleArea?amount/visibleArea:0;p.remainingShadow=1-p.coverage;p.influenceY=amount?weighted/amount-edgeY:0;}
    return { alpha, boundary, contour, crumb, crumbDepth, pockets };
  }
  function bandGeometry(band) {
    const box = band.getBoundingClientRect(), width = band.offsetWidth, height = band.offsetHeight, m = new DOMMatrix(getComputedStyle(band).transform);
    const left = (innerWidth - width) / 2, top = parseFloat(getComputedStyle(band).top);
    return { width, height, box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom }, toViewport: (x, y) => ({ x: left + width / 2 + m.a * (x - width / 2) + m.c * (y - height / 2), y: top + height / 2 + m.b * (x - width / 2) + m.d * (y - height / 2) }) };
  }
  async function render({ presetId, controls, blur = {}, icingSoftness = .16, poreSensitivity = .42, diagnostic = false } = {}) {
    const token = ++generation, started = performance.now(), basePreset = CAKE_PRESET_BY_ID[presetId] || CAKE_PRESET_BY_ID.redVelvet;
    const scale = CakeTextureRenderer.resolveScale(basePreset.id, storedState.colors?.cakeZoom);
    const preset = { ...basePreset, ...scale };
    if(!worker)startWorker();
    if(workerFailure||!worker)throw workerFailure||new Error('Contact worker unavailable');
    const source = await decode(new URL(preset.texture, document.baseURI).href, preset); if (token !== generation) return null;
    const displayURL = getComputedStyle(document.documentElement).getPropertyValue('--cake-texture').trim().replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    const display = await decode(new URL(displayURL, document.baseURI).href, preset); if (token !== generation) return null;
    const mapping = frame(source, preset), displayMapping = frame(display, preset), icing = getComputedStyle(document.documentElement).getPropertyValue('--icing').trim(), settings = resolveSettings(blur,controls);
    settings.poreSensitivity=Number.isFinite(Number(poreSensitivity))?clamp(Number(poreSensitivity),0,1):.42;
    const reports = [], prepared = [];
    for (const band of document.querySelectorAll('.frosting-band')) {
      const g = bandGeometry(band), pad = 28, stripH = pad * 2 + 1, canvas = document.createElement('canvas'); canvas.className = 'icing-contact-canvas'; canvas.dataset.contactGeneration = String(token); canvas.width = g.width; canvas.height = g.height + pad * 2;
      const ctx = canvas.getContext('2d'), gradient = ctx.createLinearGradient(0, pad - 2, 0, pad + g.height + 5);
      const mixer = document.createElement('div'); document.body.append(mixer);
      const mix = (color, percent) => { mixer.style.color = `color-mix(in srgb,${icing},${color} ${percent}%)`; return getComputedStyle(mixer).color; };
      const shoulderLight = mix('white', clamp(18 * (1 - icingSoftness / 5), 10, 18));
      const bodyLight = mix('white', 9), bodyShade = mix('black', 14), lowerShade = mix('black', 23);
      mixer.remove();
      gradient.addColorStop(0, shoulderLight); gradient.addColorStop(.09, bodyLight);
      gradient.addColorStop(.24, icing); gradient.addColorStop(.48, icing);
      gradient.addColorStop(.78, bodyShade); gradient.addColorStop(1, lowerShade);
      const edges = [];
      for (const side of ['top', 'bottom']) {
        const yEdge = side === 'top' ? 0 : g.height, structureKey = `${preset.id}:tile${preset.tileSize ?? 'cover'}:${source.width}x${source.height}:${innerWidth}:${innerHeight}:${getComputedStyle(band).transform}:${getComputedStyle(band).top}:${g.height}:${side}`, rgb = structuralKeys.has(structureKey) ? null : new Uint8ClampedArray(g.width * stripH * 3);
        for (let y = 0; rgb && y < stripH; y++) {
          for (let x = 0; x < g.width; x++) { const p = g.toViewport(x, yEdge + y - pad), color = sample(source, mapping, p.x, p.y); rgb.set(color, (y * g.width + x) * 3); }
          if (y % 8 === 7) { await yieldTask(); if (token !== generation) return null; }
        }
        const { structure, result } = await processStrip(rgb, g.width, stripH, preset.id, side, settings, structureKey); if (token !== generation) return null;
        edges.push({ side, yEdge, structure, result });
      }
      // The full icing body has a shallow shoulder, independent of crumb pores.
      // Applying it to the shared contact edge keeps topper seating aligned.
      for (let x = 0; x < g.width; x++) {
        const u = (x - g.width / 2) / (g.width / 2);
        edges[0].result.boundary[x] += -5.5 * (1 - u * u) + 2.1 * Math.sin(x / g.width * Math.PI * 4);
        edges[1].result.boundary[x] += 1.1 * Math.sin(x / g.width * Math.PI * 2 + .45);
      }
      ctx.fillStyle = gradient; ctx.beginPath();
      for (let x = 0; x < g.width; x++) { const y = pad + edges[0].result.boundary[x]; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      for (let x = g.width - 1; x >= 0; x--) ctx.lineTo(x, pad + g.height + edges[1].result.boundary[x]);
      ctx.closePath(); ctx.fill();
      for (const { side, yEdge, structure, result } of edges) {
        const paint = ctx.createImageData(g.width, stripH);
        const temp = document.createElement('canvas'); temp.width = 1; temp.height = 1; const tc = temp.getContext('2d'); tc.fillStyle = icing; tc.fillRect(0, 0, 1, 1); const icingRGB = tc.getImageData(0, 0, 1, 1).data;
        const crumbClusters=new Float32Array(g.width),clusterDepth=new Float32Array(g.width);
        for(let x=1;x<g.width-1;){
          if(result.crumb[x]<.08){x++;continue;}
          const start=x;let end=x,last=x,peak=0;
          while(end<g.width-2){if(result.crumb[end]>=.08){last=end;peak=Math.max(peak,result.crumbDepth[end]);}if(end-last>3)break;end++;}
          const finish=last;
          if(finish-start>=2&&finish-start<=30&&peak>=1.4)for(let column=Math.max(0,start-1);column<=Math.min(g.width-1,finish+1);column++){
            const taper=Math.min(1,(column-start+2)/3,(finish-column+2)/3);
            const position=clamp((column-start+1)/(finish-start+2),0,1),profile=Math.sqrt(Math.sin(Math.PI*position));
            crumbClusters[column]=Math.max(crumbClusters[column],clamp(taper*(.62+.38*result.crumb[column]),.1,1));
            clusterDepth[column]=Math.max(clusterDepth[column],peak*(.48+.7*profile)+result.crumbDepth[column]*.25);
          }
          x=Math.max(x+1,end);
        }
        let downwardCrumbPixels = 0;
        for (let y = 0; y < stripH; y++) { for (let x = 0; x < g.width; x++) {
          const i = y * g.width + x, a = result.alpha[i], py = yEdge + y - pad, outside = side === 'top' ? py < result.contour[x] : py >= g.height+result.contour[x];
          if (outside && a > .01) { const o = i * 4; paint.data[o] = icingRGB[0]; paint.data[o + 1] = icingRGB[1]; paint.data[o + 2] = icingRGB[2]; paint.data[o + 3] = Math.round(a * 255); }
          // Crumb walls at the top are copied down, with a jagged, short tail following the same column.
          const localDepth=clusterDepth[x];
          const hasCakeNeighbor=!(side==='top'&&band.classList.contains('frosting-band-one'));
          const crumbReach=hasCakeNeighbor&&localDepth>0?Math.min(14,localDepth*1.7+1)*Math.min(1,settings.lineFrequency/12):0;
          const dy=side==='top'?y-pad-result.contour[x]:g.height+result.contour[x]-(y-pad);
          if (settings.blend > 0 && settings.lineFrequency > 0 && dy >= 0 && dy < crumbReach) {
            const shift = Math.round(Math.min(3,settings.lineDrift*.35) * dy / Math.max(1,crumbReach)), originX = clamp(x-shift,1,g.width-2);
            const wall = crumbClusters[originX],tail = 1 - dy / Math.max(1, crumbReach);
            if (wall && tail > .15) {
              const sourceY = yEdge+result.contour[originX]+(side==='top'?-1-Math.min(10,Math.round(dy*1.35)):1+Math.min(10,Math.round(dy*1.35)));
              const p = g.toViewport(originX, sourceY), nativeColor = sample(display, displayMapping, p.x, p.y), color = preset.defaultBlend === 'luminosity' ? luminosityColor(nativeColor, getComputedStyle(document.documentElement).getPropertyValue('--cake-tint').trim()) : nativeColor, o = i * 4;
              const opacity = clamp((tail-.12)/.34,0,1)*Math.min(1,settings.blend*1.5)*wall;
              paint.data[o] = color[0]; paint.data[o + 1] = color[1]; paint.data[o + 2] = color[2]; paint.data[o + 3] = Math.round(255 * opacity); downwardCrumbPixels++;
            }
          }
        } if (y % 8 === 7) { await yieldTask(); if (token !== generation) return null; }
        }
        const overlay = document.createElement('canvas'); overlay.width = g.width; overlay.height = stripH; overlay.getContext('2d').putImageData(paint, 0, 0); ctx.drawImage(overlay, 0, yEdge);
        const project = c => {const points=[g.toViewport(c.x0,yEdge+c.y0-pad),g.toViewport(c.x1+1,yEdge+c.y0-pad),g.toViewport(c.x0,yEdge+c.y1+1-pad),g.toViewport(c.x1+1,yEdge+c.y1+1-pad)];const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),right=Math.max(...points.map(p=>p.x)),bottom=Math.max(...points.map(p=>p.y));return {...c,viewportBounds:{left,top,right,bottom}};};
        reports.push({ band: band.className, side, geometry: { width: g.width, height: g.height, box: g.box,origin:g.toViewport(0,yEdge),xBasis:g.toViewport(1,yEdge),yBasis:g.toViewport(0,yEdge+1) }, downwardCrumbPixels, contour:Array.from(result.contour), crumbMask:Array.from(result.crumb), crumbDepth:Array.from(result.crumbDepth), pockets: result.pockets.map(project), boundaryMaxDown: Math.max(...result.boundary), structuralComponents: structure.components.length, rejectedInclusions: structure.components.filter(c => c.inclusion).map(project), crumbColumns: [...Array(g.width).keys()].filter(x => { const i = (pad - 1) * g.width + x; return !structure.labels[i] && (structure.labels[Math.max(0,i-1)] || structure.labels[Math.min(structure.labels.length-1,i+1)]); }) });
      }
      if (token !== generation) return null;
      canvas.contactEdges={pad,top:edges[0].result.boundary.slice(),bottom:edges[1].result.boundary.slice()};
      prepared.push({ band, canvas });
    }
    if (token !== generation) return null;
    for (const { band, canvas } of prepared) { band.style.removeProperty('background');band.querySelector('.icing-contact-canvas')?.remove(); band.classList.add('contact-rendered'); band.append(canvas); }
    return { token, presetId: preset.id, tileSize: preset.tileSize, mapping, displayMapping, displayURL, settings, icingSoftness, elapsedMs: performance.now() - started, reports, diagnostic };
  }
  // Canvas uses the same luminosity compositing primitive as the frozen CSS source.
  const colorPatch = document.createElement('canvas'); colorPatch.width = 1; colorPatch.height = 1; const colorContext = colorPatch.getContext('2d', { willReadFrequently: true });
  function luminosityColor(rgb, tint) {
    colorContext.globalCompositeOperation = 'source-over'; colorContext.fillStyle = tint; colorContext.fillRect(0, 0, 1, 1); colorContext.globalCompositeOperation = 'luminosity'; colorContext.fillStyle = `rgb(${rgb.join(' ')})`; colorContext.fillRect(0, 0, 1, 1); return colorContext.getImageData(0, 0, 1, 1).data.slice(0, 3);
  }
  const pending = new Map(); let workerId = 0;
  const workerSource = `const defaults=${JSON.stringify(defaults)},limits=${JSON.stringify(limits)};const resolveSettings=${resolveSettings.toString()};const clamp=${clamp.toString()};const analyze=${analyze.toString()};const smoothField=${smoothField.toString()};const physicalContour=${physicalContour.toString()};const contact=${contact.toString()};const cache=new Map();onmessage=async e=>{const {id,rgb,width,height,material,side,settings,key,url,tileSize}=e.data;try{if(url){const image=await createImageBitmap(await(await fetch(url)).blob()),scale=tileSize?Math.min(1,tileSize/image.width):1,canvas=new OffscreenCanvas(Math.round(image.width*scale),Math.round(image.height*scale)),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;postMessage({id,source:{width:canvas.width,height:canvas.height,rgba}},[rgba.buffer]);return;}let analysis=cache.get(key);if(!analysis){analysis=analyze(rgb,width,height,material);cache.set(key,analysis);}else{cache.delete(key);cache.set(key,analysis);}while(cache.size>8)cache.delete(cache.keys().next().value);const result=contact(analysis,28,side,settings),structure={labels:analysis.labels.slice(),components:analysis.components.map(({id,inclusion,x0,x1,y0,y1,area})=>({id,inclusion,x0,x1,y0,y1,area}))};postMessage({id,key,structure,result},[structure.labels.buffer,result.alpha.buffer,result.boundary.buffer,result.contour.buffer,result.crumb.buffer,result.crumbDepth.buffer]);}catch(error){postMessage({id,error:error.message});}}`;
  let worker=null,workerFailure=null;
  function startWorker(){
    workerFailure=null;
    structuralKeys.clear();
    const workerURL=URL.createObjectURL(new Blob([workerSource],{type:'application/javascript'}));
    try{worker=new Worker(workerURL);}catch(error){workerFailure=error;}finally{URL.revokeObjectURL(workerURL);}
    if(!worker)return;
    worker.onmessage = e => { const job = pending.get(e.data.id); if(!job)return;clearTimeout(job.timer);pending.delete(e.data.id); if (e.data.error) job.reject(new Error(e.data.error)); else if(e.data.source)job.resolve(e.data.source);else { structuralKeys.delete(e.data.key); structuralKeys.set(e.data.key,true); while(structuralKeys.size>8)structuralKeys.delete(structuralKeys.keys().next().value); job.resolve(e.data); } };
    worker.onerror = event => { workerFailure=new Error(event.message||'Contact worker unavailable');worker?.terminate();worker=null;structuralKeys.clear();for(const job of pending.values()){clearTimeout(job.timer);job.reject(workerFailure);}pending.clear(); };
  }
  function processStrip(rgb, width, height, material, side, settings, key) { if(workerFailure||!worker)return Promise.reject(workerFailure||new Error('Contact worker unavailable'));return new Promise((resolve, reject) => { const id = ++workerId, timer = setTimeout(()=>{pending.delete(id);reject(new Error('Contact worker timed out'));},4000); pending.set(id, { resolve, reject,timer }); worker.postMessage({ id, rgb, width, height, material, side, settings, key }, rgb ? [rgb.buffer] : []); }); }
  function loadPixels(url,tileSize) { if(!worker)startWorker();if(workerFailure||!worker)return Promise.reject(workerFailure||new Error('Contact worker unavailable'));return new Promise((resolve,reject)=>{const id=++workerId,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Texture decode worker timed out'));},6000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,url,tileSize});}); }
  function dispose() { ++generation;worker?.terminate();worker=null;workerFailure=null;for(const job of pending.values()){clearTimeout(job.timer);job.reject(new Error('Contact renderer disposed'));}pending.clear();sources.clear();status.sourceCacheEntries=0;structuralKeys.clear();document.querySelectorAll('.icing-contact-canvas').forEach(n=>n.remove());document.querySelectorAll('.contact-rendered').forEach(n=>{n.classList.remove('contact-rendered');n.style.removeProperty('background');}); }
  async function safeRender(options) { const requestToken=generation+1;try{return await render(options);}catch(error){if(requestToken!==generation)return null;document.querySelectorAll('.icing-contact-canvas').forEach(n=>n.remove());document.querySelectorAll('.frosting-band').forEach(n=>{n.classList.remove('contact-rendered');n.style.removeProperty('background');});return {error:error.message,fallback:'plain-icing',token:requestToken};} }
  let currentPromise=Promise.resolve(null),activeKey=null;
  const status={requested:0,completed:0,commits:0,discarded:0,last:null,error:null,sourceCacheEntries:0};
  function request(options={}) {
    const rootStyle=getComputedStyle(document.documentElement),preset=window.CAKE_PRESET_BY_ID[options.presetId]||window.CAKE_PRESET_BY_ID.redVelvet,scale=CakeTextureRenderer.resolveScale(preset.id,storedState.colors?.cakeZoom),key=JSON.stringify([options,scale.zoom,scale.tileSize,innerWidth,innerHeight,rootStyle.getPropertyValue('--cake-texture'),rootStyle.getPropertyValue('--cake-tint'),rootStyle.getPropertyValue('--icing'),rootStyle.getPropertyValue('--layer-tilt')]);
    if(key===activeKey&&!status.error)return currentPromise;
    activeKey=key;status.requested++;const requestId=status.requested;
    currentPromise=safeRender(options).then(result=>{if(requestId!==status.requested||!result){status.discarded++;return null;}status.completed=requestId;status.error=result.error||null;status.last=result;if(!result.error)status.commits++;document.documentElement.dataset.contactRenderStatus=result.error?'fallback':'ready';document.documentElement.dataset.contactRenderId=String(requestId);return result;});
    document.documentElement.dataset.contactRenderStatus='pending';return currentPromise;
  }
  async function whenIdle(){let job;do{job=currentPromise;await job;}while(job!==currentPromise);return status.last;}
  addEventListener('pagehide',()=>{dispose();activeKey=null;});
  function edgeGeometry(band){const g=bandGeometry(band),edges=(band.querySelector('.seated-icing-canvas')||band.querySelector('.garnish-seat-canvas')||band.querySelector('.icing-contact-canvas'))?.contactEdges;return {...g,pad:edges?.pad??28,topAt:x=>edges?.top[clamp(Math.round(x),0,g.width-1)]??0,bottomAt:x=>g.height+(edges?.bottom[clamp(Math.round(x),0,g.width-1)]??0)};}
  function createSeatedSurface(band,seatField,className){
    const base=band.querySelector('.icing-contact-canvas');
    if(!base?.contactEdges||!seatField.some(value=>value>.5))return null;
    const seated=document.createElement('canvas');seated.className=className;seated.setAttribute('aria-hidden','true');
    seated.width=base.width;seated.height=base.height;
    const pad=base.contactEdges.pad;seated.style.cssText=`position:absolute;left:0;top:-${pad}px;pointer-events:none`;
    const ctx=seated.getContext('2d');ctx.drawImage(base,0,0);
    const top=base.contactEdges.top.slice(),icing=getComputedStyle(document.documentElement).getPropertyValue('--icing').trim();ctx.fillStyle=icing;
    for(let x=0;x<Math.min(seated.width,seatField.length);x++){
      const depth=seatField[x];if(depth<.5)continue;
      const newEdge=clamp(Math.round(pad+top[x]+depth),0,seated.height-1);
      ctx.clearRect(x,0,1,newEdge);ctx.globalAlpha=clamp(.25+depth/25,.25,.72);ctx.fillRect(x,newEdge,1,2);top[x]+=depth;
    }
    ctx.globalAlpha=1;seated.contactEdges={pad,top,bottom:base.contactEdges.bottom.slice()};return seated;
  }
  window.CakeContactRenderer={defaults,resolveSettings,request,whenIdle,status,edgeGeometry,createSeatedSurface,cancel:()=>{++generation;activeKey=null;},dispose:()=>{dispose();activeKey=null;}};
})();
