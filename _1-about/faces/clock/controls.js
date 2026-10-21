import {getSharedSettings} from '../../../_7-shared-scripts/core/settings.js';
import {initPanelShell} from '../../../debug/panel-shell.js';

const kinds = ['hour', 'minute', 'second'];
const field = key => `about.clock.${key}`;
const slider = (kind, key, label, min, max, step) => `<label>${label} <output data-clock-value="${kind}${key}"></output><input data-setting="${field(`${kind}${key}`)}" type="range" min="${min}" max="${max}" step="${step}" aria-label="${kind} hand ${label.toLowerCase()}"></label>`;
const styles = [['baton','Baton'],['tapered','Tapered'],['skeleton','Skeleton'],['slim-arrow','Slim arrow · modern'],['chevron','Chevron · modern'],['art-deco','Art deco · vintage'],['spade','Spade · ornate'],['breguet','Breguet · vintage'],['rocket','Rocket split arrow · futuristic']];

/** Face-owned settings content; backing switches remain pinned by the shell. */
export function createClockControls({onChange, onWind, onResetTime, onFocus, secondsLocked = false} = {}) {
  const store = getSharedSettings(), events = new AbortController();
  const root = document.createElement('div'); root.className = 'clock-settings';
  root.innerHTML = `<input type="hidden" data-setting="${field('timeOffsetSeconds')}"><input type="hidden" data-setting="${field('markerPhase')}"><section class="clock-settings-intro"><h3>Clock time</h3><p data-clock-time></p><p data-clock-offset></p><p data-clock-announcement class="clock-visually-hidden" role="status" aria-live="polite"></p><div class="clock-actions"><button type="button" data-clock-focus>Focus clock</button><button type="button" data-clock-wind="-1">${secondsLocked ? '−1 minute' : '−5 seconds'}</button><button type="button" data-clock-wind="1">${secondsLocked ? '+1 minute' : '+5 seconds'}</button><button type="button" data-clock-reset-time>Reset to browser time</button></div>${secondsLocked ? '<p>Drag the hour or minute hand to set time. Seconds and the gear train stay synchronized with your computer; only the hands use a whole-minute offset.</p>' : ''}</section>
    <section><h3>Seconds groove</h3><label><input type="checkbox" data-setting="${field('showGroove')}"> Show groove</label><label>Groove color <input type="color" data-setting="${field('grooveColor')}"></label><p>${secondsLocked ? 'You can drag the seconds baton to preview a position. It returns to computer seconds on release.' : 'Drag the seconds baton around the groove to wind the clock. A clockwise third-turn winds the displayed time back 20 seconds.'}</p></section>
    ${kinds.map((kind, i) => `<section><h3>${kind[0].toUpperCase() + kind.slice(1)} hand</h3><label><input type="checkbox" data-setting="${field(`${kind}Visible`)}"> Show ${kind} hand</label><label>Style <select data-setting="${field(`${kind}Style`)}">${styles.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>${slider(kind, 'Length', 'Length', i === 2 ? .04 : i === 1 ? .45 : .18, i === 2 ? .55 : i === 1 ? .82 : .7, .01)}${slider(kind, 'Girth', 'Girth', .008, .07, .002)}<label>Color <input type="color" data-setting="${field(`${kind}Color`)}"></label>${kind === 'minute' && secondsLocked ? '<p>The minute hand begins beyond the hour hand, leaving its inner reach clear.</p>' : ''}</section>`).join('')}
    <button type="button" data-clock-reset-hands>Reset hands</button>`;
  const unregister = initPanelShell().registerContext('clock', 'Clock', root);
  const fields = [...root.querySelectorAll('[data-setting]')];
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
  }, {immediate: true});
  root.addEventListener('input', event => {
    const control = event.target.closest('[data-setting]');
    if (!control || !root.contains(control)) return;
    const path = control.dataset.setting;
    const value = control.type === 'checkbox' ? control.checked : control.type === 'range' ? Number(control.value) : control.value;
    if (secondsLocked && path === field('hourLength')) {
      const current = store.get().about.clock.minuteLength, minimum = Number((value + .06).toFixed(3));
      store.patch({[path]: value, [field('minuteLength')]: Math.max(current, minimum)});
    } else if (secondsLocked && path === field('minuteLength')) {
      store.patch({[path]: Math.max(value, Number((store.get().about.clock.hourLength + .06).toFixed(3)))});
    } else store.patch({[path]: value});
  }, {signal: events.signal});
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-clock-wind')) onWind?.(secondsLocked ? Number(button.dataset.clockWind) : Number(button.dataset.clockWind) * 5);
    if (button.hasAttribute('data-clock-focus')) onFocus?.();
    if (button.hasAttribute('data-clock-reset-time')) onResetTime?.();
    if (button.hasAttribute('data-clock-reset-hands')) store.reset(fields.filter(node => !/timeOffsetSeconds|markerPhase|showGroove|grooveColor/.test(node.dataset.setting)).map(node => node.dataset.setting));
  }, {signal: events.signal});
  let lastSecond = null, lastOffset = null;
  return {root, show(date, offset) {
    const second = Math.floor(date.getTime() / 1000), roundedOffset = secondsLocked ? String(offset / 60) : offset.toFixed(1);
    if (second !== lastSecond) {root.querySelector('[data-clock-time]').textContent = `Displayed time: ${date.toLocaleTimeString()}`; lastSecond = second;}
    if (roundedOffset !== lastOffset) {root.querySelector('[data-clock-offset]').textContent = secondsLocked ? `Hand offset: ${offset >= 0 ? '+' : ''}${roundedOffset} minutes` : `Browser offset: ${offset >= 0 ? '+' : ''}${roundedOffset} seconds`; lastOffset = roundedOffset;}
  }, announce(message) {root.querySelector('[data-clock-announcement]').textContent = message;},
  dispose() {stop(); events.abort(); unregister(); root.remove();}};
}
