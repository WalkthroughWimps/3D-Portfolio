import {TAU} from './winding.js';

export const V9_NAMES = Object.freeze(['clock-drive', ...Array.from({length: 9}, (_, i) => `clock-minute-${i + 1}`),
  ...Array.from({length: 6}, (_, i) => `clock-second-${i + 1}`), 'clock-ring']);

export function validateSpiralManifest(manifest, scene) {
  if (manifest?.version !== 9 || manifest.mountNode !== 'clock-fixed-mount' || !scene.getObjectByName(manifest.mountNode))
    throw new Error('Clock V9 manifest or fixed mount is missing');
  const pivots = new Map();
  for (const name of V9_NAMES) {
    const pivot = scene.getObjectByName(name), data = manifest.nodes?.[name];
    if (!pivot || !data || !Number.isFinite(data.basePhase) || !Number.isFinite(data.inputFactor))
      throw new Error(`Clock V9 pivot or phase is missing: ${name}`);
    pivots.set(name, pivot);
  }
  const adapter = manifest.handAdapter;
  if (adapter?.ringNode !== 'clock-ring' || ![adapter.grooveRadius, adapter.frontY, adapter.handY].every(Number.isFinite))
    throw new Error('Clock V9 hand adapter is incomplete');
  return pivots;
}

export function spiralMotion(date, manifest, visualSeconds = date.getTime() / 1000) {
  // The decorative train can run faster while the ring remains at wall time.
  const seconds = date.getTime() / 1000;
  const input = visualSeconds * TAU / manifest.inputPeriodSeconds;
  const angles = Object.fromEntries(V9_NAMES.filter(name => name !== 'clock-ring').map(name =>
    [name, (manifest.nodes[name].basePhase + manifest.nodes[name].inputFactor * input) % TAU]));
  // The specified 60-second ring is an independent wall-time drive; the
  // exported simple train's 0.4 input factor cannot provide that ratio.
  angles['clock-ring'] = seconds * TAU / manifest.ringTargetPeriodSeconds % TAU;
  return {angles, input: input % TAU, ring: angles['clock-ring']};
}
