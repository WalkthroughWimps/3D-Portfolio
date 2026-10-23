import {initPanelShell} from '../../debug/panel-shell.js';
import {getSharedSettings} from '../../_7-shared-scripts/core/settings.js';
import {ABOUT_FACES} from '../../_7-shared-scripts/core/settings-schema.js';

const labels = ABOUT_FACES;
const field = name => `about.spheroid.${name}`;
const range = (name, label, min, max, step) => `<label>${label} <output data-spheroid-value="${name}"></output><input type="range" aria-label="${label}" data-setting="${field(name)}" min="${min}" max="${max}" step="${step}"></label>`;

/** Adds controls to existing face tabs, leaving their own controls and listeners intact. */
export function createBackingControls(faces) {
  let events = null, snapshot = null, clockRoot = null, spheroidSection = null;
  const nodes = new Map(), controls = [], added = [], unregister = [];
  const store = getSharedSettings();
  function remember(node, id) {
    if (node && !nodes.has(node)) nodes.set(node, {id, visible: node.visible});
  }
  function sync() {
    if (!snapshot) return;
    for (const [node, {id, visible}] of nodes) node.visible = visible && snapshot.about?.[id]?.showBacking !== false;
    for (const control of controls) {
      const value = control.dataset.setting.split('.').reduce((item, key) => item?.[key], snapshot);
      if (control.type === 'checkbox') control.checked = Boolean(value);
      else if (control.dataset.setting === field('bridgeCount')) {
        const spheroid = snapshot.about?.spheroid || {};
        const directions = spheroid.pattern === 'crossed' ? 2 : 1;
        const maximum = Math.round(spheroid.strands ?? 9) * directions;
        control.max = String(maximum);
        control.value = String(Math.min(value ?? 4, maximum));
      } else control.value = String(value);
      const output = control.parentElement.querySelector('output');
      if (output) output.value = control.dataset.setting === field('bridgeCount') ? `${control.value} of ${control.max} possible` : String(value);
    }
    if (spheroidSection) {
      const independent = snapshot.about?.spheroid?.rotationMode === 'independent';
      spheroidSection.querySelector('[data-independent-rotation]').hidden = !independent;
      spheroidSection.querySelector('[data-shared-rotation]').hidden = independent;
    }
  }
  function bind(root) {
    controls.push(...root.querySelectorAll('[data-setting]'));
    const change = event => {
      const control = event.target.closest('[data-setting]');
      if (!control || !root.contains(control)) return;
      store.patch({[control.dataset.setting]: control.type === 'checkbox' ? control.checked : control.type === 'range' ? Number(control.value) : control.value});
    };
    root.addEventListener('input', change, {signal: events.signal});
    root.addEventListener('change', change, {signal: events.signal});
  }
  function switches(id, label) {
    const row = document.createElement('div');
    row.className = 'face-backing-controls';
    row.innerHTML = `<label><input type="checkbox" data-setting="about.${id}.enabled"> ${label} face</label><label><input type="checkbox" data-setting="about.${id}.showBacking"> ${label} backing</label>`;
    bind(row);
    return row;
  }
  function detach() {
    events?.abort(); events = null;
    for (const [node, {visible}] of nodes) node.visible = visible;
    nodes.clear(); controls.length = 0; clockRoot = null; spheroidSection = null;
    added.splice(0).forEach(node => node.remove());
    unregister.splice(0).reverse().forEach(remove => remove());
  }
  return {
    attach() {
      detach(); events = new AbortController();
      const shell = initPanelShell();
      const style = document.createElement('style');
      // The eight About contexts fit two rows. Keep this face-owned layout local
      // to the cube; other pages keep their existing settings navigation.
      style.textContent = '#review-panels#review-panels .review-settings-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));overflow:visible}#review-panels#review-panels .review-settings-tab{min-width:0;padding:5px 6px}';
      style.textContent += `.spheroid-lattice-controls{margin:0 0 8px;padding:7px;border:1px solid #697985;border-radius:8px}.spheroid-lattice-controls summary{font-weight:700;cursor:pointer}.spheroid-lattice-controls label{display:block;margin:6px 0}.spheroid-lattice-controls input[type=range]{display:block;width:100%;margin-top:4px}.spheroid-lattice-controls output{float:right;color:#9de5f4}.spheroid-lattice-controls p{font-size:.85em;line-height:1.35;opacity:.85}`;
      document.head.append(style); added.push(style);
      for (const [id, label] of Object.entries(labels)) {
        remember(faces.get(id)?.backing, id);
        let section = document.getElementById(`review-settings-context-${id}`);
        if (!section) { section = document.createElement('section'); unregister.push(shell.registerContext(id, label, section)); }
        unregister.push(shell.registerContextControls(id, switches(id, label)));
      }
      const allFaces = document.createElement('section');
      allFaces.className = 'all-face-controls';
      for (const [id, label] of Object.entries(labels)) allFaces.append(switches(id, label));
      allFaces.insertAdjacentHTML('beforeend', '<div class="face-backing-actions"><div class="face-action-stack"><button type="button" data-faces="hide">Hide all faces</button><button type="button" data-faces="show">Show all faces</button></div><div class="face-action-stack"><button type="button" data-backings="hide">Hide all backings</button><button type="button" data-backings="show">Show all backings</button></div></div>');
      allFaces.addEventListener('click', event => {
        const action = event.target.closest('[data-faces],[data-backings]');
        if (!action) return;
        const facesAction = action.hasAttribute('data-faces');
        const field = facesAction ? 'enabled' : 'showBacking';
        const shown = (facesAction ? action.dataset.faces : action.dataset.backings) === 'show';
        store.patch(Object.fromEntries(Object.keys(labels).map(face => [`about.${face}.${field}`, shown])));
      }, {signal: events.signal});
      unregister.push(shell.registerContext('faces', 'Faces', allFaces));
      const lattice = document.querySelector('#review-settings-context-skills [data-panel="Lattice"]');
      if (lattice) {
        const section = document.createElement('details'); section.open = true;
        section.className = 'spheroid-lattice-controls'; spheroidSection = section;
        section.innerHTML = `<summary>Spheroid lattice</summary><p>Energy woven behind the Skills bowl. Hide its backing to see the lattice from the Skills face as well as from inside the cube.</p>
          <label><input type="checkbox" data-setting="${field('enabled')}"> Show spheroid lattice</label>
          <label>Spiral pattern <select data-setting="${field('pattern')}" aria-label="Spiral pattern"><option value="crossed">Crossed spirals</option><option value="ascending">Ascending spiral</option><option value="descending">Descending spiral</option></select></label>
          <label>Energy color <select data-setting="${field('color')}" aria-label="Energy color"><option value="cyan">Ice blue &amp; copper</option><option value="amber">Amber &amp; ivory</option><option value="violet">Violet &amp; rose</option></select></label>
          ${range('strands', 'Strands per direction', 4, 18, 1)}${range('turns', 'Spiral turns', .5, 3, .05)}${range('glow', 'Lattice glow', 0, 1, .05)}${range('speed', 'Energy speed', 0, 1, .02)}
          <h3>Spiral rotation</h3><label>Rotation mode <select data-setting="${field('rotationMode')}" aria-label="Spiral rotation mode"><option value="together">Together</option><option value="independent">Independently</option></select></label>
          <div data-shared-rotation><label>Direction <select data-setting="${field('rotationDirection')}" aria-label="Shared spiral rotation direction"><option value="counterclockwise">Counterclockwise</option><option value="clockwise">Clockwise</option></select></label>${range('rotationSpeed', 'Speed (turns/s)', 0, .25, .005)}</div>
          <div data-independent-rotation hidden><h4>Ascending spiral</h4><label>Direction <select data-setting="${field('ascendingRotationDirection')}" aria-label="Ascending spiral direction"><option value="counterclockwise">Counterclockwise</option><option value="clockwise">Clockwise</option></select></label>${range('ascendingRotationSpeed', 'Speed (turns/s)', 0, .25, .005)}
          <h4>Descending spiral</h4><label>Direction <select data-setting="${field('descendingRotationDirection')}" aria-label="Descending spiral direction"><option value="counterclockwise">Counterclockwise</option><option value="clockwise">Clockwise</option></select></label>${range('descendingRotationSpeed', 'Speed (turns/s)', 0, .25, .005)}</div>
          <h3>Control-arm energy bridge</h3><label><input type="checkbox" data-setting="${field('bridgeEnabled')}"> Show zap bridges to spiral origins</label>${range('bridgeCount', 'Total zap beams', 1, 36, 1)}${range('bridgeGlow', 'Bridge glow', 0, 1.5, .05)}${range('bridgeSpeed', 'Zap speed', 0, 3, .05)}
          <h3>Rear projection shape</h3><label><input type="checkbox" data-setting="${field('rearPullEnabled')}"> Bend rear spiral rings toward Skills arm</label>${range('rearPull', 'Pull spiral backs toward arm (m)', 0, .08, .002)}${range('rearPullInfluence', 'Pull influence radius (m)', .10, .85, .01)}<p>The influence radius controls how far from the rear crown the bend extends; the pull controls its strength. Rotation pauses with reduced motion. The origin bridges follow the rotating spirals; speaker vibration follows the backing surface.</p>`;
        lattice.prepend(section); added.push(section); bind(section);
      }
      sync();
    },
    // The Clock loads asynchronously and owns a second, private backing in its asset.
    update() {
      const next = faces.get('clock')?.runtime?.root;
      if (next && next !== clockRoot) {
        clockRoot = next;
        next.traverse(node => { if (/private[ _](?:navy[ _])?backing/i.test(node.name)) remember(node, 'clock'); });
        sync();
      }
    },
    applySettings(next) { snapshot = next; sync(); },
    detach, dispose: detach
  };
}
