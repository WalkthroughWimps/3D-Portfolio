// One browser/device offset for every page. Positive delays audio.
import { localPreferences } from './local-preferences.js';
export const SYNC_KEY = 'site.audio.sync';
export function snapSyncMs(value) {
 const n = Number(value);
 return Math.max(-3000, Math.min(3000, Math.round((Number.isFinite(n) ? n : 0) / 5) * 5));
}
export function getSyncOffsetMs() {
 const raw = localPreferences.getItem(SYNC_KEY) ?? localPreferences.getItem('globalAudioMidiOffsetMs') ?? '-270';
 const value = snapSyncMs(raw);
 if(localPreferences.getItem(SYNC_KEY) !== String(value)) localPreferences.setItem(SYNC_KEY, String(value));
 return value;
}
export function setSyncOffsetMs(ms) {
 const value = snapSyncMs(ms), previous = getSyncOffsetMs();
 localPreferences.setItem(SYNC_KEY, String(value));
 if(window.siteConfig) window.siteConfig.audioSyncMs = value;
 if(previous !== value) window.dispatchEvent(new CustomEvent('syncOffsetChanged', {detail:{offsetMs:value, previousMs:previous}}));
 return value;
}
window.addEventListener('storage', event => {
 if(event.key === SYNC_KEY || event.key === null) window.dispatchEvent(new CustomEvent('syncOffsetChanged', {detail:{offsetMs:getSyncOffsetMs(), source:'other-tab'}}));
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
