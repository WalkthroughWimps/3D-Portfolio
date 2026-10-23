import {getSharedSettings} from '../../../_7-shared-scripts/core/settings.js';
import {initPanelShell} from '../../../debug/panel-shell.js';
import {FINISHES, readFinishes} from './gear-appearance.js';

const kinds = ['hour', 'minute', 'second'];
const field = key => `about.clock.${key}`;
const slider = (kind, key, label, min, max, step) => `<label>${label} <output data-clock-value="${kind}${key}"></output><input data-setting="${field(`${kind}${key}`)}" type="range" min="${min}" max="${max}" step="${step}" aria-label="${kind} hand ${label.toLowerCase()}"></label>`;
const styles = [['baton','Baton'],['tapered','Tapered'],['skeleton','Skeleton'],['slim-arrow','Slim arrow · modern'],['chevron','Chevron · modern'],['art-deco','Art deco · vintage'],['spade','Spade · ornate'],['breguet','Breguet · vintage'],['rocket','Rocket split arrow · futuristic']];

/** Face-owned settings content; backing switches remain pinned by the shell. */
export function createClockControls({onChange, onWind, onResetTime, onFocus, secondsLocked = false} = {}) {
  const store = getSharedSettings(), events = new AbortController();
  const root = document.createElement('div'); root.className = 'clock-settings';
  root.innerHTML = `<input type="hidden" data-setting="${field('timeOffsetSeconds')}"><input type="hidden" data-setting="${field('markerPhase')}"><input type="hidden" data-setting="${field('gearFinishes')}"><section class="clock-settings-intro"><h3>Clock time</h3><p data-clock-time></p><p data-clock-offset></p><p data-clock-announcement class="clock-visually-hidden" role="status" aria-live="polite"></p><div class="clock-actions"><button type="button" data-clock-focus>Focus clock</button><button type="button" data-clock-wind="-1">${secondsLocked ? '−1 minute' : '−5 seconds'}</button><button type="button" data-clock-wind="1">${secondsLocked ? '+1 minute' : '+5 seconds'}</button><button type="button" data-clock-reset-time>Reset to browser time</button></div>${secondsLocked ? '<p>Drag the hour or minute hand to set the displayed time. Hands and the seconds ring follow your computer; the gear train uses the visual speed below.</p>' : ''}</section>
    ${secondsLocked ? `<section class="clock-gear-settings"><h3>Gear motion and finish</h3><label>Gear speed <select data-setting="${field('gearSpeed')}"><option value="1">Real time · 1×</option><option value="30">Calm · 30×</option><option value="60">Display · 60×</option><option value="120">Lively · 120×</option><option value="150">Ring matched · 150×</option></select></label><p data-clock-motion></p><p>The gear train is visual. At 150×, its ratio matches the computer-synced 60-second ring; hands stay at clock time.</p><label>Finish target <select data-clock-gear-target><option value="all">All gears</option><option value="clock-drive">Rear drive</option>${Array.from({length: 9}, (_, i) => `<option value="clock-minute-${i + 1}">Minute spiral ${i + 1}</option>`).join('')}${Array.from({length: 6}, (_, i) => `<option value="clock-second-${i + 1}">Second spiral ${i + 1}</option>`).join('')}<option value="clock-ring">Seconds ring</option></select></label><label>Finish preset <select data-clock-gear-preset><option value="brass">Brass</option><option value="steel">Brushed steel</option><option value="copper">Copper</option><option value="antique">Antique dark</option><option value="custom">Custom</option></select></label><label>Color <input type="color" data-clock-gear-color></label><label>Metalness <output data-clock-metal-value></output><input type="range" min="0" max="1" step=".01" data-clock-gear-metalness></label><label>Roughness <output data-clock-rough-value></output><input type="range" min="0" max="1" step=".01" data-clock-gear-roughness></label><button type="button" data-clock-clear-override>Clear this gear’s override</button></section>` : ''}
    <section><h3>Seconds groove</h3><label><input type="checkbox" data-setting="${field('showGroove')}"> Show groove</label><label>Groove color <input type="color" data-setting="${field('grooveColor')}"></label><p>${secondsLocked ? 'You can drag the seconds baton to preview a position. It returns to computer seconds on release.' : 'Drag the seconds baton around the groove to wind the clock. A clockwise third-turn winds the displayed time back 20 seconds.'}</p></section>
    ${kinds.map((kind, i) => `<section><h3>${kind[0].toUpperCase() + kind.slice(1)} hand</h3><label><input type="checkbox" data-setting="${field(`${kind}Visible`)}"> Show ${kind} hand</label><label>Style <select data-setting="${field(`${kind}Style`)}">${styles.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>${slider(kind, 'Length', 'Length', i === 2 ? .04 : i === 1 ? .45 : .18, i === 2 ? .55 : i === 1 ? .82 : .7, .01)}${slider(kind, 'Girth', 'Girth', .008, .07, .002)}<label>Color <input type="color" data-setting="${field(`${kind}Color`)}"></label>${kind === 'minute' && secondsLocked ? '<p>The minute hand begins beyond the hour hand, leaving its inner reach clear.</p>' : ''}</section>`).join('')}
    <button type="button" data-clock-reset-hands>Reset hands</button>`;
  const unregister = initPanelShell().registerContext('clock', 'Clock', root);
  const fields = [...root.querySelectorAll('[data-setting]')];
  const target = root.querySelector('[data-clock-gear-target]');
  const gearControl = key => root.querySelector(`[data-clock-gear-${key}]`);
  function showFinish() {
    if (!target) return;
    const entries = readFinishes(store.get().about.clock.gearFinishes);
    const entry = entries[target.value] || (target.value !== 'all' && entries.all) || {preset: 'brass'};
    const preset = FINISHES[entry.preset] || FINISHES.brass;
    gearControl('preset').value = entry.preset;
    gearControl('color').value = entry.color || preset.color;
    gearControl('metalness').value = entry.metalness ?? preset.metalness;
    gearControl('roughness').value = entry.roughness ?? preset.roughness;
    root.querySelector('[data-clock-metal-value]').value = gearControl('metalness').value;
    root.querySelector('[data-clock-rough-value]').value = gearControl('roughness').value;
    root.querySelector('[data-clock-clear-override]').hidden = target.value === 'all' || !entries[target.value];
  }
  function setFinish(value) {
    const entries = readFinishes(store.get().about.clock.gearFinishes);
    if (target.value === 'all') {
      for (const key of Object.keys(entries)) delete entries[key];
      entries.all = value;
    } else entries[target.value] = value;
    store.patch({[field('gearFinishes')]: JSON.stringify(entries)});
  }
  const stop = store.subscribe(snapshot => {
    const settings = snapshot.about.clock;
    const minute = root.querySelector('[data-setting="about.clock.minuteLength"]');
    if (secondsLocked) minute.min = String(Number((settings.hourLength + .06).toFixed(3)));
    for (const control of fields) {
      const key = control.dataset.setting.split('.').at(-1), value = settings[key];
      if (control.type === 'checkbox') control.checked = Boolean(value);
      else control.value = String(value);
      const output = control.parentElement.querySelector('output');
      if (output) output.value = typeof value === 'number' ? value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : String(value);
    }
    onChange?.(settings);
    showFinish();
  }, {immediate: true});
  root.addEventListener('input', event => {
    if (target && event.target.matches('[data-clock-gear-color], [data-clock-gear-metalness], [data-clock-gear-roughness]')) {
      setFinish({preset: 'custom', color: gearControl('color').value, metalness: Number(gearControl('metalness').value), roughness: Number(gearControl('roughness').value)});
      return;
    }
    const control = event.target.closest('[data-setting]');
    if (!control || !root.contains(control)) return;
    const path = control.dataset.setting;
    const value = control.type === 'checkbox' ? control.checked : control.type === 'range' || path === field('gearSpeed') ? Number(control.value) : control.value;
    if (secondsLocked && path === field('hourLength')) {
      const current = store.get().about.clock.minuteLength, minimum = Number((value + .06).toFixed(3));
      store.patch({[path]: value, [field('minuteLength')]: Math.max(current, minimum)});
    } else if (secondsLocked && path === field('minuteLength')) {
      store.patch({[path]: Math.max(value, Number((store.get().about.clock.hourLength + .06).toFixed(3)))});
    } else store.patch({[path]: value});
  }, {signal: events.signal});
  root.addEventListener('change', event => {
    if (event.target === target) showFinish();
    if (event.target === gearControl('preset')) {
      const chosen = gearControl('preset').value;
      const base = FINISHES[chosen] || {color: gearControl('color').value, metalness: Number(gearControl('metalness').value), roughness: Number(gearControl('roughness').value)};
      setFinish({preset: chosen, ...base});
    }
  }, {signal: events.signal});
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-clock-wind')) onWind?.(secondsLocked ? Number(button.dataset.clockWind) : Number(button.dataset.clockWind) * 5);
    if (button.hasAttribute('data-clock-focus')) onFocus?.();
    if (button.hasAttribute('data-clock-reset-time')) onResetTime?.();
    if (button.hasAttribute('data-clock-reset-hands')) store.reset(fields.filter(node => /(?:hour|minute|second)(?:Visible|Style|Length|Girth|Color)$/.test(node.dataset.setting)).map(node => node.dataset.setting));
    if (button.hasAttribute('data-clock-clear-override') && target) {
      const entries = readFinishes(store.get().about.clock.gearFinishes);
      delete entries[target.value]; store.patch({[field('gearFinishes')]: JSON.stringify(entries)});
    }
  }, {signal: events.signal});
  let lastSecond = null, lastOffset = null;
  return {root, show(date, offset) {
    const second = Math.floor(date.getTime() / 1000), roundedOffset = secondsLocked ? String(offset / 60) : offset.toFixed(1);
    if (second !== lastSecond) {root.querySelector('[data-clock-time]').textContent = `Displayed time: ${date.toLocaleTimeString()}`; lastSecond = second;}
    if (roundedOffset !== lastOffset) {root.querySelector('[data-clock-offset]').textContent = secondsLocked ? `Hand offset: ${offset >= 0 ? '+' : ''}${roundedOffset} minutes` : `Browser offset: ${offset >= 0 ? '+' : ''}${roundedOffset} seconds`; lastOffset = roundedOffset;}
  }, setContrast(value) {root.style.setProperty('--clock-contrast-strength', String(value));},
  showMotion(message) {const status = root.querySelector('[data-clock-motion]'); if (status) status.textContent = `Motion: ${message}`;},
  announce(message) {root.querySelector('[data-clock-announcement]').textContent = message;},
  dispose() {stop(); events.abort(); unregister(); root.remove();}};
}
