// === RESET-DEBUG: detect reload vs navigation vs HMR ===
(() => {
    const tag = (msg, extra={}) => console.log('[RESET-DEBUG] ' + msg, extra);
    try{
        window.addEventListener('beforeunload', () => tag('beforeunload (page is unloading)', {url: location.href}));
        window.addEventListener('unload', () => tag('unload', {url: location.href}));
        window.addEventListener('popstate', () => tag('popstate', {url: location.href}));
        window.addEventListener('hashchange', () => tag('hashchange', {url: location.href}));
        const _push = history.pushState.bind(history);
        const _replace = history.replaceState.bind(history);
        history.pushState = function(...args){ tag('history.pushState', {args, stack: (new Error()).stack}); return _push(...args); };
        history.replaceState = function(...args){ tag('history.replaceState', {args, stack: (new Error()).stack}); return _replace(...args); };
        window.addEventListener('error', (ev) => tag('window error', {message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno}));
        window.addEventListener('unhandledrejection', (ev) => tag('unhandledrejection', {reason: ev.reason}));
        const key = '__reset_debug_count__';
        const n = Number(sessionStorage.getItem(key) || 0) + 1;
        sessionStorage.setItem(key, String(n));
        tag('boot', {bootCountThisTab: n, url: location.href, navType: performance.getEntriesByType('navigation')?.[0]?.type});
    }catch(e){ console.warn('[RESET-DEBUG] instrumentation failed', e); }
})();

// Bubble system: PNG note-bubbles with gentle physics.
// Now spawns appear at the center, grow in, drift outward, collide softly, and exit on any side.

