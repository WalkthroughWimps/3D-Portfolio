import { getSharedSettings } from './core/settings.js';
// scene-lighting-sync.js
// Stores a normalized (0..1) scene lighting value for use across pages.

const DEFAULT_VALUE = 1;
const MIN_LIGHT_RATIO = 0.05;
const MAX_LIGHT_RATIO = 0.95;

export function getSceneLightingValue(fallback = DEFAULT_VALUE){
  return getSharedSettings().get().scene.lighting ?? fallback;
}

export function setSceneLightingValue(value){
  const parsed = Number(value);
  if(!Number.isFinite(parsed)) return getSceneLightingValue();
  const next = Math.max(0, Math.min(1, parsed));
  getSharedSettings().patch({ scene: { lighting: next } });
  return next;
}

export function getLightScaleForValue(value){
  const v = Math.max(0, Math.min(1, Number(value)));
  return MIN_LIGHT_RATIO + (MAX_LIGHT_RATIO - MIN_LIGHT_RATIO) * v;
}

export { DEFAULT_VALUE, MIN_LIGHT_RATIO, MAX_LIGHT_RATIO };
let previousValue = getSceneLightingValue();
getSharedSettings().subscribe((snapshot, change) => {
  if (!change.changed.includes('scene.lighting')) return;
  const value = snapshot.scene.lighting ?? DEFAULT_VALUE;
  window.dispatchEvent(new CustomEvent('sceneLightingChanged', { detail: { value, previous: previousValue, source: change.source } }));
  previousValue = value;
});
