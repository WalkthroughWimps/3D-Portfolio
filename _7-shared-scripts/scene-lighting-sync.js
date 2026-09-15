import { localPreferences } from './local-preferences.js';
// scene-lighting-sync.js
// Stores a normalized (0..1) scene lighting value for use across pages.

const LIGHTING_KEY = 'site.scene.lighting';
const DEFAULT_VALUE = 1;
const MIN_LIGHT_RATIO = 0.05;
const MAX_LIGHT_RATIO = 0.95;

export function getSceneLightingValue(){
  const raw = localPreferences.getItem(LIGHTING_KEY);
  const parsed = parseFloat(raw);
  if(!Number.isFinite(parsed)){
    try{ localPreferences.setItem(LIGHTING_KEY, String(DEFAULT_VALUE)); }catch(e){}
    return DEFAULT_VALUE;
  }
  return Math.max(0, Math.min(1, parsed));
}

export function setSceneLightingValue(value){
  const parsed = Number(value);
  if(!Number.isFinite(parsed)) return getSceneLightingValue();
  const next = Math.max(0, Math.min(1, parsed));
  localPreferences.setItem(LIGHTING_KEY, String(next));
  window.dispatchEvent(new CustomEvent('sceneLightingChanged', { detail: { value: next }}));
  return next;
}

export function getLightScaleForValue(value){
  const v = Math.max(0, Math.min(1, Number(value)));
  return MIN_LIGHT_RATIO + (MAX_LIGHT_RATIO - MIN_LIGHT_RATIO) * v;
}

export { DEFAULT_VALUE, MIN_LIGHT_RATIO, MAX_LIGHT_RATIO };
