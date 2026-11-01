import {REFS_EXPORTED_DEFAULTS} from './exported-defaults.js';

export const REFS_DOOR_IDS = Object.freeze(['leftBay', 'rightBay', 'leftCrescent',
  'rightCrescent', 'leftArch', 'rightArch', 'plaque']);

export const REFS_DEFAULT_DOORS = Object.freeze(Object.fromEntries(REFS_DOOR_IDS.map(id =>
  [id, Object.freeze({...REFS_EXPORTED_DEFAULTS.doors[id]})])));

const oneOf = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
export function normalizeRefsDoors(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.fromEntries(REFS_DOOR_IDS.map(id => {
    const prior = REFS_DEFAULT_DOORS[id];
    const candidate = source[id] && typeof source[id] === 'object' && !Array.isArray(source[id]) ? source[id] : {};
    const type = oneOf(candidate.type, ['hinged', 'rotating', 'none'], prior.type);
    const hinge = oneOf(candidate.hinge, ['left', 'right', 'top', 'bottom'], prior.hinge);
    const axis = oneOf(candidate.axis, ['vertical', 'horizontal'], prior.axis);
    const direction = oneOf(candidate.direction, type === 'rotating' ?
      ['clockwise', 'counterclockwise'] : ['out', 'in'], type === 'rotating' ?
      (prior.direction === 'counterclockwise' ? 'counterclockwise' : 'clockwise') : 'out');
    const numeric = Number(candidate.angle);
    const angle = Number.isFinite(numeric) ? Math.max(5, Math.min(type === 'rotating' ? 180 : 135, numeric)) : prior.angle;
    return [id, {type, hinge, axis, direction, angle,
      open: typeof candidate.open === 'boolean' ? candidate.open : prior.open}];
  }));
}
