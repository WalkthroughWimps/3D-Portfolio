import { GUIDES, ROLLERS, HOLES, gearGeometry, rollerFor, rollerProfile, snapGuide, visibleGearPhase, guideTrack, gearInteraction, pinPositions, gearSizing, independentGearSetup, fitGearSetup } from './gear-model.js';
function guideIcon(id) { const t = guideTrack(id), points = Array.from({ length: 129 }, (_, i) => t.at(i / 128 * t.length)); return `<svg viewBox="-1.3 -1.3 2.6 2.6" aria-hidden="true"><path d="${points.map((p, i) => `${i ? 'L' : 'M'}${(p.x / t.radius).toFixed(3)},${(p.y / t.radius).toFixed(3)}`).join('')}Z"/></svg>`; }
const key = (label, shortcut) => `${label}<kbd>${shortcut}</kbd>`;
export function createGearPanel({ getDocument, editable, mutate, repaint, trace, getStyle, onActivate = () => {}, getSnaps = () => ({ enabled: true, pane: true }) }) {
  const panel = document.createElement('section'); panel.className = 'notes-gears'; panel.hidden = true; panel.setAttribute('aria-label', 'Gear art');
  panel.innerHTML = `<header><h2>Gear art</h2></header>
    <div class="notes-gear-content"><section class="notes-gear-section" aria-label="Large gear controls"><h3>Large gear</h3><div class="notes-gear-guides" role="group" aria-label="Large guide">${GUIDES.map(g => `<button type="button" draggable="true" data-guide="${g.id}" title="${g.label}" aria-pressed="false">${guideIcon(g.id)}<span>${g.label.replace('Rounded ','')}</span></button>`).join('')}</div>
    <label class="notes-range"><span>Large size</span><output data-gear-size-output></output><input aria-label="Large gear size" title="Large gear size (Y)" aria-keyshortcuts="Y" type="range" min="24" max="205" value="192" data-gear-size></label>
    <div class="notes-gear-presets" role="group" aria-label="Guide size presets"><button type="button" data-gear-fit="pane" title="Fit pane (F8 switches presets)">Fit pane</button><button type="button" data-gear-fit="compact" title="Compact (F8 switches presets)">Compact</button></div>
    <label class="notes-gear-check"><input type="checkbox" data-gear-inside>Roll inside<kbd>I</kbd></label></section>
    <section class="notes-gear-section notes-small-gear" aria-label="Small gear controls"><h3>Small gear</h3><div class="notes-gear-rollers" role="group" aria-label="Small gear">${ROLLERS.map(r => `<button type="button" draggable="true" data-roller="${r.id}" aria-pressed="false"><svg viewBox="-1.5 -1.5 3 3" aria-hidden="true"><path d="${rollerProfile(r).outline.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(3)},${p.y.toFixed(3)}`).join('')}Z"/></svg><span>${r.label}</span></button>`).join('')}</div>
    <label class="notes-range"><span>Small size</span><output data-small-size-output></output><input aria-label="Small gear size" title="Small gear size (Shift+Y)" aria-keyshortcuts="Shift+Y" type="range" min="8" max="80" value="37" data-small-size></label>
    <div class="notes-gear-pinmap" role="group" aria-label="Drawing pin hole"><svg viewBox="-1.35 -1.35 2.7 2.7" aria-hidden="true"><path data-pin-outline/></svg>${pinPositions(1).map((p,i)=>`<button type="button" data-hole="${p.hole}" aria-label="Pin ${i+1}" aria-pressed="false" title="Pin ${i+1} (${(i+1)%10})" style="left:${50+p.x/2.7*100}%;top:${50+p.y/2.7*100}%">${(i+1)%10}</button>`).join('')}</div><output class="notes-gear-pin-readout" data-pin-readout>Choose a pin in the small gear</output></section>
    <label class="notes-range"><span>Auto speed</span><output data-gear-speed-output>50</output><input aria-label="Auto draw speed" type="range" min="10" max="100" value="50" data-gear-speed></label>
    <label class="notes-gear-check"><input type="checkbox" data-gear-preview checked>Pattern preview<kbd>J</kbd></label>
    <progress max="1" value="0" aria-label="Gear trace progress"></progress><output class="notes-gear-progress" aria-live="polite">Ready</output>
    <div class="notes-gear-actions"><button type="button" data-gear-action="auto">${key('Auto draw', 'Space')}</button><button type="button" data-gear-action="finish">${key('Finish now', 'Ctrl+Enter')}</button><button type="button" data-gear-action="keep">${key('Keep partial', 'Enter')}</button><button type="button" data-gear-action="reset">${key('Restart', 'Shift+R')}</button></div>
    <button type="button" data-gear-action="remove">${key('Remove setup', 'Shift+Del')}</button></div>`;
  let opened = false, running = false, progress = 0, drag = null, speed = .5, preview = true, cached = null, cachedKey = '', activeLayer = '', savedPartial = false, placement = null, snap = null, hoverKind = 'none', hoverPoint = null;
  const controller = new AbortController();
  let mechanicalCache = null, mechanicalKey = '';
  const previewCanvas = document.createElement('canvas'); previewCanvas.width = previewCanvas.height = 1000;
  let previewKey = '',pinMapKey='';
  function drawPreview(ctx, geom, style) {
    const key = `${cachedKey}:${style.stroke}:${style.strokeWidth}`;
    if (previewKey !== key) { const image = previewCanvas.getContext('2d'); image.clearRect(0, 0, 1000, 1000); image.lineJoin = image.lineCap = 'round'; image.globalAlpha = .17; line(image, geom.points, style.stroke || '#80e6ef', Math.max(1.5, style.strokeWidth)); previewKey = key; }
    ctx.drawImage(previewCanvas, 0, 0);
  }
  const storedSetup = () => getDocument().gears?.find(s => s.layerId === getDocument().activeLayer);
  const setup = () => placement || storedSetup();
  function geometry() { const s = setup(); if (!s) return null; const signature = JSON.stringify(s); if (signature !== cachedKey) { cachedKey = signature; cached = gearGeometry(s); } return cached; }
  function ensure() {
    if (setup() || !editable()) return;
    mutate(() => { const doc = getDocument(); doc.gears ||= []; doc.gears.push(fitGearSetup({ layerId: doc.activeLayer, guide: 'circle', roller: 'circle-32', teeth: 32, smallTeeth:37, hole: .9, inside: true, layout: 'pane', phase: 0, x: 500, y: 500, scale: 1 })); });
  }
  function reset() { progress = 0; running = false; drag = null; placement = null; snap = null; savedPartial = false; }
  function change(values) {
    if (!editable()) return; opened = true; onActivate(); ensure(); reset();
    mutate(() => {
      const s=storedSetup();let next={...independentGearSetup(s),...values};
      if('guide' in values) {next.largeTeeth=guideTrack(next.guide).teeth;next.smallTeeth=37;next=fitGearSetup(next);if('x' in values)Object.assign(next,{x:values.x,y:values.y});}
      else if('layout' in values)next=fitGearSetup(next,values.layout==='compact');
      else {const {largeTeeth,smallTeeth}=gearSizing(next);Object.assign(next,{largeTeeth,smallTeeth});}
      Object.assign(s,next);if(Object.keys(values).some(k=>k!=='hole'))s.phase=visibleGearPhase(s);
    }); update(); repaint();
  }
  function update() {
    if (activeLayer !== getDocument().activeLayer) { activeLayer = getDocument().activeLayer; reset(); }
    const s = setup(), enabled = editable(), canDraw = enabled && Boolean(s) && Boolean(getStyle().stroke) && getDocument().objects.length < 300;
    panel.querySelectorAll('[data-guide]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.guide === s?.guide)); b.disabled = !enabled; });
    panel.querySelectorAll('[data-roller]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.roller === (s && rollerFor(s).id))); b.disabled = !enabled; });
    panel.querySelectorAll('[data-gear-fit]').forEach(b => { b.disabled = !enabled || !s; });
    panel.querySelectorAll('[data-hole]').forEach(b => { b.setAttribute('aria-pressed', String(Number(b.dataset.hole) === s?.hole)); b.disabled = !enabled; });
    const inside = panel.querySelector('[data-gear-inside]'); inside.disabled = !enabled || !s; inside.checked = Boolean(s?.inside);
    const sizing=s?gearSizing(independentGearSetup(s)):null;
    for(const [selector,field,low,high,output]of [['[data-gear-size]','largeTeeth','minLarge','maxLarge','[data-gear-size-output]'],['[data-small-size]','smallTeeth','minSmall','maxSmall','[data-small-size-output]']]) {
      const slider=panel.querySelector(selector);slider.disabled=!enabled||!s;slider.min=sizing?.[low]??8;slider.max=sizing?.[high]??80;
      if(document.activeElement!==slider)slider.value=sizing?.[field]??37;
      panel.querySelector(output).textContent=(sizing?.[field]??37)+' teeth';
    }
    const mapKey=(s?rollerFor(s).id:'circle-32')+':'+(sizing?.smallTeeth??32);
    if(mapKey!==pinMapKey) {
      pinMapKey=mapKey;const profile=rollerProfile(s?rollerFor(s):ROLLERS[1]),count=(sizing?.smallTeeth??32)*4;
      const outline=Array.from({length:count+1},(_,i)=>{const p=profile.atArc(i/count*profile.length),tooth=i%4<2?.035:-.025;return `${i?'L':'M'}${(p.x+tooth*Math.cos(p.normal)).toFixed(3)},${(p.y+tooth*Math.sin(p.normal)).toFixed(3)}`;}).join('')+'Z';
      panel.querySelector('[data-pin-outline]').setAttribute('d',outline);
    }
    panel.querySelector('[data-pin-readout]').textContent=s?`Pin ${HOLES.indexOf(s.hole)+1} · ${geometry().laps} laps · small gear up to ${sizing.maxSmall} teeth`:'Choose a pin in the small gear';
    panel.querySelector('progress').value = progress;
    const status = !enabled ? 'Pane hidden or locked' : !getStyle().stroke ? 'Choose a stroke color' : getDocument().objects.length >= 300 ? 'Object limit reached' : !s ? 'Choose a guide' : progress >= 1 ? savedPartial ? 'Partial trace · saved to pane' : 'Complete · saved to pane' : progress > 0 ? `${Math.round(progress * 100)}% · ${geometry().laps} guide lap${geometry().laps === 1 ? '' : 's'}` : 'Drag the gear to trace';
    const output = panel.querySelector('.notes-gear-progress'); if (output.textContent !== status) output.textContent = status;
    const auto = panel.querySelector('[data-gear-action="auto"]'); auto.disabled = !canDraw; const autoLabel = key(running ? 'Pause' : progress > 0 && progress < 1 ? 'Resume' : 'Auto draw', 'Space'); if (auto.innerHTML !== autoLabel) auto.innerHTML = autoLabel;
    panel.querySelector('[data-gear-action="finish"]').disabled = !canDraw;
    panel.querySelector('[data-gear-action="keep"]').disabled = !canDraw || progress <= 0 || progress >= 1;
    panel.querySelector('[data-gear-action="reset"]').disabled = !s || progress <= 0;
    panel.querySelector('[data-gear-action="remove"]').disabled = !enabled || !s;
  }
  function commit(partial = false) {
    const geom = geometry(); if (!geom || !editable() || !getStyle().stroke || getDocument().objects.length >= 300) return false;
    const points = partial ? geom.points.slice(0, Math.max(2, Math.floor(progress * (geom.points.length-1)) + 1)) : geom.points;
    if (trace(points, setup(), !partial)) { running = false; drag = null; progress = 1; savedPartial = partial; update(); repaint(); return true; } return false;
  }
  function advance(amount) { if (progress >= 1) return; progress = Math.min(1, progress + amount); if (progress >= 1) commit(); update(); repaint(); }
  function action(name) {
    if (name === 'close') { finishGesture(true); opened = false; running = false; }
    else if (name === 'auto') { opened = true; onActivate(); ensure(); if (!editable() || !getStyle().stroke || getDocument().objects.length >= 300) return; if (progress >= 1) reset(); running = !running; }
    else if (name === 'finish') { opened = true; onActivate(); ensure(); commit(); }
    else if (name === 'keep' && progress > 0 && progress < 1) commit(true);
    else if (name === 'reset') reset();
    else if (name === 'remove' && editable()) { reset(); mutate(() => { const doc = getDocument(); doc.gears = (doc.gears || []).filter(s => s.layerId !== doc.activeLayer); }); }
    update(); repaint();
  }
  panel.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.guide) change({ guide: button.dataset.guide, inside: true });
    else if (button.dataset.roller) { const r = ROLLERS.find(r => r.id === button.dataset.roller); change({ roller: r.id, teeth: r.teeth, smallTeeth:r.teeth }); }
    else if (button.dataset.gearFit) change({ layout: button.dataset.gearFit });
    else if (button.dataset.hole) change({ hole: Number(button.dataset.hole) });
    else if (button.dataset.gearAction) action(button.dataset.gearAction);
  }, { signal: controller.signal });
  panel.addEventListener('change', event => {
    if (event.target.matches('[data-gear-inside]')) change({ inside: event.target.checked });
    if (event.target.matches('[data-gear-preview]')) { preview = event.target.checked; repaint(); }
    if (event.target.matches('[data-gear-size]')) change({ largeTeeth: Number(event.target.value) });
    if (event.target.matches('[data-small-size]')) change({ smallTeeth: Number(event.target.value) });
  }, { signal: controller.signal });
  panel.addEventListener('input', event => {
    if (event.target.matches('[data-gear-size]')) panel.querySelector('[data-gear-size-output]').textContent = event.target.value+' teeth';
    if (event.target.matches('[data-small-size]')) panel.querySelector('[data-small-size-output]').textContent = event.target.value+' teeth';
    if (event.target.matches('[data-gear-speed]')) { speed = Number(event.target.value) / 100; panel.querySelector('[data-gear-speed-output]').textContent = event.target.value; }
  }, { signal: controller.signal });
  panel.addEventListener('dragstart', event => {
    const button = event.target.closest('[data-guide],[data-roller]'); if (!button) return;
    event.dataTransfer.setData('application/x-notes-gear', JSON.stringify(button.dataset.guide ? { guide: button.dataset.guide } : { roller: button.dataset.roller })); event.dataTransfer.effectAllowed = 'copy';
  }, { signal: controller.signal });
  function placed(point) {
    const dx = point.x - 500, dy = point.y - 500, factor = Math.min(1, 496 / (Math.hypot(dx, dy) || 1));
    const bounded = { x: 500 + dx * factor, y: 500 + dy * factor };
    const snaps = getSnaps(); snap = snaps.enabled && snaps.pane ? snapGuide(bounded, snap?.id) : null; return snap ? { x: snap.x, y: snap.y } : bounded;
  }
  function drop(point, values) {
    if (!editable()) return false;
    if (GUIDES.some(g => g.id === values.guide)) change({ guide: values.guide, inside: true, ...placed(point) });
    else { const roller = ROLLERS.find(r => r.id === values.roller) || ROLLERS.find(r => r.teeth === values.teeth); if (!roller) return false; change({ roller: roller.id, teeth: roller.teeth }); }
    return true;
  }
  function pointerDown(point) {
    if (!opened) return false; if (!editable()) return true; ensure(); const geom = geometry(); if (!geom) return true;
    const pose = geom.pose(progress), hit = gearInteraction(geom, setup(), point, progress), onRoller = hit === 'trace';
    if (hit === 'none') return false; hoverKind = hit;
    running = false;
    if (onRoller) {
      const nearest = pose.pins.map(p => ({ ...p, distance: Math.hypot(point.x - p.x, point.y - p.y) })).sort((a, b) => a.distance - b.distance)[0];
      if (progress === 0 && nearest.distance < 11) change({ hole: nearest.hole });
      if (progress >= 1) reset();
      drag = { kind: 'trace', last: point, travel: 0, startProgress: progress };
    } else {
      drag = { kind: 'place', origin: point, setup: { ...storedSetup() }, startProgress: progress };
      placement = { ...storedSetup() }; snap = snapGuide(placement);
    }
    update(); repaint(); return true;
  }
  function setHover(point) {
    hoverPoint = point;
    const next = drag?.kind === 'place' ? 'place' : drag?.kind === 'trace' ? 'trace' : opened && editable() && setup() ? gearInteraction(geometry(), setup(), point, progress) : 'none';
    if (next !== hoverKind) { hoverKind = next; repaint(); }
  }
  function pointerMove(point) {
    if (!drag || !point || !editable()) return;
    if (drag.kind === 'place') {
      const position = placed({ x: drag.setup.x + point.x - drag.origin.x, y: drag.setup.y + point.y - drag.origin.y });
      placement = { ...drag.setup, ...position }; placement.phase = visibleGearPhase(placement); progress = 0; savedPartial = false;
      repaint(); return;
    }
    if (!getStyle().stroke) return;
    const length = Math.hypot(point.x - drag.last.x, point.y - drag.last.y); drag.last = point; drag.travel += length;
    if (drag.travel > 10) advance(Math.min(length, 90) * 3 / geometry().total);
  }
  function finishGesture(cancel) {
    if (drag?.kind === 'place') {
      const next = placement; placement = null;
      if (!cancel && (next.x !== drag.setup.x || next.y !== drag.setup.y)) mutate(() => Object.assign(storedSetup(), next));
    }
    if (cancel && drag) progress = drag.startProgress;
    drag = null; snap = null; update(); repaint();
  }
  function mechanicalPaths() {
    const geom = geometry(), s = setup(); if (!geom || !s) return null;
    const key = `${cachedKey}:${progress}`; if (key === mechanicalKey) return mechanicalCache;
    const pose = geom.pose(progress);
    const guide = Array.from({ length: geom.track.teeth * 4 + 1 }, (_, i) => { const p = geom.track.at(i / (geom.track.teeth * 4) * geom.track.length), tooth = i % 4 < 2 ? 3 : -2; return { x: s.x + p.x + tooth * Math.cos(p.normal), y: s.y + p.y + tooth * Math.sin(p.normal) }; });
    guide.push(guide[0]);
    const roller = Array.from({ length: geom.teeth * 4 + 1 }, (_, i) => { const p = geom.profile.atArc(i / (geom.teeth * 4) * geom.profile.length), tooth = i % 4 < 2 ? 2.5 : -2; return pose.world({ x: p.x + tooth * Math.cos(p.normal), y: p.y + tooth * Math.sin(p.normal) }); });
    roller.push(roller[0]); mechanicalKey = key; mechanicalCache = { guide, roller, pose, geom }; return mechanicalCache;
  }
  function line(ctx, points, color, width, limit = points.length) { if (limit < 2) return; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (let i = 1; i < limit; i++) ctx.lineTo(points[i].x, points[i].y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
  function render(ctx, unit) {
    if (!opened || !setup() || !getDocument().layers.find(l => l.id === setup().layerId)?.visible) return;
    const { geom, pose, guide, roller } = mechanicalPaths(), s = setup(), style = getStyle();
    ctx.save(); ctx.lineJoin = ctx.lineCap = 'round';
    if (preview) drawPreview(ctx, geom, style);
    if (progress > 0 && progress < 1) line(ctx, geom.points, style.stroke || '#80e6ef', style.strokeWidth, Math.max(2, Math.floor(progress * (geom.points.length-1)) + 1));
    ctx.lineWidth = 3;
    for (const [points, fill, color] of [[guide, hoverKind === 'place' ? '#b7fff32b' : '#80e6ef0c', hoverKind === 'place' ? '#c7fff2' : '#a8eaf080'], [roller, hoverKind === 'trace' ? '#b7fff338' : '#abf1ed19', '#c1f8f0']]) {
      ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = color; ctx.stroke();
    }
    const pinRadius=Math.min(4,geom.radius*.055);
    pose.pins.forEach((p, i) => { ctx.beginPath(); ctx.arc(p.x, p.y, p.hole === s.hole ? pinRadius*1.4 : pinRadius, 0, Math.PI * 2); ctx.fillStyle = p.hole === s.hole ? (style.stroke || '#ffe1b0') : '#162a35'; ctx.fill(); ctx.stroke(); if (p.hole === s.hole) { ctx.fillStyle = '#e7ffff'; ctx.font = '14px system-ui'; ctx.fillText(String(i + 1), p.x + 8, p.y - 5); } });
    if (drag?.kind === 'place' && getSnaps().enabled && getSnaps().pane) {
      ctx.save(); ctx.strokeStyle = '#c7fff2'; ctx.fillStyle = '#c7fff2'; ctx.lineWidth = unit * .2;
      const targets = [{ x: 500, y: 500 }, ...Array.from({ length: 8 }, (_, i) => ({ x: 500 + 492 * Math.cos(i * Math.PI / 4), y: 500 + 492 * Math.sin(i * Math.PI / 4) }))];
      targets.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, unit * .6, 0, Math.PI * 2); ctx.stroke(); });
      if (snap) { const p = { x: 500 + (snap.x - 500) * .94, y: 500 + (snap.y - 500) * .94 }; ctx.beginPath(); ctx.arc(p.x, p.y, unit, 0, Math.PI * 2); ctx.stroke(); ctx.font = `${unit}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(snap.label, p.x, p.y - unit * 1.4); }
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(pose.center.x, pose.center.y, 3, 0, Math.PI * 2); ctx.fillStyle = '#b9f4eb'; ctx.fill(); ctx.restore();
  }
  function keydown(event) {
    const k = event.key.toLowerCase();
    if (!event.ctrlKey && !event.metaKey && !event.altKey && k === 'g') { opened = !opened; running = false; drag = null; if (opened) ensure(); update(); repaint(); return true; }
    if (!opened) return false;
    const digit = /^Digit[0-9]$/.test(event.code) ? event.code.slice(-1) : '';
    const s = setup();
    if (!event.altKey && !event.ctrlKey && !event.metaKey && ['[', ']'].includes(k)) {
      const index = GUIDES.findIndex(g => g.id === s?.guide), g = GUIDES[(index + (k === ']' ? 1 : GUIDES.length - 1)) % GUIDES.length]; change({ guide: g.id, inside: true });
    }
    else if (!event.altKey && !event.ctrlKey && !event.metaKey && [',', '.'].includes(k)) {
      const index = ROLLERS.findIndex(r => r.id === (s && rollerFor(s).id)), r = ROLLERS[(index + (k === '.' ? 1 : ROLLERS.length - 1)) % ROLLERS.length]; change({ roller: r.id, teeth: r.teeth, smallTeeth:r.teeth });
    }
    else if (!event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && digit) change({ hole: HOLES[(Number(digit) + 9) % 10] });
    else if (event.key === 'F8') change({ layout: setup()?.layout === 'pane' ? 'compact' : 'pane' });
    else if (!event.ctrlKey && !event.metaKey && !event.altKey && (k === 'y' || k === 'u')) { panel.querySelector(k === 'y' ? event.shiftKey?'[data-small-size]':'[data-gear-size]' : '[data-gear-speed]').focus(); }
    else if (!event.altKey && !event.ctrlKey && !event.metaKey && k === 'i') { if (setup()) change({ inside: !setup().inside }); }
    else if (!event.ctrlKey && !event.metaKey && k === 'j') { preview = !preview; panel.querySelector('[data-gear-preview]').checked = preview; repaint(); }
    else if (event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey) action('auto');
    else if (event.key === 'Enter') action(event.ctrlKey || event.metaKey ? 'finish' : 'keep');
    else if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && k === 'r') action('reset');
    else if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && ['Delete', 'Backspace'].includes(event.key)) action('remove');
    else if (event.key === 'Escape') action('close');
    else return false; return true;
  }
  return { panel, update, render, setHover, pointerDown, pointerMove, finishGesture, keydown, drop, action, reset,
    toggle() { opened = !opened; if (opened) ensure(); else running = false; update(); repaint(); },
    close() { finishGesture(true); opened = false; running = false; update(); repaint(); },
    get paths() { if (!opened || !setup() || !getDocument().layers.find(l => l.id === setup().layerId)?.visible) return []; const paths = mechanicalPaths(); return [{ color: hoverKind === 'place' ? '#c7fff2' : '#a8eaf0', points: paths.guide, mechanical: true }, { color: '#c1f8f0', points: paths.roller, mechanical: true }, ...(progress > 0 && progress < 1 ? [{ color: getStyle().stroke || '#80e6ef', points: paths.geom.points.slice(0, Math.floor(progress * (paths.geom.points.length-1)) + 1) }] : [])]; },
    get cursor() { return !editable() || hoverKind === 'trace' && !getStyle().stroke ? 'blocked' : hoverKind; },
    get open() { return opened; }, get active() { return Boolean(drag); },
    tick(dt, visible) {
      if (opened) setHover(visible ? hoverPoint : null);
      if (activeLayer !== getDocument().activeLayer) { activeLayer = getDocument().activeLayer; reset(); update(); }
      const canRun = visible && opened && editable() && Boolean(getStyle().stroke) && getDocument().objects.length < 300;
      if (running && canRun) advance(Math.min(.05, dt) * (.025 + speed * .15));
      else if (running) { running = false; update(); }
    },
    dispose() { controller.abort(); panel.remove(); cached = null; mechanicalCache = null; previewCanvas.width = previewCanvas.height = 0; }
  };
}