document.addEventListener('DOMContentLoaded', () => {
    const headCircle = document.getElementById('head-inner');
    if (!headCircle) return;
    const assetUrl = window.assetUrl || ((path) => path);
    const safeDrawImage = window.safeDrawImage || ((ctx, img, ...args) => {
        try { ctx.drawImage(img, ...args); return true; } catch (e) { return false; }
    });

    const cx = parseFloat(headCircle.getAttribute('cx'));
    const cy = parseFloat(headCircle.getAttribute('cy'));
    const r  = parseFloat(headCircle.getAttribute('r'));

    // Use the clipped group under #Notes
    const notesRoot = document.querySelector('#Notes > g');
    if (!notesRoot) return;
    while (notesRoot.firstChild) notesRoot.removeChild(notesRoot.firstChild);

    // Build image sources (encode space in folder name)
    const sources = Array.from({ length: 48 }, (_, i) => {
        const n = (i + 1).toString().padStart(2, '0');
        return assetUrl(`assets/images/note-bubbles/Note-${n}.png`);
    });

    // Classification metadata for each source: { src, color, shapeId }
    const COLOR_KEYS = ['blue', 'purple', 'pink', 'amber'];
    const visibleColorCounts = new Map(COLOR_KEYS.map(k => [k, 0]));
    const visibleShapeCounts = new Map(); // shapeId -> count
    const visibleShapeColorCounts = new Map(); // `${shapeId}|${color}` -> count
    let metas = []; // filled after classification
    let metaReady = false;

    // Small canvas for analysis
    const can16 = document.createElement('canvas');
    can16.width = 16; can16.height = 16;
    const ctx16 = can16.getContext('2d');
    const can32 = document.createElement('canvas');
    can32.width = 32; can32.height = 32;
    const ctx32 = can32.getContext('2d');

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) { h = s = 0; }
        else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h *= 60;
        }
        return [h, s, l];
    }

    function classifyColor(h) {
        // Map hue to one of four buckets: blue, purple, pink, amber
        // Blue ~190-240, Purple ~260-320, Pink: h>330 or h<20, Amber ~20-70
        if (h >= 190 && h < 250) return 'blue';
        if (h >= 250 && h < 330) return 'purple';
        if (h >= 330 || h < 20) return 'pink';
        return 'amber';
    }

    function averageHash(img) {
        // Draw scaled to 16x16 grayscale and compute a 256-bit aHash (boolean array)
        ctx16.clearRect(0, 0, 16, 16);
        safeDrawImage(ctx16, img, 0, 0, 16, 16);
        const data = ctx16.getImageData(0, 0, 16, 16).data;
        const gray = new Float32Array(256);
        let sum = 0;
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            const v = a < 10 ? 0 : (0.2126 * r + 0.7152 * g + 0.0722 * b);
            gray[p] = v; sum += v;
        }
        const avg = sum / 256;
        const bits = new Uint8Array(256);
        for (let i = 0; i < 256; i++) bits[i] = gray[i] >= avg ? 1 : 0;
        return bits;
    }

    function hammingDistance(a, b) {
        let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
        return d;
    }

    function fallbackColorForIndex(i) {
        // Deterministic round-robin fallback
        const m = i % 4;
        return COLOR_KEYS[m];
    }

    async function loadAndClassify() {
        const clusterHashes = []; // representative hash per shape cluster
        const metasLocal = [];
        await Promise.all(sources.map((src, index) => new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.decoding = 'async';
            img.loading = 'eager';
            img.onload = () => {
                let color = fallbackColorForIndex(index);
                let hash = null;
                try {
                    // Color classification from 32x32 average hue of opaque pixels
                    ctx32.clearRect(0, 0, 32, 32);
                    safeDrawImage(ctx32, img, 0, 0, 32, 32);
                    const data = ctx32.getImageData(0, 0, 32, 32).data;
                    let rSum = 0, gSum = 0, bSum = 0, count = 0;
                    for (let i = 0; i < data.length; i += 4) {
                        const a = data[i + 3];
                        if (a > 10) { rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; count++; }
                    }
                    if (count > 0) {
                        const rA = rSum / count, gA = gSum / count, bA = bSum / count;
                        const [h] = rgbToHsl(rA, gA, bA);
                        color = classifyColor(h);
                    }
                    // Shape clustering using aHash and Hamming distance
                    hash = averageHash(img);
                } catch {
                    // Canvas read might fail (e.g., file://); keep fallback color and unique hash null
                }
                let shapeId = -1;
                if (hash) {
                    for (let c = 0; c < clusterHashes.length; c++) {
                        const hd = hammingDistance(hash, clusterHashes[c]);
                        if (hd <= 24) { shapeId = c; break; } // similar enough
                    }
                    if (shapeId === -1) { shapeId = clusterHashes.length; clusterHashes.push(hash); }
                } else {
                    // Fallback: treat each file as its own shape to honor max-2 rule
                    shapeId = index;
                }
                metasLocal.push({ src, color, shapeId });
                resolve();
            };
            img.onerror = () => { metasLocal.push({ src, color: fallbackColorForIndex(index), shapeId: index }); resolve(); };
            img.src = src;
        })));
        metas = metasLocal;
        metaReady = true;
    }

    // World in SVG user units (viewBox)
    const bubbles = [];
    const rand = (min, max) => min + Math.random() * (max - min);

    // Tunnel vertical bounds
    const yMin = cy - r;
    const yMax = cy + r;

    // Physics
        const TICK_MS = 30;
            const FRICTION = 0.985;
            const FRICTION_Y = 0.985;
            const MAX_BUBBLES = 24; // normal-size cap
    const COLLISION_IMPULSE = 0.012; // gentler bumps
        const SEP_BIAS = 1.08; // a bit more spacing to avoid repeat contacts
    const POST_COLLISION_SOFTEN = 0.9; // damp velocities slightly after a collision
        const MAX_VY = 0.25; // clamp vertical velocity to avoid jarring motion
    const OUTWARD_ACCEL = 0.002; // gentler radial push from center
    const GROW_MS = 600; // duration to scale from 0 -> 1 for new spawns
    const timeNow = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const MIN_LIVE_MS = GROW_MS + 1000; // longer grace period before eligible to despawn
    const MAX_SPEED = 0.28; // absolute speed clamp to prevent ejection
    const INIT_SCALE = 0.01; // initial tiny scale for new spawns

                // Size range as a fraction of circle diameter (~35–40%), 1.5x previously; now 75% of that
            const circleD = (2 * r);
                const dMin = circleD * 0.35 * 1.5 * 0.75; // ~39.4%
                const dMax = circleD * 0.40 * 1.5 * 0.75; // ~45%

    // Size tiers
    const MAX_NORMAL = MAX_BUBBLES;
    const MAX_TINY = Math.round(MAX_NORMAL * 3); // allow many smalls
    const MAX_BIG = 0; // big bubbles disabled for center-flow
    const TINY_PER_NORMAL_MIN = 1;
    const TINY_PER_NORMAL_MAX = 2;
    const TINY_SIZE_FRAC_MIN = 0.35;
    const TINY_SIZE_FRAC_MAX = 0.55;

    let ageCounter = 0;

    function createImage(src, d) {
        const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', src);
        img.setAttribute('href', src);
        img.setAttribute('width', d.toFixed(3)); // will be updated if scaled
        img.setAttribute('height', d.toFixed(3));
        img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        img.setAttribute('class', 'bubble');
        img.style.opacity = '0.9';
        img.style.imageRendering = 'auto';
        return img;
    }

        function pickMeta(preferColor = null) {
            if (!metaReady || metas.length === 0) {
                // Fallback to random source if classification not ready
                const src = sources[Math.floor(Math.random() * sources.length)];
                return { src, color: 'blue', shapeId: -1 };
            }
            // Determine colors present; if any color has zero visible, force that color
            const missingColors = COLOR_KEYS.filter(c => (visibleColorCounts.get(c) || 0) === 0);
            const forcedColor = preferColor || (missingColors.length ? missingColors[Math.floor(Math.random() * missingColors.length)] : null);

            const bannedShapes = new Set();
            visibleShapeCounts.forEach((count, sid) => { if (count >= 2) bannedShapes.add(sid); });
            const bannedPairs = new Set();
            visibleShapeColorCounts.forEach((count, key) => { if (count >= 1) bannedPairs.add(key); });

            const candidates = metas.filter(m => (forcedColor ? m.color === forcedColor : true)
                && !bannedShapes.has(m.shapeId)
                && !bannedPairs.has(`${m.shapeId}|${m.color}`));
            if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];

            // Relax shape rule slightly if empty
            const relaxed = metas.filter(m => (forcedColor ? m.color === forcedColor : true)
                && (visibleShapeCounts.get(m.shapeId) || 0) < 2
                && !bannedPairs.has(`${m.shapeId}|${m.color}`)); // never violate shape-color uniqueness
            if (relaxed.length) return relaxed[Math.floor(Math.random() * relaxed.length)];

            // Fallback to any
            // Still keep shape and shape-color constraints in fallback
            const any = metas.filter(m => !bannedPairs.has(`${m.shapeId}|${m.color}`) && (visibleShapeCounts.get(m.shapeId) || 0) < 2);
            return any.length ? any[Math.floor(Math.random() * any.length)] : metas[Math.floor(Math.random() * metas.length)];
        }

        function registerVisible(meta) {
            if (!meta) return;
            visibleColorCounts.set(meta.color, (visibleColorCounts.get(meta.color) || 0) + 1);
            if (meta.shapeId !== -1) visibleShapeCounts.set(meta.shapeId, (visibleShapeCounts.get(meta.shapeId) || 0) + 1);
            if (meta.shapeId !== -1) {
                const key = `${meta.shapeId}|${meta.color}`;
                visibleShapeColorCounts.set(key, (visibleShapeColorCounts.get(key) || 0) + 1);
            }
        }

        function unregisterVisible(meta) {
            if (!meta) return;
            visibleColorCounts.set(meta.color, Math.max(0, (visibleColorCounts.get(meta.color) || 0) - 1));
            if (meta.shapeId !== -1) visibleShapeCounts.set(meta.shapeId, Math.max(0, (visibleShapeCounts.get(meta.shapeId) || 0) - 1));
            if (meta.shapeId !== -1) {
                const key = `${meta.shapeId}|${meta.color}`;
                visibleShapeColorCounts.set(key, Math.max(0, (visibleShapeColorCounts.get(key) || 0) - 1));
            }
        }

    // Seed the head with bubbles so it's already full on load (normals only)
        function seedInitialBubbles() {
            const leftEdge = cx - r;
            const rightEdge = cx + r;
            const tryCount = MAX_BUBBLES * 12; // cap attempts to avoid long loops
            let attempts = 0;
            // Ensure at least one of each color first if possible
            const ensureColors = [...COLOR_KEYS];
            while (ensureColors.length && attempts < tryCount && bubbles.length < MAX_BUBBLES) {
                attempts++;
                const prefer = ensureColors.shift();
                const meta = pickMeta(prefer);
                const d = rand(dMin, dMax);
                const rB = d / 2;
                let x = 0, y = 0;
                // sample until inside circle
                for (let k = 0; k < 20; k++) {
                    x = rand(leftEdge + rB, rightEdge - rB);
                    y = rand(yMin + rB, yMax - rB);
                    const dxC = x - cx, dyC = y - cy;
                    if (dxC*dxC + dyC*dyC <= (r - rB) * (r - rB)) break;
                }
                let ok = true;
                for (const b of bubbles) {
                    if (!b.alive) continue;
                    const dx = x - b.x, dy = y - b.y;
                    const minD = (rB + b.r) * 0.95;
                    if (dx*dx + dy*dy < minD*minD) { ok = false; break; }
                }
                if (!ok) { ensureColors.unshift(prefer); continue; }
                const img = createImage(meta.src, d);
                img.setAttribute('x', (x - rB).toFixed(3));
                img.setAttribute('y', (y - rB).toFixed(3));
                notesRoot.appendChild(img);
                const vx0 = rand(-0.05, 0.05);
                const vy0 = rand(-0.05, 0.05);
                const bubble = { el: img, x, y, r: rB, vx: vx0, vy:vy0, alive: true, age: ageCounter++, meta, kind: 'normal', scale: 1, baseD: d };
                bubbles.push(bubble);
                registerVisible(meta);
            }
            while (bubbles.length < MAX_BUBBLES && attempts < tryCount) {
                attempts++;
                const meta = pickMeta();
                const d = rand(dMin, dMax);
                const rB = d / 2;
                let x = 0, y = 0;
                for (let k = 0; k < 20; k++) {
                    x = rand(leftEdge + rB, rightEdge - rB);
                    y = rand(yMin + rB, yMax - rB);
                    const dxC = x - cx, dyC = y - cy;
                    if (dxC*dxC + dyC*dyC <= (r - rB) * (r - rB)) break;
                }
                // avoid heavy overlaps on seed (allow a little)
                let ok = true;
                for (const b of bubbles) {
                    if (!b.alive) continue;
                    const dx = x - b.x, dy = y - b.y;
                    const minD = (rB + b.r) * 0.95;
                    if (dx*dx + dy*dy < minD*minD) { ok = false; break; }
                }
                if (!ok) continue;
                const img = createImage(meta.src, d);
                img.setAttribute('x', (x - rB).toFixed(3));
                img.setAttribute('y', (y - rB).toFixed(3));
                notesRoot.appendChild(img);
                const vx0 = rand(-0.05, 0.05);
                const vy0 = rand(-0.05, 0.05);
                const bubble = { el: img, x, y, r: rB, vx: vx0, vy: vy0, alive: true, age: ageCounter++, meta, kind: 'normal', scale: 1, baseD: d };
                bubbles.push(bubble);
                registerVisible(meta);
            }
        }

        // Seed tiny bubbles proportional to current normal count
        function seedInitialTinyBubbles() {
            const leftEdge = cx - r;
            const rightEdge = cx + r;
            const tryCount = MAX_TINY * 16;
            let attempts = 0;
            const normalCount = bubbles.filter(b => b.alive && b.kind === 'normal').length;
            const desired = Math.min(MAX_TINY, normalCount * 3); // ~3 tinies per normal
            const avgNormal = (dMin + dMax) * 0.5;
            while (bubbles.filter(b => b.alive && b.kind === 'tiny').length < desired && attempts < tryCount) {
                attempts++;
                const meta = pickMeta();
                const d = avgNormal * rand(TINY_SIZE_FRAC_MIN, TINY_SIZE_FRAC_MAX);
                const rB = d / 2;
                let x = 0, y = 0;
                for (let k = 0; k < 20; k++) {
                    x = rand(leftEdge + rB, rightEdge - rB);
                    y = rand(yMin + rB, yMax - rB);
                    const dxC = x - cx, dyC = y - cy;
                    if (dxC*dxC + dyC*dyC <= (r - rB) * (r - rB)) break;
                }
                // avoid heavy overlaps (allow closer since tiny)
                let ok = true;
                for (const b of bubbles) {
                    if (!b.alive) continue;
                    const dx = x - b.x, dy = y - b.y;
                    const minD = (rB + b.r) * 0.9;
                    if (dx*dx + dy*dy < minD*minD) { ok = false; break; }
                }
                if (!ok) continue;
                const img = createImage(meta.src, d);
                img.setAttribute('x', (x - rB).toFixed(3));
                img.setAttribute('y', (y - rB).toFixed(3));
                notesRoot.appendChild(img);
                const vx0 = rand(-0.05, 0.05);
                const vy0 = rand(-0.05, 0.05);
                const bubble = { el: img, x, y, r: rB, vx: vx0, vy: vy0, alive: true, age: ageCounter++, meta, kind: 'tiny', scale: 1, baseD: d };
                bubbles.push(bubble);
                registerVisible(meta);
            }
        }

    function spawnBubble() {
            // Helpers
            function cullOldestOfKind(kind) {
                let cap = MAX_NORMAL; if (kind === 'tiny') cap = MAX_TINY; else if (kind === 'big') cap = MAX_BIG;
                let count = 0; for (const b of bubbles) if (b.alive && b.kind === kind) count++;
                if (count < cap) return;
                let oldestIdx = -1; let oldestAge = Infinity;
                for (let i = 0; i < bubbles.length; i++) {
                    const b = bubbles[i];
                    if (!b.alive || b.kind !== kind) continue;
                    if (b.age < oldestAge) { oldestAge = b.age; oldestIdx = i; }
                }
                if (oldestIdx >= 0) {
                    const rem = bubbles[oldestIdx];
                    rem.alive = false;
                    if (rem.el && rem.el.parentNode) rem.el.parentNode.removeChild(rem.el);
                    unregisterVisible(rem.meta);
                    bubbles.splice(oldestIdx, 1);
                }
            }

            function spawnFromCenter(meta, d, kind) {
                const rB = d / 2;
                const startX = cx;
                const startY = cy;
                const img = createImage(meta.src, d);
                // pre-position off-circle (optional safety; will be overridden below)
                const outsideR = r + dMax + 2;
                const oDir = Math.random() * Math.PI * 2;
                const ox = cx + Math.cos(oDir) * outsideR;
                const oy = cy + Math.sin(oDir) * outsideR;
                img.setAttribute('x', (ox - rB).toFixed(3));
                img.setAttribute('y', (oy - rB).toFixed(3));
                // immediately set to tiny at center so first paint is correct
                const dInit = d * INIT_SCALE;
                img.setAttribute('width', dInit.toFixed(3));
                img.setAttribute('height', dInit.toFixed(3));
                img.setAttribute('x', (startX - rB * INIT_SCALE).toFixed(3));
                img.setAttribute('y', (startY - rB * INIT_SCALE).toFixed(3));
                notesRoot.appendChild(img);
                const dir = Math.random() * Math.PI * 2;
                const vmag = rand(0.03, 0.08);
                const vx0 = Math.cos(dir) * vmag;
                const vy0 = Math.sin(dir) * vmag;
                const bubble = { el: img, x: startX, y: startY, r: rB, vx: vx0, vy: vy0, alive: true, age: ageCounter++, meta, kind, scale: INIT_SCALE, baseD: d, createdAt: timeNow() };
                bubbles.push(bubble);
                registerVisible(meta);
            }

            // 1) Normal
            cullOldestOfKind('normal');
            const metaN = pickMeta();
            const dN = rand(dMin, dMax);
            spawnFromCenter(metaN, dN, 'normal');

            // 2) Tinies: 2-4 per normal
            const tinyCount = Math.floor(rand(TINY_PER_NORMAL_MIN, TINY_PER_NORMAL_MAX + 1));
            for (let i = 0; i < tinyCount; i++) {
                cullOldestOfKind('tiny');
                const metaT = pickMeta();
                const dT = dN * rand(TINY_SIZE_FRAC_MIN, TINY_SIZE_FRAC_MAX);
                spawnFromCenter(metaT, dT, 'tiny');
            }

            // Big bubbles disabled in center-flow
    }

        function scheduleNextSpawn() {
            const delay = rand(900, 1600); // slower spawning cadence
        setTimeout(() => {
            try {
                spawnBubble();
            } catch (e) {
                // Swallow to keep the scheduler alive
                console.error('spawnBubble error:', e);
            } finally {
                scheduleNextSpawn();
            }
        }, delay);
    }

        // Occasional extra tiny spawns to keep a lively field
        function scheduleTinyDrizzle() {
            const delay = rand(1400, 2600);
            setTimeout(() => {
                try {
                    // spawn 1-2 tinies if under cap
                    const countTiny = bubbles.filter(b => b.alive && b.kind === 'tiny').length;
                    if (countTiny < MAX_TINY) {
                        const n = Math.floor(rand(1, 3));
                        for (let i = 0; i < n; i++) {
                            const metaT = pickMeta();
                            const dBase = (dMin + dMax) * 0.5;
                            const dT = dBase * rand(TINY_SIZE_FRAC_MIN, TINY_SIZE_FRAC_MAX);
                            // spawn from center
                            const rB = dT / 2;
                            const startX = cx;
                            const startY = cy;
                            const img = createImage(metaT.src, dT);
                            // pre-position off-circle, then first-paint at tiny center
                            const outsideR = r + dMax + 2;
                            const oDir = Math.random() * Math.PI * 2;
                            const ox = cx + Math.cos(oDir) * outsideR;
                            const oy = cy + Math.sin(oDir) * outsideR;
                            img.setAttribute('x', (ox - rB).toFixed(3));
                            img.setAttribute('y', (oy - rB).toFixed(3));
                            const dInit = dT * INIT_SCALE;
                            img.setAttribute('width', dInit.toFixed(3));
                            img.setAttribute('height', dInit.toFixed(3));
                            img.setAttribute('x', (startX - rB * INIT_SCALE).toFixed(3));
                            img.setAttribute('y', (startY - rB * INIT_SCALE).toFixed(3));
                            notesRoot.appendChild(img);
                            const dir = Math.random() * Math.PI * 2;
                            const vmag = rand(0.03, 0.08);
                            const vx0 = Math.cos(dir) * vmag;
                            const vy0 = Math.sin(dir) * vmag;
                            const bubble = { el: img, x: startX, y: startY, r: rB, vx: vx0, vy: vy0, alive: true, age: ageCounter++, meta: metaT, kind: 'tiny', scale: 0.01, baseD: dT, createdAt: timeNow() };
                            bubbles.push(bubble);
                            registerVisible(metaT);
                        }
                    }
                } catch (e) {
                    console.error('tiny drizzle error:', e);
                } finally {
                    scheduleTinyDrizzle();
                }
            }, delay);
        }

    function integrateAndCollide() {
        if (!bubbles.length) return;

        // Integrate
        for (const b of bubbles) {
            if (!b.alive) continue;
            // growth for newly spawned
            if (b.scale === undefined) b.scale = 1;
            if (b.baseD === undefined) b.baseD = b.r * 2;
            if (b.createdAt !== undefined && b.scale < 1) {
                const t = Math.max(0, timeNow() - b.createdAt);
                b.scale = Math.min(1, t / GROW_MS);
            }
            // outward radial push
            const dxC = b.x - cx, dyC = b.y - cy;
            const distC = Math.sqrt(dxC*dxC + dyC*dyC) || 1e-6;
            const nxC = dxC / distC, nyC = dyC / distC;
            b.vx += nxC * OUTWARD_ACCEL;
            b.vy += nyC * OUTWARD_ACCEL;
            b.vx = b.vx * FRICTION;
            b.vy = b.vy * FRICTION_Y;
            // clamp overall speed
            {
                const sp2 = b.vx*b.vx + b.vy*b.vy;
                const max2 = MAX_SPEED*MAX_SPEED;
                if (sp2 > max2) {
                    const s = Math.sqrt(sp2) || 1e-6;
                    const k = MAX_SPEED / s;
                    b.vx *= k; b.vy *= k;
                }
            }
            // integrate
            b.x += b.vx;
            b.y += b.vy;
            // Safety: during initial growth phase, prevent slipping out immediately near the boundary
            if (b.createdAt !== undefined && (timeNow() - b.createdAt) < (GROW_MS + 250)) {
                const sc = (b.scale !== undefined ? b.scale : 1);
                const effR = b.r * sc;
                const dx = b.x - cx, dy = b.y - cy;
                const dist = Math.sqrt(dx*dx + dy*dy) || 1e-6;
                if (dist + effR > r * 0.97) {
                    const nx = dx / dist, ny = dy / dist;
                    // damp outward radial velocity strongly
                    const vOut = b.vx * nx + b.vy * ny;
                    if (vOut > 0) {
                        b.vx -= nx * vOut * 0.9;
                        b.vy -= ny * vOut * 0.9;
                    }
                    // small inward nudge
                    b.x -= nx * 0.4;
                    b.y -= ny * 0.4;
                }
            }
        }

        // Collisions
        for (let i = 0; i < bubbles.length; i++) {
            const a = bubbles[i];
            if (!a.alive) continue;
            for (let j = i + 1; j < bubbles.length; j++) {
                const b = bubbles[j];
                if (!b.alive) continue;
                const dx = b.x - a.x, dy = b.y - a.y;
                const ra = (a.r) * (a.scale !== undefined ? a.scale : 1);
                const rb = (b.r) * (b.scale !== undefined ? b.scale : 1);
                const minD = (ra + rb) * SEP_BIAS;
                const dist2 = dx*dx + dy*dy;
                        if (dist2 < minD*minD) {
                    const dist = Math.sqrt(Math.max(1e-6, dist2));
                    const nx = dx / (dist || 1), ny = dy / (dist || 1);
                    const impulse = COLLISION_IMPULSE;
                    a.vx -= nx * impulse * 0.5; a.vy -= ny * impulse * 0.5;
                    b.vx += nx * impulse;       b.vy += ny * impulse;
                    // no directional floor
                            // Softer positional correction
                            const overlap = minD - dist, corr = overlap * 0.22;
                    a.x -= nx * corr; a.y -= ny * corr;
                    b.x += nx * corr; b.y += ny * corr;
                            // Mild damping to reduce jarring after contact
                            a.vx *= POST_COLLISION_SOFTEN; a.vy *= POST_COLLISION_SOFTEN;
                            b.vx *= POST_COLLISION_SOFTEN; b.vy *= POST_COLLISION_SOFTEN;
                            // Clamp vertical velocity
                            // Clamp vertical velocity
                            a.vy = Math.max(-MAX_VY, Math.min(MAX_VY, a.vy));
                            b.vy = Math.max(-MAX_VY, Math.min(MAX_VY, b.vy));
                            // Clamp overall speed post-collision
                            {
                                const spa2 = a.vx*a.vx + a.vy*a.vy;
                                const spb2 = b.vx*b.vx + b.vy*b.vy;
                                const max2 = MAX_SPEED*MAX_SPEED;
                                if (spa2 > max2) {
                                    const s = Math.sqrt(spa2) || 1e-6; const k = MAX_SPEED / s; a.vx *= k; a.vy *= k;
                                }
                                if (spb2 > max2) {
                                    const s = Math.sqrt(spb2) || 1e-6; const k = MAX_SPEED / s; b.vx *= k; b.vy *= k;
                                }
                            }
                }
            }
        }

    // Big eligibility disabled

        // Despawn after fully clearing outside the circle on any side (with margin),
        // but never before a short grace period so new bubbles don't vanish instantly.
    for (const b of bubbles) {
            if (!b.alive) continue;
            const effR = b.r * (b.scale !== undefined ? b.scale : 1);
            const dx = b.x - cx, dy = b.y - cy;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const ageMs = (b.createdAt !== undefined) ? (timeNow() - b.createdAt) : Infinity;
            const grownEnough = (b.scale === undefined) || (b.scale >= 0.98);
            if (grownEnough && ageMs >= MIN_LIVE_MS && dist > r + effR * 2.2) { // margin scaled a bit higher
                b.alive = false;
                if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el);
        unregisterVisible(b.meta);
            }
        }

        // Write
        for (const b of bubbles) {
            if (!b.alive) continue;
            const sc = (b.scale !== undefined ? b.scale : 1);
            const dNow = (b.baseD !== undefined ? b.baseD : (b.r * 2)) * sc;
            b.el.setAttribute('width', dNow.toFixed(3));
            b.el.setAttribute('height', dNow.toFixed(3));
            b.el.setAttribute('x', (b.x - (b.r * sc)).toFixed(3));
            b.el.setAttribute('y', (b.y - (b.r * sc)).toFixed(3));
        }
    }

    // Load and classify sources, then seed and start animation
    (async () => {
        try {
            await loadAndClassify();
        } catch (err) {
            console.warn('loadAndClassify failed:', err);
        }
        // Seed normals, then tinies (tinies depend on normal count)
        seedInitialBubbles();
        // Big seeding disabled for center-flow
        // Run tiny seeding on next frame so DOM nodes exist and sizes are set
        await new Promise(requestAnimationFrame);
        seedInitialTinyBubbles();
        scheduleNextSpawn();
        scheduleTinyDrizzle();
        let timer = setInterval(integrateAndCollide, TICK_MS);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (timer) { clearInterval(timer); timer = null; }
            } else {
                // Resume integration loop when tab becomes visible again
                if (!timer) timer = setInterval(integrateAndCollide, TICK_MS);
            }
        });
    })();
});

// Instrument level panel toggle (right-side twirl out)
document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('instrumentLevelPanel');
    const toggle = document.getElementById('instrumentLevelToggle');
    if (!panel || !toggle) return;
    const applyState = (collapsed) => {
        panel.classList.toggle('is-collapsed', collapsed);
        toggle.textContent = collapsed ? '‹' : '›';
    };
    applyState(false);
    toggle.addEventListener('click', () => {
        const next = !panel.classList.contains('is-collapsed');
        applyState(next);
    });
});





