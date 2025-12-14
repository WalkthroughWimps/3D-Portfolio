// global-sync.js
// Provides persistent audio/MIDI sync offset utilities across pages.
// Offset semantics: Positive offset (ms) delays AUDIO relative to MIDI.
// Negative offset starts AUDIO earlier (MIDI delayed by |offset|).

const OFFSET_KEY = 'globalAudioMidiOffsetMs';
const DEFAULT_OFFSET = 0;

export function getSyncOffsetMs(){
  const v = localStorage.getItem(OFFSET_KEY);
  return v!==null ? parseInt(v,10)||0 : DEFAULT_OFFSET;
}

export function setSyncOffsetMs(ms){
  if(typeof ms !== 'number' || !isFinite(ms)) return;
  ms = Math.max(-3000, Math.min(3000, Math.round(ms))); // clamp
  localStorage.setItem(OFFSET_KEY, String(ms));
  window.dispatchEvent(new CustomEvent('syncOffsetChanged', { detail:{ offsetMs: ms }}));
}

// Page helper to auto-wire slider if present
function initSlider(){
  const slider = document.getElementById('syncOffset');
  const label = document.getElementById('syncOffsetValue');
  if(!slider || !label) return;
  const initial = getSyncOffsetMs();
  slider.value = initial;
  label.textContent = initial + ' ms';
  const DEAD_ZONE = 25; // ms within which we snap to 0
  slider.addEventListener('input', ()=>{
    const v = parseInt(slider.value,10) || 0;
    if(Math.abs(v) <= DEAD_ZONE){
      label.textContent = '0 ms';
    } else {
      label.textContent = v + ' ms';
    }
  });
  slider.addEventListener('change', ()=>{
    let v = parseInt(slider.value,10) || 0;
    if(Math.abs(v) <= DEAD_ZONE){ v = 0; slider.value = '0'; }
    setSyncOffsetMs(v);
  });
  window.addEventListener('syncOffsetChanged', e=>{
    const ms = e.detail.offsetMs;
    slider.value = ms;
    label.textContent = ms + ' ms';
  });
}

document.addEventListener('DOMContentLoaded', initSlider);

// Expose on window for non-module scripts if needed
window.getSyncOffsetMs = getSyncOffsetMs;
window.setSyncOffsetMs = setSyncOffsetMs;
