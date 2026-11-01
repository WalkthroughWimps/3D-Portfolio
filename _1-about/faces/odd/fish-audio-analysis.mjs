/** Source-level motion features. Speech regions come from Silero VAD, not from these features. */
const analyses = new WeakMap();
const FRAME_SECONDS = .02;
let vadPromise = null;
let analysisQueue = Promise.resolve();
const deadline = (work, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  Promise.resolve(work).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});

function script(name) {
  const url = new URL(`./fish-vad/${name}`, import.meta.url).href;
  return new Promise((resolve, reject) => {
    const node = document.createElement('script');
    node.src = url;
    const timer = setTimeout(() => { node.remove(); reject(new Error(`Local voice detector timed out: ${name}`)); }, 10000);
    node.onload = () => { clearTimeout(timer); resolve(); };
    node.onerror = () => { clearTimeout(timer); reject(new Error(`Could not load local voice detector: ${name}`)); };
    document.head.append(node);
  });
}

async function voiceDetector() {
  if (!vadPromise) vadPromise = (async () => {
    if (!globalThis.ort) await script('ort.wasm.min.js');
    if (!globalThis.vad) await script('bundle.min.js');
    const base = new URL('./fish-vad/', import.meta.url).href;
    return deadline(globalThis.vad.NonRealTimeVAD.new({
      modelURL: new URL('silero-vad.bin', base).href,
      ortConfig(ort) { ort.env.wasm.wasmPaths = base; ort.env.wasm.numThreads = 1; }
    }), 20000, 'Local voice detector');
  })();
  return vadPromise;
}

function features(buffer) {
  const pcm = buffer.getChannelData(0), rate = buffer.sampleRate;
  const frameSize = Math.max(1, Math.round(rate * FRAME_SECONDS));
  const count = Math.ceil(pcm.length / frameSize);
  const rms = new Float32Array(count), music = new Float32Array(count);
  let previous = 0;
  for (let frame = 0; frame < count; frame++) {
    const start = frame * frameSize, end = Math.min(pcm.length, start + frameSize);
    let power = 0, crossings = 0, lastCrossing = -1, gapSum = 0, gapSquares = 0, gaps = 0;
    for (let i = start; i < end; i++) {
      const value = pcm[i]; power += value * value;
      if (i > start && value * pcm[i - 1] < 0) {
        crossings++;
        if (lastCrossing >= 0) { const gap = i - lastCrossing; gapSum += gap; gapSquares += gap * gap; gaps++; }
        lastCrossing = i;
      }
    }
    const level = Math.sqrt(power / Math.max(1, end - start));
    rms[frame] = level;
    // Regular zero-crossing spacing suggests a pitched tone; rising energy suggests an onset.
    const variability = gaps > 2 ? Math.max(0, gapSquares / gaps - (gapSum / gaps) ** 2) / ((gapSum / gaps) ** 2 + 1) : 1;
    const tonal = crossings >= 4 && crossings < frameSize * .35 ? Math.max(0, 1 - variability * 2) : 0;
    const onset = Math.max(0, level - previous) / Math.max(.015, level);
    music[frame] = level * Math.min(1.35, .48 + .52 * tonal + .5 * onset);
    previous = level;
  }
  return {rms, music, speech: [], status: 'pending', seconds: buffer.duration};
}

export function analyzeFishSource(buffer, onReady = () => {}) {
  if (!buffer || analyses.has(buffer)) return analyses.get(buffer);
  const result = features(buffer);
  analyses.set(buffer, result);
  analysisQueue = analysisQueue.catch(() => {}).then(async () => {
    try {
      const detector = await voiceDetector();
      // NonRealTimeVAD is stateful. Queue sources so runs never interleave.
      const regions = [];
      for await (const segment of detector.run(buffer.getChannelData(0), buffer.sampleRate)) {
        regions.push([segment.start / 1000, segment.end / 1000]);
      }
      result.speech = regions;
      result.status = 'ready';
    } catch (error) {
      result.status = 'unavailable';
      result.error = String(error?.message || error);
    }
    onReady(result);
  });
  return result;
}

export function fishSourceAt(buffer, seconds) {
  const analysis = analyses.get(buffer);
  if (!analysis || seconds < 0 || seconds >= analysis.seconds) return {voice: 0, music: 0, overall: 0, status: analysis?.status || 'missing'};
  const frame = Math.min(analysis.rms.length - 1, Math.floor(seconds / FRAME_SECONDS));
  const overall = analysis.rms[frame], music = analysis.music[frame];
  const voice = analysis.speech.some(([start, end]) => seconds >= start && seconds < end) ? overall : 0;
  return {voice, music, overall, status: analysis.status};
}

export function fishSourceStatus(buffer) { return analyses.get(buffer)?.status || 'missing'; }
