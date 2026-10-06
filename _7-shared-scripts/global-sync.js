// One browser/device offset for every page. Positive delays audio.
import { getSharedSettings } from './core/settings.js';
export const SYNC_KEY = 'site.audio.sync';
export function snapSyncMs(value) {
 const n = Number(value);
 return Math.max(-3000, Math.min(3000, Math.round((Number.isFinite(n) ? n : 0) / 5) * 5));
}
export function getSyncOffsetMs() { return getSharedSettings().get().audio.syncMs; }
export function setSyncOffsetMs(ms) {
 const value = snapSyncMs(ms);
 getSharedSettings().patch({ audio: { syncMs: value } });
 if(window.siteConfig) window.siteConfig.audioSyncMs = value;
 return value;
}
let lastValue = getSyncOffsetMs();
getSharedSettings().subscribe((snapshot, change) => {
 if (!change.changed.includes('audio.syncMs')) return;
 window.dispatchEvent(new CustomEvent('syncOffsetChanged', { detail: { offsetMs: snapshot.audio.syncMs, previousMs: lastValue, source: change.source } }));
 lastValue = snapshot.audio.syncMs;
});
function initSlider() {
 const slider=document.getElementById('syncOffset'), label=document.getElementById('syncOffsetValue');
 if(!slider) return;
 slider.step='5';
 const update=()=>{slider.value=getSyncOffsetMs(); if(label) label.textContent=slider.value+' ms';};
 slider.addEventListener('input', ()=>{setSyncOffsetMs(slider.value); update();});
 window.addEventListener('syncOffsetChanged', update); update();
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initSlider); else initSlider();
window.getSyncOffsetMs=getSyncOffsetMs;
window.setSyncOffsetMs=setSyncOffsetMs;
