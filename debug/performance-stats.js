import {frameBudget} from './performance-budget.js';

const renderers = new Set(), budgets = new Map();
let activeSamplers = 0;
export const isPerformanceSamplingActive = () => activeSamplers > 0;

// Owners supply cheap, read-only snapshots; polled only while Debug is visible.
export function trackPerformanceBudget(name, sample) {
  const token = Symbol(name); budgets.set(token, {name, sample});
  return () => budgets.delete(token);
}

/** Optional renderer detail; the shared sampler also works on pages without WebGL. */
export function trackPerformanceRenderer(renderer) {
  renderers.add(renderer);
  return () => renderers.delete(renderer);
}

export function mountPerformanceStats(parent, isOpen) {
  const section = document.createElement('section'); section.className = 'live-performance';
  section.innerHTML = '<h3>Live performance</h3><p>Browser frame timing · updates twice a second while Debug is open.</p><dl></dl><canvas width="360" height="48" aria-label="Recent frame times"></canvas>';
  const fields = ['Frame target', 'Adaptive limit', 'Slow intervals', 'Browser FPS', 'Frame time', '95th percentile', 'Long tasks', 'JS heap', 'DOM nodes', 'Canvas pixels', 'Draw calls', 'Triangles', 'GPU resources'];
  const values = new Map();
  for (const label of fields) { const term = document.createElement('dt'), value = document.createElement('dd'); term.textContent = label; value.textContent = '—'; values.set(label, value); section.querySelector('dl').append(term, value); }
  const details = document.createElement('div'); section.append(details);
  const providers = new Map();
  function providerReport() {
    for (const [token, node] of providers) if (!budgets.has(token)) { node.remove(); providers.delete(token); }
    for (const [token, source] of budgets) {
      let node = providers.get(token);
      if (!node) { node = document.createElement('section'); const heading = document.createElement('h3'); heading.textContent = source.name; node.append(heading, document.createElement('dl')); details.append(node); providers.set(token, node); }
      let rows; try { rows = source.sample(); } catch { rows = {'Metrics': 'Unavailable'}; }
      const list = node.querySelector('dl'), pairs = Object.entries(rows || {});
      if (list.childElementCount !== pairs.length * 2) { list.replaceChildren(); for (let i = 0; i < pairs.length; i++) list.append(document.createElement('dt'), document.createElement('dd')); }
      pairs.forEach(([label, value], i) => { const term = list.children[i * 2], field = list.children[i * 2 + 1]; if (term.textContent !== label) term.textContent = label; const text = String(value); if (field.textContent !== text) field.textContent = text; });
    }
  }
  const note = document.createElement('p'); note.textContent = '60 FPS is a reference target. Frame intervals include browser waiting; they do not measure spare CPU/GPU capacity. Memory values are estimates, not total device usage.'; section.append(note);
  parent.prepend(section);
  const graph = section.querySelector('canvas'), context = graph.getContext('2d');
  let frame = 0, previous = 0, lastReport = 0, samples = [], longTasks = 0, observer = null, disposed = false, sampling = false;
  function report() {
    if (!samples.length) return;
    const stats = frameBudget(samples), average = stats.average;
    const set = (name, value) => { values.get(name).textContent = value; };
    set('Frame target', `${stats.targetMs.toFixed(1)} ms · 60 FPS`);
    set('Adaptive limit', 'Not calibrated');
    set('Slow intervals', `${stats.slow} / ${stats.count} · ${(100 * stats.slow / stats.count).toFixed(0)}% (>20.8 ms)`);
    set('Browser FPS', (1000 / average).toFixed(1)); set('Frame time', `${average.toFixed(1)} ms`); set('95th percentile', `${stats.p95.toFixed(1)} ms`);
    set('Long tasks', String(longTasks));
    set('JS heap', performance.memory ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)} / ${(performance.memory.jsHeapSizeLimit / 1048576).toFixed(0)} MiB (JS limit)` : 'Unavailable');
    set('DOM nodes', document.getElementsByTagName('*').length.toLocaleString());
    set('Canvas pixels', [...document.querySelectorAll('canvas')].reduce((n, c) => n + c.width * c.height, 0).toLocaleString());
    const infos = [...renderers].map(renderer => renderer.info);
    set('Draw calls', infos.length ? infos.reduce((n, info) => n + info.render.calls, 0).toLocaleString() : 'Not instrumented');
    set('Triangles', infos.length ? infos.reduce((n, info) => n + info.render.triangles, 0).toLocaleString() : 'Not instrumented');
    set('GPU resources', infos.length ? `${infos.reduce((n, info) => n + info.memory.geometries, 0)} geometries · ${infos.reduce((n, info) => n + info.memory.textures, 0)} textures` : 'Not instrumented');
    providerReport();
    context.clearRect(0, 0, 360, 48); context.strokeStyle = getComputedStyle(section).getPropertyValue('--settings-secondary').trim() || '#bfe4ff'; context.lineWidth = 1.5; context.beginPath();
    samples.forEach((ms, i) => { const x = i * 360 / Math.max(1, samples.length - 1), y = 48 - Math.min(48, ms / 50 * 48); if (!i) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke();
  }
  function tick(now) {
    frame = 0;
    if (disposed || document.hidden || !isOpen()) { refresh(); return; }
    if (previous) samples.push(now - previous); previous = now;
    if (samples.length > 180) samples.shift();
    if (now - lastReport >= 500) { report(); lastReport = now; }
    frame = requestAnimationFrame(tick);
  }
  function refresh() {
    if (frame) cancelAnimationFrame(frame); frame = 0; previous = 0;
    observer?.disconnect(); observer = null;
    if (sampling) { activeSamplers--; sampling = false; }
    if (disposed || document.hidden || !isOpen()) return;
    activeSamplers++; sampling = true;
    samples = []; longTasks = 0; lastReport = 0;
    if (globalThis.PerformanceObserver?.supportedEntryTypes.includes('longtask')) {
      observer = new PerformanceObserver(entries => { longTasks += entries.getEntries().length; }); observer.observe({type: 'longtask'});
    }
    frame = requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', refresh);
  return {refresh, dispose() { disposed = true; refresh(); document.removeEventListener('visibilitychange', refresh); section.remove(); }};
}
