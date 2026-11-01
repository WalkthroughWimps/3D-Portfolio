import * as THREE from 'three';
import { mountCollapsibleSections } from '../_7-shared-scripts/panel-assembly/CollapsibleSections.mjs';

const NAMES = ['Drawer_TL', 'Drawer_TR', 'Drawer_BL', 'Drawer_BR'];
const FRONT = new THREE.Vector3(.5, 0, -.8660254).normalize();
const DURATION = 260;

export function createDeskDrawers(desk, { reducedMotion, canInteract, controlsHost }) {
  const entries = new Map();
  desk.updateWorldMatrix(true, true);
  for (const name of NAMES) {
    const object = desk.getObjectByName(name);
    if (!object?.parent) continue;
    let near = Infinity, far = -Infinity;
    object.traverse(mesh => {
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const along = new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld).dot(FRONT);
        near = Math.min(near, along); far = Math.max(far, along);
      }
    });
    const depth = far - near;
    const travel = Math.min(.28, Math.max(0, depth * .8));
    const parent = object.parent;
    const origin = new THREE.Vector3().setFromMatrixPosition(parent.matrixWorld);
    const fallbackDelta = parent.worldToLocal(origin.clone().addScaledVector(FRONT, travel)).sub(parent.worldToLocal(origin.clone()));
    const sourceOffset = object.userData?.docsDrawerOffset;
    const localDelta = Array.isArray(sourceOffset) && sourceOffset.length === 3 && sourceOffset.every(Number.isFinite)
      ? new THREE.Vector3(...sourceOffset) : fallbackDelta;
    entries.set(name, { object, rest: object.position.clone(), delta: localDelta, value: 0, target: 0, from: 0, started: 0 });
  }

  const container = document.createElement('details');
  container.className = 'docs-drawer-controls';
  const summary = document.createElement('summary'); summary.textContent = 'Desk drawers'; container.append(summary);
  for (const [name, entry] of entries) {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = `${name.endsWith('TL') ? 'Top left' : name.endsWith('TR') ? 'Top right' : name.endsWith('BL') ? 'Bottom left' : 'Bottom right'} drawer`;
    button.setAttribute('aria-label', `Open ${button.textContent}`);
    button.setAttribute('aria-pressed', 'false');
    entry.button = button;
    container.append(button);
    button.addEventListener('click', () => { if (canInteract()) toggle(entry); });
  }
  controlsHost.append(container);
  const folds = mountCollapsibleSections(container, { headings: false, reorder: false, scope: 'docs:drawers' });
  function update(now = performance.now()) {
    for (const entry of entries.values()) {
      if (entry.value === entry.target) continue;
      if (reducedMotion()) {
        entry.value = entry.target;
        entry.object.position.copy(entry.rest).addScaledVector(entry.delta, entry.value);
        continue;
      }
      const t = Math.min(1, (now - entry.started) / DURATION);
      const eased = t * t * (3 - 2 * t);
      entry.value = entry.from + (entry.target - entry.from) * eased;
      entry.object.position.copy(entry.rest).addScaledVector(entry.delta, entry.value);
      if (t === 1) entry.value = entry.target;
    }
  }
  function toggle(entry) {
    update();
    entry.from = entry.value;
    entry.target = entry.target ? 0 : 1;
    entry.started = performance.now();
    if (reducedMotion()) { entry.value = entry.target; entry.object.position.copy(entry.rest).addScaledVector(entry.delta, entry.value); }
    entry.button?.setAttribute('aria-pressed', String(!!entry.target));
    entry.button?.setAttribute('aria-label', `${entry.target ? 'Close' : 'Open'} ${entry.button.textContent}`);
  }
  function fromHit(object) {
    for (let node = object; node; node = node.parent) if (entries.has(node.name) && entries.get(node.name).object === node) return entries.get(node.name);
    return null;
  }
  return { update, toggleHit(object) { const entry = fromHit(object); if (!entry || !canInteract()) return false; toggle(entry); return true; },
    dispose() { folds.dispose(); container.remove(); for (const entry of entries.values()) entry.object.position.copy(entry.rest); entries.clear(); } };
}
