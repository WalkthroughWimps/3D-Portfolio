export const SCHEMA_VERSION = 1;
export const A11Y_KEY = 'site.a11y.settings';
export const SCHEMA_KEY = 'site.settings.schemaVersion';
const numeric = (min, max, snap = false) => value => {
  if (value === null || value === undefined || value === '' || (typeof value === 'string' && !value.trim())) return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const clamped = Math.max(min, Math.min(max, n));
  return snap ? Math.round(clamped / 5) * 5 : clamped;
};
const bool = value => value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined;
const choice = (...values) => value => values.includes(value) ? value : undefined;
export const SETTINGS_FIELDS = Object.freeze({
  'audio.volume': { key: 'site.audio.volume', legacy: ['a11y:masterVolume'], default: 0.25, parse: numeric(0, 1) },
  'audio.muted': { key: 'site.audio.muted', legacy: ['a11y:mute'], default: false, parse: bool },
  'audio.syncMs': { key: 'site.audio.sync', legacy: ['globalAudioMidiOffsetMs', 'a11y:audioSyncMs'], default: -270, parse: numeric(-3000, 3000, true) },
  'audio.preservePitch': { key: 'site.audio.preservePitch', default: false, parse: bool },
  'accessibility.reducedMotion': { key: A11Y_KEY, prop: 'reducedMotion', default: null, parse: bool },
  'accessibility.highContrast': { key: A11Y_KEY, prop: 'highContrast', default: false, parse: bool },
  'accessibility.textScale': { key: A11Y_KEY, prop: 'textScale', default: 1, parse: numeric(1, 1.25) },
  'accessibility.focusOutline': { key: A11Y_KEY, prop: 'focusOutline', default: 'auto', parse: choice('auto', 'always') },
  'scene.lighting': { key: 'site.scene.lighting', default: null, parse: numeric(0, 1) },
  'start.animationAllowed': { key: 'site.start.animation.allowed', default: null, parse: bool },
  'media.syncDrag': { key: 'video-sync-unlimited-drag', default: null, parse: choice('enabled', 'disabled') },
  'media.tabletFocus': { key: 'video.tablet.focus', default: false, parse: bool },
  'start.contrast': { key: 'site.contrast.value', default: 0.5, parse: numeric(0, 1) },
  'start.brightness': { key: 'site.start.brightness', default: 0.5, parse: numeric(0, 1) },
  'start.backgroundContrast': { key: 'site.start.background.contrast', default: 0.5, parse: numeric(0, 1) },
  'start.look.underlight': { key: 'site.start.look.underlight', default: 0.65, parse: numeric(0, 3) },
  'start.look.speakerPurple': { key: 'site.start.look.speaker-purple', default: 0.65, parse: numeric(0, 3) },
  'music.masterGain': { key: 'music.instrument.master', default: 0.85, parse: numeric(0.2, 3) }
});
export const SETTINGS_KEYS = new Set([SCHEMA_KEY, A11Y_KEY, ...Object.values(SETTINGS_FIELDS).flatMap(field => [field.key, ...(field.legacy || []).filter(key => !key.startsWith('a11y:'))])]);
export function flattenPatch(input, prefix = '') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const values = {};
  for (const [name, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (SETTINGS_FIELDS[path]) values[path] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = flattenPatch(value, path);
      if (nested === null) return null;
      Object.assign(values, nested);
    } else values[path] = value;
  }
  return values;
}
